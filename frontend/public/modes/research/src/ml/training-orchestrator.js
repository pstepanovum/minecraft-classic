// ==============================================================
// FILE: research/src/ml/training/training-orchestrator.js
// ==============================================================

import { DQNAgent } from "../ml/dqn-agent.js";
import { ExperienceReplay } from "./experience-replay.js";
import { StateEncoder } from "../ml/state-encoder.js";
import { NPC_BEHAVIOR } from "../npc/config-npc-behavior.js";
import { NPCVisionSystem } from "../npc/physics/npc-vision-system.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";

// --- Read Adjusted Configuration ---
const REWARD_CONFIG = NPC_BEHAVIOR.ML_TRAINING.REWARDS;
const PHYSICS_CONFIG = NPC_BEHAVIOR.PHYSICS;

class TrainingQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.lastTrainingTime = 0;
    this.trainingInterval = 500;
  }

  async scheduleTraining(agent, memory, stateHistory) {
    this.queue.push({ agent, memory, stateHistory });

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      if (now - this.lastTrainingTime < this.trainingInterval) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            this.trainingInterval - (now - this.lastTrainingTime)
          )
        );
      }

      const { agent, memory, stateHistory } = this.queue.shift();

      if (agent && memory && stateHistory) {
        await agent.train(memory, stateHistory);
      }

      this.lastTrainingTime = Date.now();
    } catch (error) {
      console.error("Training queue processing error:", error);
    } finally {
      this.isProcessing = false;

      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }

  clear() {
    this.queue = [];
  }
}

export class TrainingOrchestrator {
  constructor(npcSystem, hideSeekManager) {
    this.npcSystem = npcSystem;
    this.hideSeekManager = hideSeekManager;

    this.movementController = npcSystem.movementController;

    this.config = NPC_BEHAVIOR.ML_TRAINING;
    this.worldSize = TRAINING_WORLD_CONFIG.SIZE;

    this.seekerAgent = new DQNAgent("seeker");
    this.hiderAgent = new DQNAgent("hider");

    this.seekerMemory = new ExperienceReplay(this.config.MODEL.memorySize);
    this.hiderMemory = new ExperienceReplay(this.config.MODEL.memorySize);

    this.encoder = new StateEncoder();

    this.encoder.chunkManager = this.npcSystem.chunkManager;

    // NOTE: Vision config uses values from HIDE_AND_SEEK.SEEKER
    this.visionSystem = new NPCVisionSystem({
      visionRange: NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.visionRange,
      visionAngle: NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.visionAngle,
      rayCount: 64,
      rayPrecisionAngle: 0.2,
      debug: false,
    });

    this.episode = 0;
    this.globalStep = 0;
    this.metrics = [];

    this.stateHistory = new Map();

    this.actionSize = this.config.MODEL.actionSize;

    this.trainingQueue = new TrainingQueue();

    // Track episode statistics
    this.episodeStats = {
      totalDistanceTraveled: 0,
      uniquePositionsVisited: new Set(),
      jumpsAttempted: 0,
      successfulJumps: 0,
      blocksEncountered: 0,
      explorationScore: 0,
      actionDistribution: new Array(9).fill(0),
      initialJumpsAttempted: new Map(),
      initialSuccessfulJumps: new Map(),
    };
  }

  async initializeAgents() {
    await this.seekerAgent.initialize();
    await this.hiderAgent.initialize();
  }

  async train(episodes, options = { visual: true }) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`STARTING TRAINING: ${episodes} episodes`);
    console.log(`World Size: ${this.worldSize}x${this.worldSize}`);
    console.log(`${"=".repeat(60)}\n`);

    this.trainingStartTime = Date.now();

    for (let i = 0; i < episodes; i++) {
      this.episode++;
      const metrics = await this.runEpisode(options);

      if (metrics) {
        this.metrics.push(metrics);
        this.logDetailedMetrics(metrics);
      }

      this.seekerAgent.decayEpsilon();
      this.hiderAgent.decayEpsilon();

      if (this.episode % this.config.TRAINING.saveFrequency === 0) {
        console.log(`\n--- Checkpoint at episode ${this.episode} ---`);
        await this.downloadModels(this.episode);
        this.exportMetrics(this.episode);
        console.log(`--- Checkpoint complete ---\n`);
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`TRAINING COMPLETE!`);
    console.log(`${"=".repeat(60)}\n`);

    await this.downloadModels(this.episode);
    this.exportMetrics(this.episode);

    console.log(
      `Total training time: ${(
        (Date.now() - this.trainingStartTime) /
        3600000
      ).toFixed(2)} hours`
    );
  }

  //--------------------------------------------------------------//
  //                  Episode Management
  //--------------------------------------------------------------//

  resetEnvironment() {
    // Reset episode statistics
    this.episodeStats = {
      totalDistanceTraveled: 0,
      uniquePositionsVisited: new Set(),
      jumpsAttempted: 0,
      successfulJumps: 0,
      blocksEncountered: 0,
      explorationScore: 0,
      actionDistribution: new Array(9).fill(0),
      initialJumpsAttempted: new Map(),
      initialSuccessfulJumps: new Map(),
    };

    // 1. End previous game and remove NPCs (if any)
    this.hideSeekManager.endGame("episode_reset");
    this.npcSystem.removeAllNPCs();

    // 2. Generate new NPCs, assign roles, and start countdown
    this.npcSystem.generateNPCs();

    const npcs = this.npcSystem.npcs;

    this.stateHistory.clear();
    npcs.forEach((npc) => {
      // CRITICAL: Record current movement stats before episode start
      const stats = this.movementController.getMovementStats(npc.userData.id);
      if (stats) {
        this.episodeStats.initialJumpsAttempted.set(
          npc.userData.id,
          stats.jumpAttempts
        );
        this.episodeStats.initialSuccessfulJumps.set(
          npc.userData.id,
          stats.successfulJumps
        );
      }

      // Initialize history for GRU (5 steps of state vector)
      this.stateHistory.set(
        npc.userData.id,
        Array.from({ length: 5 }, () => Array(this.encoder.stateSize).fill(0))
      );
      // Initialize NPC tracking variables for reward calculation
      npc.lastPosition = npc.position.clone();
      npc.startPosition = npc.position.clone();
      npc.lastDistanceToHider = null;
      npc.lastDistanceToSeeker = null;
      npc.stationaryTime = 0;
      npc.lastAction = null;
      npc.mlControlled = true;
      npc.rewardBuffer = 0;
      npc.lastDistanceMoved = 0;
      npc.jumpCooldown = 0;
      npc.exploredChunks = new Set();
      npc.consecutiveStationary = 0;
      npc.lastHeadingAngle = npc.yaw;
    });

    return npcs;
  }

  /**
   * Run a single episode of the game
   */
  async runEpisode(options) {
    const npcs = this.resetEnvironment();
    const npcMap = new Map(npcs.map((n) => [n.userData.id, n]));

    const episodeStartTime = Date.now();
    let steps = 0;
    let totalReward = 0;
    let done = false;
    let seekerRewardTotal = 0;
    let hiderRewardTotal = 0;

    // Wait for seeking phase
    while (
      this.hideSeekManager.gameState !== NPC_BEHAVIOR.GAME_STATES.SEEKING &&
      steps < 1000
    ) {
      if (!options.visual) {
        this.hideSeekManager.updateGameState();
        await this.sleep(1);
      } else {
        await this.sleep(100);
      }
      steps++;
    }

    if (this.hideSeekManager.gameState !== NPC_BEHAVIOR.GAME_STATES.SEEKING) {
      console.warn("Episode failed to start seeking phase.");
      this.hideSeekManager.endGame("failed_start");
      return null;
    }

    // Main episode loop
    while (!done && steps < this.config.TRAINING.maxStepsPerEpisode) {
      const deltaTime = 0.016;
      const actions = new Map();
      const previousPositions = new Map();

      // 1. Observation and Action Selection
      npcs.forEach((npc) => {
        if (npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) return;

        const currentEnvState = this.getNPCState(npc);
        const stateSequence = this.stateHistory.get(npc.userData.id);

        const action = this.selectAction(npc, stateSequence);
        actions.set(npc.userData.id, {
          actionIndex: action,
          currentEnvState,
        });

        this.episodeStats.actionDistribution[action]++;

        stateSequence.shift();
        stateSequence.push(currentEnvState);

        previousPositions.set(npc.userData.id, npc.position.clone());
      });

      // 2. Action Execution & Physics Update
      if (!options.visual) {
        actions.forEach(({ actionIndex }, npcId) => {
          const npc = npcMap.get(npcId);
          if (npc && npc.hideSeekState !== NPC_BEHAVIOR.GAME_STATES.FOUND) {
            if (actionIndex === 4) {
              this.episodeStats.jumpsAttempted++;
            }

            this.movementController.executeAction(npc, actionIndex, deltaTime);
          }
        });

        // APPLY PHYSICS to ALL NPCs simultaneously
        npcs.forEach((npc) => {
          if (npc.hideSeekState !== NPC_BEHAVIOR.GAME_STATES.FOUND) {
            this.movementController.updatePhysics(npc, deltaTime);
          }
        });

        this.hideSeekManager.update(deltaTime);

        await this.sleep(1);
      } else {
        // Visual mode logic
        actions.forEach(({ actionIndex }, npcId) => {
          const npc = npcMap.get(npcId);
          if (npc && npc.hideSeekState !== NPC_BEHAVIOR.GAME_STATES.FOUND) {
            this.movementController.executeAction(npc, actionIndex, deltaTime);
          }
          const perceptionData = this.visionSystem.getVisionData(
            npc,
            this.npcSystem.npcs
          );
          if (this.visionSystem.debug) {
            this.visionSystem.drawDebugRays(
              npc,
              perceptionData,
              this.npcSystem.scene
            );
          }
        });

        npcs.forEach((npc) => {
          if (npc.hideSeekState !== NPC_BEHAVIOR.GAME_STATES.FOUND) {
            this.movementController.updatePhysics(npc, deltaTime);
          }
        });
        await this.sleep(16);
      }
      let stepReward = 0;
      let isEpisodeOver = false;

      actions.forEach(({ actionIndex, currentEnvState }, npcId) => {
        const npc = npcMap.get(npcId);
        if (!npc) return;

        if (
          npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND &&
          npc.isMoving
        ) {
          npc.isMoving = false;
          return;
        }

        const oldPos = previousPositions.get(npcId);
        if (!oldPos) return;

        // === POST-PHYSICS TRACKING ===
        let distanceMoved = oldPos.distanceTo(npc.position);

        // FIX B: Cap distanceMoved to prevent log lies from NaN/Infinity
        const MAX_MOVE_PER_STEP = PHYSICS_CONFIG.SPRINT_SPEED * deltaTime * 2; // Using SPRINT_SPEED for max possible
        if (distanceMoved > 1.0 || isNaN(distanceMoved)) {
          // 1.0 block is max reasonable
          console.warn(
            `[Metrics] Distance moved in one step capped from ${distanceMoved.toFixed(
              2
            )} to 1.0. (Intended Max: ${MAX_MOVE_PER_STEP.toFixed(4)})`
          );
          distanceMoved = 1.0;
        }

        this.episodeStats.totalDistanceTraveled += distanceMoved;

        // Track unique positions (grid-based)
        const gridPos = `${Math.floor(npc.position.x)},${Math.floor(
          npc.position.z
        )}`;
        this.episodeStats.uniquePositionsVisited.add(gridPos);

        // Track explored chunks
        const chunkX = Math.floor(npc.position.x / 4);
        const chunkZ = Math.floor(npc.position.z / 4);
        const chunkKey = `${chunkX},${chunkZ}`;
        if (!npc.exploredChunks.has(chunkKey)) {
          npc.exploredChunks.add(chunkKey);
          this.episodeStats.explorationScore++;
        }

        // Check if movement was blocked by boundary
        const intendedSpeed =
          this.movementController.getNPCSpeed(npc) * deltaTime;
        npc.boundaryCollision = distanceMoved < intendedSpeed * 0.3;

        // Track if stuck
        if (distanceMoved < 0.01) {
          npc.consecutiveStationary++;
        } else {
          npc.consecutiveStationary = 0;
        }

        const reward = this.calculateImprovedReward(npc, oldPos);
        stepReward += reward;

        // Track rewards by role
        if (npc.role === "seeker") {
          seekerRewardTotal += reward;
        } else {
          hiderRewardTotal += reward;
        }

        const nextEnvState = this.getNPCState(npc);
        const isDone = this.isEpisodeDone(npc);
        const memory =
          npc.role === "seeker" ? this.seekerMemory : this.hiderMemory;

        memory.add({
          state: currentEnvState,
          action: actionIndex,
          reward: reward + npc.rewardBuffer,
          nextState: nextEnvState,
          done: isDone,
          id: npcId,
        });

        npc.rewardBuffer = 0;

        if (isDone) {
          isEpisodeOver = true;
        }

        npc.lastPosition.copy(npc.position);
        npc.lastYaw = npc.yaw;
      });

      totalReward += stepReward;

      this.globalStep++;
      if (this.globalStep % this.config.TRAINING.updateFrequency === 0) {
        await this.trainAgents();
      }

      if (this.globalStep % this.config.TRAINING.targetUpdateFrequency === 0) {
        this.seekerAgent.updateTargetModel();
        this.hiderAgent.updateTargetModel();
      }

      steps++;

      const gameStatus = this.hideSeekManager.getGameStatus();
      if (
        gameStatus.state === NPC_BEHAVIOR.GAME_STATES.GAME_OVER ||
        steps >= this.config.TRAINING.maxStepsPerEpisode
      ) {
        // Apply episode completion bonuses before ending
        this.applyEpisodeCompletionRewards();
        done = true;
      }
    }

    // Episode cleanup and metrics
    const duration = Date.now() - episodeStartTime;
    if (this.hideSeekManager.gameRunning) {
      this.hideSeekManager.endGame("episode_complete");
    }

    // AGGREGATE JUMP STATS
    npcs.forEach((npc) => {
      const stats = this.movementController.getMovementStats(npc.userData.id);
      if (stats) {
        this.episodeStats.jumpsAttempted +=
          stats.jumpAttempts -
          (this.episodeStats.initialJumpsAttempted.get(npc.userData.id) || 0);
        this.episodeStats.successfulJumps +=
          stats.successfulJumps -
          (this.episodeStats.initialSuccessfulJumps.get(npc.userData.id) || 0);
      }
    });

    return {
      episode: this.episode,
      totalReward: totalReward,
      seekerReward: seekerRewardTotal,
      hiderReward: hiderRewardTotal,
      steps: steps,
      duration: duration,
      seekerEpsilon: this.seekerAgent.epsilon.toFixed(3),
      hiderEpsilon: this.hiderAgent.epsilon.toFixed(3),
      hidersFound: this.hideSeekManager.hidersFound,
      gameResult: this.hideSeekManager.getGameStatus().state,
      distanceTraveled: this.episodeStats.totalDistanceTraveled,
      uniquePositions: this.episodeStats.uniquePositionsVisited.size,
      explorationScore: this.episodeStats.explorationScore,
      jumpsAttempted: this.episodeStats.jumpsAttempted,
      successfulJumps: this.episodeStats.successfulJumps,
      actionDistribution: this.episodeStats.actionDistribution,
    };
  }

  //--------------------------------------------------------------//
  //                     Agent Logic
  //--------------------------------------------------------------//

  getNPCState(npc) {
    const gameState = this.hideSeekManager.getGameStatus();

    const perceptionData = this.visionSystem.getVisionData(
      npc,
      this.npcSystem.npcs
    );

    const movementData = this.movementController.getBlockInventory(npc);
    const allNPCs = this.npcSystem.npcs;

    return this.encoder.encode(
      npc,
      gameState,
      perceptionData,
      movementData,
      allNPCs,
      this.worldSize
    );
  }

  selectAction(npc, stateSequence) {
    const agent = npc.role === "seeker" ? this.seekerAgent : this.hiderAgent;
    const action = agent.selectAction(stateSequence);
    npc.lastAction = action;

    return action;
  }

  async trainAgents() {
    await this.trainingQueue.scheduleTraining(
      this.seekerAgent,
      this.seekerMemory,
      this.stateHistory
    );
    await this.trainingQueue.scheduleTraining(
      this.hiderAgent,
      this.hiderMemory,
      this.stateHistory
    );
  }

  isEpisodeDone(npc) {
    return (
      npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND ||
      this.hideSeekManager.getGameStatus().state ===
        NPC_BEHAVIOR.GAME_STATES.GAME_OVER
    );
  }

  //--------------------------------------------------------------//
  //                IMPROVED REWARD FUNCTION (ADJUSTED)
  //--------------------------------------------------------------//
  calculateImprovedReward(npc, oldPos) {
    let reward = 0;

    // Small time penalty to encourage action
    reward -= 0.01;

    const perceptionData = this.visionSystem.getVisionData(
      npc,
      this.npcSystem.npcs
    );
    const visibleNPCs = perceptionData.visibleNPCs;

    // Calculate movement metrics
    const distanceMoved = npc.position.distanceTo(oldPos);
    const totalDistanceFromStart = npc.position.distanceTo(npc.startPosition);

    // Get time awareness
    const gameStatus = this.hideSeekManager.getGameStatus();
    const timeRemaining = Math.max(
      0,
      gameStatus.timeLimit - gameStatus.gameTime
    );
    const timeProgress = gameStatus.gameTime / gameStatus.timeLimit;
    const urgencyFactor = Math.min(1.0, timeProgress * 2); // Increases urgency over time

    if (npc.role === "seeker") {
      const R = REWARD_CONFIG.SEEKER;

      // ========== SEEKER REWARDS ==========

      // TIME-BASED PRESSURE - Seekers need to find hiders quickly
      if (timeRemaining < 20000 && this.hideSeekManager.hidersFound === 0) {
        // Urgency penalty increases as time runs out
        reward -= 0.05 * urgencyFactor;
      }

      // EXPLORATION AND MOVEMENT
      if (distanceMoved > 0.05) {
        reward += 0.02; // Small movement bonus

        // New area exploration
        const chunkX = Math.floor(npc.position.x / 4);
        const chunkZ = Math.floor(npc.position.z / 4);
        const chunkKey = `${chunkX},${chunkZ}`;

        if (!npc.exploredChunks.has(chunkKey)) {
          reward += 0.2; // Explore new areas
          npc.exploredChunks.add(chunkKey);
        }
      }

      // TARGET TRACKING - Main seeker objective
      if (visibleNPCs.length > 0) {
        const nearestHider = visibleNPCs.find((h) => h.role === "hider");

        if (nearestHider) {
          // Found a hider! Big reward
          reward += 2.0;

          // Approach reward based on distance change
          if (npc.lastDistanceToHider !== null) {
            const distanceDelta =
              npc.lastDistanceToHider - nearestHider.distance;
            // Reward for getting closer, penalty for moving away
            reward += Math.max(-0.5, Math.min(0.5, distanceDelta * 0.2));
          }
          npc.lastDistanceToHider = nearestHider.distance;

          // Extra reward when very close (catching range)
          if (nearestHider.distance < 3) {
            reward += 1.0; // Close to catching!
          }
          if (nearestHider.distance < 2) {
            reward += 2.0; // About to catch!
          }
        }
      } else {
        // Not seeing anyone - encourage searching
        npc.lastDistanceToHider = null;

        // Small reward for rotation (scanning)
        if (npc.lastYaw !== undefined) {
          const rotationAmount = Math.abs(npc.yaw - npc.lastYaw);
          if (rotationAmount > 0.1) {
            reward += 0.01;
          }
        }
      }

      // SMART JUMPING
      if (npc.lastAction === 4) {
        const heightGain = npc.position.y - oldPos.y;

        // Check if jump was necessary
        if (perceptionData?.raycastData?.rays) {
          const centerRays = perceptionData.raycastData.rays.slice(30, 34);
          const hasObstacle = centerRays.some(
            (ray) => ray.hit && !ray.isPlayer && ray.distance < 2
          );

          if (hasObstacle && heightGain > 0.1) {
            reward += 0.1; // Good jump over obstacle
          } else if (!hasObstacle) {
            reward -= 0.02; // Unnecessary jump
          }
        }
      }

      // STUCK PENALTIES
      if (distanceMoved < 0.01) {
        npc.consecutiveStationary++;
        if (npc.consecutiveStationary > 10) {
          reward -= 0.02 * Math.min(npc.consecutiveStationary / 10, 5);
        }
      } else {
        npc.consecutiveStationary = 0;
      }

      // Boundary penalty
      if (npc.boundaryCollision) {
        reward -= 0.1;
      }

      // EPISODE COMPLETION BONUS (applied at catch time)
      if (npc.justCaughtHider) {
        const timeBonus = (1.0 - timeProgress) * 10;
        reward += 5.0 + timeBonus;

        // Improved log message
        console.log(
          `[SEEKER CATCH BONUS] +${(5.0 + timeBonus).toFixed(
            2
          )} for catching a hider!`
        );
        npc.justCaughtHider = false;
      }
    } else if (npc.role === "hider") {
      const R = REWARD_CONFIG.HIDER;

      // ========== HIDER REWARDS ==========
      reward += 0.02; // Base survival reward per step

      // Bonus for surviving longer
      if (timeProgress > 0.5) {
        reward += 0.03; // Extra for making it past halfway
      }
      if (timeProgress > 0.75) {
        reward += 0.05; // Even more for last quarter
      }

      const visibleSeekers = visibleNPCs.filter((n) => n.role === "seeker");

      if (visibleSeekers.length > 0) {
        const nearestSeeker = visibleSeekers[0];

        // DANGER! Penalty scales with proximity
        const dangerLevel = Math.max(0, 1 - nearestSeeker.distance / 12);
        reward -= dangerLevel * 0.5;

        // Escape rewards
        if (npc.lastDistanceToSeeker !== null) {
          const distanceDelta =
            nearestSeeker.distance - npc.lastDistanceToSeeker;
          // Reward for escaping, penalty for being chased down
          reward += Math.max(-0.3, Math.min(0.3, distanceDelta * 0.15));
        }
        npc.lastDistanceToSeeker = nearestSeeker.distance;

        // Movement while in danger
        if (distanceMoved > 0.1) {
          reward += 0.05; // Good to move when spotted
        }

        // Critical danger zone
        if (nearestSeeker.distance < 3) {
          reward -= 0.5; // Very dangerous!
        }
      } else {
        // Safe for now
        npc.lastDistanceToSeeker = null;
        reward += 0.05; // Small safety bonus

        // Still encourage some movement to find better spots
        if (distanceMoved > 0.05 && distanceMoved < 0.15) {
          reward += 0.02;
        }

        // Reward for finding elevated positions (harder to catch)
        if (npc.position.y > npc.startPosition.y + 2) {
          reward += 0.1;
        }
      }

      // Exploration for hiders (finding hiding spots)
      if (distanceMoved > 0.05) {
        const chunkX = Math.floor(npc.position.x / 4);
        const chunkZ = Math.floor(npc.position.z / 4);
        const chunkKey = `${chunkX},${chunkZ}`;

        if (!npc.exploredChunks.has(chunkKey)) {
          reward += 0.1;
          npc.exploredChunks.add(chunkKey);
        }
      }

      // Smart jumping for escape
      if (npc.lastAction === 4) {
        const heightGain = npc.position.y - oldPos.y;
        if (heightGain > 0.1) {
          reward += 0.05;
          if (visibleSeekers.length > 0) {
            reward += 0.15; // Extra for jumping while escaping
          }
        }
      }

      // Stuck penalties (less harsh for hiders)
      if (distanceMoved < 0.01) {
        npc.consecutiveStationary++;
        if (npc.consecutiveStationary > 30) {
          reward -= 0.01 * Math.min(npc.consecutiveStationary / 30, 3);
        }
      } else {
        npc.consecutiveStationary = 0;
      }

      // Boundary penalty
      if (npc.boundaryCollision) {
        reward -= 0.05;
      }

      // EPISODE COMPLETION PENALTIES (for being caught)
      if (npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) {
        const survivedTime =
          (npc.caughtTime || Date.now()) - this.hideSeekManager.gameStartTime;
        const survivalRatio = survivedTime / this.hideSeekManager.gameTimeLimit;

        // Penalty scaled by how quickly they were caught
        const catchPenalty = -10.0 * (1.0 - survivalRatio);
        reward += catchPenalty; // Bigger penalty for being caught early
        console.log(
          `[HIDER CAUGHT PENALTY] ${catchPenalty.toFixed(2)} (survived ${(
            survivalRatio * 100
          ).toFixed(1)}% of game)`
        );
      }
    }

    return reward;
  }

  /**
   * Apply episode completion bonuses/penalties
   * Called when episode ends
   */
  applyEpisodeCompletionRewards() {
    const gameStatus = this.hideSeekManager.getGameStatus();
    const totalGameTime = gameStatus.timeLimit;
    const timePlayed = gameStatus.gameTime;
    const completionRatio = timePlayed / totalGameTime;

    this.npcSystem.npcs.forEach((npc) => {
      let episodeBonus = 0;

      if (npc.role === "seeker") {
        // Seeker episode bonuses
        if (
          this.hideSeekManager.hidersFound ===
          this.hideSeekManager.hiders.length
        ) {
          // Won! Found all hiders
          episodeBonus = 20.0;
          // Time bonus for winning quickly
          episodeBonus += (1.0 - completionRatio) * 10.0;
          console.log(
            `[EPISODE] Seeker WON! Bonus: +${episodeBonus.toFixed(2)}`
          );
        } else {
          // Lost - didn't find all hiders
          episodeBonus = -15.0;
          // Partial credit for each hider found
          episodeBonus += this.hideSeekManager.hidersFound * 5.0;
          console.log(
            `[EPISODE] Seeker lost. Penalty: ${episodeBonus.toFixed(2)}`
          );
        }
      } else if (npc.role === "hider") {
        // Hider episode bonuses
        if (npc.hideSeekState !== NPC_BEHAVIOR.GAME_STATES.FOUND) {
          // Survived the entire game!
          episodeBonus = 15.0;
          console.log(
            `[EPISODE] Hider ${
              npc.userData.id
            } SURVIVED! Bonus: +${episodeBonus.toFixed(2)}`
          );
        }
        // Caught penalty is already applied in main reward function
      }

      // Store the episode bonus for replay buffer
      npc.rewardBuffer += episodeBonus;
    });
  }

  //--------------------------------------------------------------//
  //                  Enhanced Metrics and Logging
  //--------------------------------------------------------------//

  logDetailedMetrics(metrics) {
    const episode = metrics.episode;
    const pad = (str, len) => str.toString().padStart(len, " ");

    console.log(`\n${"=".repeat(80)}`);
    console.log(`EPISODE ${pad(episode, 4)} COMPLETE`);
    console.log(`${"=".repeat(80)}`);

    // Basic metrics
    console.log(`┌─ Performance ──────────────────────────────┐`);
    console.log(
      `│ Total Reward:     ${pad(
        metrics.totalReward.toFixed(2),
        10
      )}           │`
    );
    console.log(
      `│ Seeker Reward:    ${pad(
        metrics.seekerReward.toFixed(2),
        10
      )}           │`
    );
    console.log(
      `│ Hider Reward:     ${pad(
        metrics.hiderReward.toFixed(2),
        10
      )}           │`
    );
    console.log(`│ Steps:            ${pad(metrics.steps, 10)}           │`);
    console.log(
      `│ Hiders Found:     ${metrics.hidersFound}/2                    │`
    );
    console.log(`└────────────────────────────────────────────┘`);

    // Exploration metrics
    console.log(`┌─ Exploration ──────────────────────────────┐`);
    console.log(
      `│ Distance Traveled: ${pad(
        metrics.distanceTraveled.toFixed(1),
        9
      )} blocks     │`
    );
    console.log(
      `│ Unique Positions:  ${pad(metrics.uniquePositions, 9)}              │`
    );
    console.log(
      `│ Chunks Explored:   ${pad(metrics.explorationScore, 9)}              │`
    );
    console.log(`└────────────────────────────────────────────┘`);

    // Jump metrics
    console.log(`┌─ Jumping ──────────────────────────────────┐`);
    console.log(
      `│ Jumps Attempted:   ${pad(metrics.jumpsAttempted, 9)}              │`
    );
    console.log(
      `│ Successful Jumps:  ${pad(metrics.successfulJumps, 9)}              │`
    );
    const jumpSuccessRate =
      metrics.jumpsAttempted > 0
        ? ((metrics.successfulJumps / metrics.jumpsAttempted) * 100).toFixed(1)
        : "0.0";
    console.log(
      `│ Success Rate:      ${pad(jumpSuccessRate + "%", 9)}              │`
    );
    console.log(`└────────────────────────────────────────────┘`);

    // Action distribution
    console.log(`┌─ Action Distribution ──────────────────────┐`);
    const actionNames = [
      "Forward",
      "Backward",
      "Left",
      "Right",
      "Jump",
      "Rot.Left",
      "Rot.Right",
      "Rot.Up",
      "Rot.Down",
    ];
    const totalActions = metrics.actionDistribution.reduce((a, b) => a + b, 0);

    metrics.actionDistribution.forEach((count, idx) => {
      const percentage = ((count / totalActions) * 100).toFixed(1);
      const bar = "█".repeat(Math.floor(percentage / 2));
      console.log(
        `│ ${actionNames[idx].padEnd(10)}: ${bar.padEnd(20)} ${pad(
          percentage + "%",
          6
        )} │`
      );
    });
    console.log(`└────────────────────────────────────────────┘`);

    // Epsilon values
    console.log(`┌─ Learning Parameters ──────────────────────┐`);
    console.log(
      `│ Seeker Epsilon:    ${pad(metrics.seekerEpsilon, 9)}              │`
    );
    console.log(
      `│ Hider Epsilon:     ${pad(metrics.hiderEpsilon, 9)}              │`
    );
    console.log(`└────────────────────────────────────────────┘`);

    // Progress tracking
    if (this.episode % 10 === 0 && this.trainingStartTime) {
      const elapsed = Date.now() - this.trainingStartTime;
      const avgTimePerEpisode = elapsed / this.episode;
      const remaining = (2000 - this.episode) * avgTimePerEpisode;
      const etaHours = (remaining / 3600000).toFixed(1);
      const etaMinutes = ((remaining % 3600000) / 60000).toFixed(0);

      console.log(`\n📊 Training Progress:`);
      console.log(
        `   Episodes Complete: ${this.episode}/2000 (${(
          this.episode / 20
        ).toFixed(1)}%)`
      );
      console.log(`   ETA: ${etaHours}h ${etaMinutes}m remaining`);

      // Calculate rolling averages
      const recentMetrics = this.metrics.slice(-10);
      const avgReward =
        recentMetrics.reduce((sum, m) => sum + m.totalReward, 0) /
        recentMetrics.length;
      const avgDistance =
        recentMetrics.reduce((sum, m) => sum + m.distanceTraveled, 0) /
        recentMetrics.length;
      const avgExploration =
        recentMetrics.reduce((sum, m) => sum + m.explorationScore, 0) /
        recentMetrics.length;

      console.log(`   10-Episode Averages:`);
      console.log(`     • Reward: ${avgReward.toFixed(2)}`);
      console.log(`     • Distance: ${avgDistance.toFixed(1)} blocks`);
      console.log(`     • Exploration: ${avgExploration.toFixed(1)} chunks`);
    }
  }

  /**
   * Download models as files (browser downloads)
   */
  async downloadModels(episode) {
    console.log(`📥 Downloading models for episode ${episode}...`);

    try {
      // Save seeker model
      await this.seekerAgent.model.save(`downloads://seeker_ep${episode}`);
      console.log(`   ✅ Seeker model downloaded`);

      // Save hider model
      await this.hiderAgent.model.save(`downloads://hider_ep${episode}`);
      console.log(`   ✅ Hider model downloaded`);
    } catch (error) {
      console.error("Model download failed:", error);
    }
  }

  /**
   * Export training metrics as JSON file
   */
  exportMetrics(episode) {
    const data = {
      episode: episode,
      timestamp: new Date().toISOString(),
      totalEpisodes: this.metrics.length,
      config: {
        learningRate: this.config.MODEL.learningRate,
        gamma: this.config.MODEL.gamma,
        epsilonDecay: this.config.MODEL.epsilonDecay,
        batchSize: this.config.MODEL.batchSize,
      },
      metrics: this.metrics,
      summary: {
        avgReward: (
          this.metrics.reduce((sum, m) => sum + m.totalReward, 0) /
          this.metrics.length
        ).toFixed(2),
        avgDistance: (
          this.metrics.reduce((sum, m) => sum + m.distanceTraveled, 0) /
          this.metrics.length
        ).toFixed(2),
        avgExploration: (
          this.metrics.reduce((sum, m) => sum + m.explorationScore, 0) /
          this.metrics.length
        ).toFixed(2),
        seekerFinalEpsilon: this.seekerAgent.epsilon.toFixed(3),
        hiderFinalEpsilon: this.hiderAgent.epsilon.toFixed(3),
        seekerMemorySize: this.seekerMemory.size(),
        hiderMemorySize: this.hiderMemory.size(),
      },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `training_metrics_ep${episode}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`   ✅ Metrics exported: training_metrics_ep${episode}.json`);
  }

  /**
   * Sleep function for async waiting
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Export training data for analysis
   */
  exportData() {
    return {
      metrics: this.metrics,
      seekerMemory: this.seekerMemory.export(),
      hiderMemory: this.hiderMemory.export(),
    };
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.trainingQueue.clear();
  }
}

export default TrainingOrchestrator;
