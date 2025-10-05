// ==============================================================
// FILE: research/src/ml/training/training-orchestrator.js
// ==============================================================

import { DQNAgent } from "../ml/dqn-agent.js";
import { ExperienceReplay } from "./experience-replay.js";
import { StateEncoder } from "../ml/state-encoder.js";
import { NPC } from "../npc/config-npc-behavior.js";
import { NPCVisionSystem } from "../npc/physics/npc-vision-system.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as GameState from "../../../../src/core/game-state.js";

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

    this.config = NPC.TRAINING;
    this.worldSize = TRAINING_WORLD_CONFIG.SIZE;

    this.seekerAgent = new DQNAgent("seeker");
    this.hiderAgent = new DQNAgent("hider");

    this.seekerMemory = new ExperienceReplay(this.config.MODEL.memorySize);
    this.hiderMemory = new ExperienceReplay(this.config.MODEL.memorySize);

    this.encoder = new StateEncoder();

    this.encoder.chunkManager = this.npcSystem.chunkManager;

    this.visionSystem = new NPCVisionSystem({
      visionRange: NPC.VISION.visionRange,
      visionAngle: NPC.VISION.visionAngle,
      rayCount: NPC.VISION.rayCount,
      rayPrecisionAngle: NPC.VISION.rayPrecisionAngle,
      debug: NPC.VISION.debug,
    });

    this.episode = 0;
    this.globalStep = 0;
    this.metrics = [];

    this.lastSeekerLoss = null;
    this.lastHiderLoss = null;

    this.stateHistory = new Map();

    this.actionSize = this.config.MODEL.actionSize;

    this.trainingQueue = new TrainingQueue();

    this.useRandomTerrain = true;
    this.useSingleSeed = true;
    this.fixedSeed = 42;
    this.terrainSeeds = [];

    if (this.useRandomTerrain) {
      if (this.useSingleSeed) {
        // Single seed mode - same terrain every episode
        this.terrainSeeds = [this.fixedSeed];
        console.log(`Using single fixed terrain seed: ${this.fixedSeed}`);
      } else {
        // Multiple seeds mode - rotate through different terrains
        for (let i = 0; i < 100; i++) {
          this.terrainSeeds.push(Math.floor(Math.random() * 1000000));
        }
        console.log(
          `Generated ${this.terrainSeeds.length} random terrain seeds for diversity`
        );
      }
    } else {
      console.log(`Random terrain disabled - using default world generation`);
    }

    // Track episode statistics
    this.episodeStats = {
      totalDistanceTraveled: 0,
      uniquePositionsVisited: new Set(),
      jumpsAttempted: 0,
      successfulJumps: 0,
      blocksEncountered: 0,
      explorationScore: 0,
      actionDistribution: new Array(NPC.TRAINING.MODEL.actionSize).fill(0),
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

  async resetEnvironment() {
    // Reset episode statistics
    this.episodeStats = {
      totalDistanceTraveled: 0,
      uniquePositionsVisited: new Set(),
      jumpsAttempted: 0,
      successfulJumps: 0,
      blocksEncountered: 0,
      explorationScore: 0,
      actionDistribution: new Array(NPC.TRAINING.MODEL.actionSize).fill(0),
      initialJumpsAttempted: new Map(),
      initialSuccessfulJumps: new Map(),
    };

    // Terrain regeneration (if enabled)
    if (this.useRandomTerrain) {
      const terrainIndex = this.episode % this.terrainSeeds.length;
      const terrainSeed = this.terrainSeeds[terrainIndex];

      console.log(
        `Episode ${
          this.episode
        }: Regenerating terrain with seed ${terrainSeed}${
          this.useSingleSeed ? " (fixed seed)" : ` (terrain #${terrainIndex})`
        }`
      );

      // Always send regenerate message - even for same seed
      if (this.npcSystem.chunkManager?.chunkWorker) {
        this.npcSystem.chunkManager.chunkWorker.postMessage({
          type: "regenerate",
          seed: terrainSeed,
        });

        // Clear existing chunks
        this.npcSystem.chunkManager.clearAllChunks();
      }

      await this.waitForInitialChunks();
    }

    // End previous game and remove NPCs
    this.hideSeekManager.endGame("episode_reset");
    this.npcSystem.removeAllNPCs();
    this.lastSeekerLoss = null;
    this.lastHiderLoss = null;

    // Generate new NPCs
    this.npcSystem.generateNPCs();

    const npcs = this.npcSystem.npcs;

    this.stateHistory.clear();
    npcs.forEach((npc) => {
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

  async waitForInitialChunks() {
    const chunkManager = this.npcSystem.chunkManager;
    if (!chunkManager) {
      console.warn("No ChunkManager available");
      return;
    }

    const worldCenter = this.worldSize / 2;
    const spawnChunkX = Math.floor(worldCenter / chunkManager.CHUNK_SIZE);
    const spawnChunkZ = Math.floor(worldCenter / chunkManager.CHUNK_SIZE);

    console.log(
      `Generating chunks for ${this.worldSize}×${this.worldSize} world...`
    );

    const chunksNeeded = Math.ceil(this.worldSize / chunkManager.CHUNK_SIZE);
    const radius = Math.floor(chunksNeeded / 2);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const chunkX = spawnChunkX + dx;
        const chunkZ = spawnChunkZ + dz;

        // Only generate if within bounds
        if (chunkManager.isChunkInBounds(chunkX, chunkZ)) {
          chunkManager.generateChunk(chunkX, chunkZ);
        }
      }
    }

    // Wait for meshes (adjust expected count)
    const expectedMeshes = chunksNeeded * chunksNeeded * 3; // 3 vertical chunks per column

    return new Promise((resolve) => {
      const checkInterval = 100;
      const maxWaitTime = 15000;
      const startTime = Date.now();

      const checkMeshes = () => {
        let meshCount = 0;

        chunkManager.chunks.forEach((chunkData) => {
          chunkData.meshes.forEach((meshData) => {
            if (
              meshData.mesh &&
              meshData.mesh.parent === this.npcSystem.scene
            ) {
              meshCount++;
            }
          });
        });

        const elapsed = Date.now() - startTime;

        // ✅ CHANGE: Wait for more meshes (at least 50% of expected)
        if (meshCount >= expectedMeshes * 0.5) {
          console.log(
            `✅ Terrain ready: ${meshCount}/${expectedMeshes} meshes in ${elapsed}ms`
          );

          if (GameState?.renderer && GameState?.scene && GameState?.camera) {
            GameState.renderer.render(GameState.scene, GameState.camera);
          }

          resolve();
          return;
        }

        if (elapsed > maxWaitTime) {
          console.warn(
            `⚠️ Terrain timeout: ${meshCount}/${expectedMeshes} meshes after ${elapsed}ms`
          );
          resolve();
          return;
        }

        if (elapsed % 1000 < 100) {
          console.log(
            `⏳ Generating terrain... ${meshCount}/${expectedMeshes} meshes`
          );
        }

        setTimeout(checkMeshes, checkInterval);
      };

      checkMeshes();
    });
  }

  /**
   * Run a single episode of the game
   */
  async runEpisode(options) {
    const npcs = await this.resetEnvironment();
    const npcMap = new Map(npcs.map((n) => [n.userData.id, n]));

    const episodeStartTime = Date.now();
    let steps = 0;
    let totalReward = 0;
    let done = false;
    let seekerRewardTotal = 0;
    let hiderRewardTotal = 0;
    const npcRewardTotals = {};

    const clock = new THREE.Clock();

    const ACTION_SELECTION_FREQUENCY = 15;

    // Wait for seeking phase
    while (
      this.hideSeekManager.gameState !== NPC.GAME_STATES.SEEKING &&
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

    if (this.hideSeekManager.gameState !== NPC.GAME_STATES.SEEKING) {
      console.warn("Episode failed to start seeking phase.");
      this.hideSeekManager.endGame("failed_start");
      return null;
    }

    // Main episode loop
    while (!done && steps < this.config.TRAINING.maxStepsPerEpisode) {
      const deltaTime = clock.getDelta();

      const actions = new Map();
      const previousPositions = new Map();

      // ✅ CHANGED: Only select actions every N frames
      if (steps % ACTION_SELECTION_FREQUENCY === 0) {
        npcs.forEach((npc) => {
          if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

          const currentEnvState = this.getNPCState(npc);
          const stateSequence = this.stateHistory.get(npc.userData.id);

          if (steps % 100 === 0) {
            const perceptionData = this.visionSystem.getVisionData(
              npc,
              this.npcSystem.npcs
            );
            this.visionSystem.logVisionState(npc, perceptionData);
          }

          const action = this.selectAction(npc, stateSequence);

          // Store action for this NPC
          npc.currentAction = action;

          actions.set(npc.userData.id, {
            actionIndex: action,
            currentEnvState,
          });

          this.episodeStats.actionDistribution[action]++;

          stateSequence.shift();
          stateSequence.push(currentEnvState);

          previousPositions.set(npc.userData.id, npc.position.clone());
        });
      } else {
        // ✅ ADD: On non-selection frames, reuse previous actions
        npcs.forEach((npc) => {
          if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

          const currentEnvState = this.getNPCState(npc);

          actions.set(npc.userData.id, {
            actionIndex: npc.currentAction || 0,
            currentEnvState,
          });

          previousPositions.set(npc.userData.id, npc.position.clone());
        });
      }

      // ✅ CHANGED: Execute current action (not executeActionWithDuration)
      if (!options.visual) {
        actions.forEach(({ actionIndex }, npcId) => {
          const npc = npcMap.get(npcId);
          if (npc && npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
            this.movementController.executeAction(npc, actionIndex, deltaTime);
          }
        });

        npcs.forEach((npc) => {
          if (npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
            this.movementController.updatePhysics(npc, deltaTime);
          }
        });

        this.hideSeekManager.update(deltaTime);
        // await this.sleep(1);
      } else {
        // Visual mode
        actions.forEach(({ actionIndex }, npcId) => {
          const npc = npcMap.get(npcId);
          if (npc && npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
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
          if (npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
            this.movementController.updatePhysics(npc, deltaTime);
          }
        });
        await this.sleep(16);
      }

      // Rest of the reward calculation and training logic stays the same
      let stepReward = 0;

      actions.forEach(({ actionIndex, currentEnvState }, npcId) => {
        const npc = npcMap.get(npcId);
        if (!npc) return;

        if (npc.hideSeekState === NPC.GAME_STATES.FOUND) {
          npc.isMoving = false;
          return;
        }

        const oldPos = previousPositions.get(npcId);
        if (!oldPos) return;

        let distanceMoved = oldPos.distanceTo(npc.position);

        this.episodeStats.totalDistanceTraveled += distanceMoved;

        const gridPos = `${Math.floor(npc.position.x)},${Math.floor(
          npc.position.z
        )}`;
        this.episodeStats.uniquePositionsVisited.add(gridPos);

        const chunkX = Math.floor(npc.position.x / 4);
        const chunkZ = Math.floor(npc.position.z / 4);
        const chunkKey = `${chunkX},${chunkZ}`;
        if (!npc.exploredChunks.has(chunkKey)) {
          npc.exploredChunks.add(chunkKey);
          this.episodeStats.explorationScore++;
        }

        const intendedSpeed =
          this.movementController.getNPCSpeed(npc) * deltaTime;
        npc.boundaryCollision = distanceMoved < intendedSpeed * 0.3;

        if (distanceMoved < 0.01) {
          npc.consecutiveStationary++;
        } else {
          npc.consecutiveStationary = 0;
        }

        const reward = this.calculateReward(npc, oldPos);
        npcRewardTotals[npc.userData.id] =
          (npcRewardTotals[npc.userData.id] || 0) + reward;
        stepReward += reward;

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
        gameStatus.state === NPC.GAME_STATES.GAME_OVER ||
        steps >= this.config.TRAINING.maxStepsPerEpisode
      ) {
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

    this.npcSystem.npcs.forEach((npc) => {
      const bonus = npc.rewardBuffer || 0;
      npcRewardTotals[npc.userData.id] =
        (npcRewardTotals[npc.userData.id] || 0) + bonus;
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
      seekerLoss: this.lastSeekerLoss,
      hiderLoss: this.lastHiderLoss,
      npcRewards: { ...npcRewardTotals },
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

    return this.encoder.encode(npc, gameState, perceptionData, this.worldSize);
  }

  selectAction(npc, stateSequence) {
    const agent = npc.role === "seeker" ? this.seekerAgent : this.hiderAgent;
    const action = agent.selectAction(stateSequence);
    npc.lastAction = action;

    return action;
  }

  async trainAgents() {
    try {
      const [seekerLoss, hiderLoss] = await Promise.all([
        this.trainingQueue.scheduleTraining(
          this.seekerAgent,
          this.seekerMemory,
          this.stateHistory
        ),
        this.trainingQueue.scheduleTraining(
          this.hiderAgent,
          this.hiderMemory,
          this.stateHistory
        ),
      ]);

      // Store losses for logging
      if (seekerLoss !== null && !isNaN(seekerLoss)) {
        this.lastSeekerLoss = seekerLoss;
      }
      if (hiderLoss !== null && !isNaN(hiderLoss)) {
        this.lastHiderLoss = hiderLoss;
      }
    } catch (error) {
      console.error("Error during agent training:", error);
    }
  }

  isEpisodeDone(npc) {
    return (
      npc.hideSeekState === NPC.GAME_STATES.FOUND ||
      this.hideSeekManager.getGameStatus().state === NPC.GAME_STATES.GAME_OVER
    );
  }

  //--------------------------------------------------------------//
  //                REWARD FUNCTION
  //--------------------------------------------------------------//
  calculateReward(npc, oldPos) {
    let reward = 0;

    // Universal time penalty - encourages action
    reward -= 0.01;

    const perceptionData = this.visionSystem.getVisionData(
      npc,
      this.npcSystem.npcs
    );
    const visibleNPCs = perceptionData.visibleNPCs;
    const distanceMoved = npc.position.distanceTo(oldPos);

    if (npc.role === "seeker") {
      // ========== SEEKER REWARDS ==========

      const visibleHiders = visibleNPCs.filter((n) => n.role === "hider");

      if (visibleHiders.length > 0) {
        const nearest = visibleHiders[0];

        // Reward for closing distance to visible hider
        if (npc.lastDistanceToHider !== null) {
          const distanceDelta = npc.lastDistanceToHider - nearest.distance;
          reward += distanceDelta * 1.0; // Approaching = positive, retreating = negative
        }

        npc.lastDistanceToHider = nearest.distance;
      } else {
        // No hider visible - no reward for exploration
        npc.lastDistanceToHider = null;
      }

      // Penalty for being stuck
      if (distanceMoved < 0.01) {
        npc.consecutiveStationary++;
        if (npc.consecutiveStationary > 10) {
          reward -= 0.1; // Stronger than time penalty
        }
      } else {
        npc.consecutiveStationary = 0;
      }

      // Boundary collision penalty
      if (npc.boundaryCollision) {
        reward -= 0.2;
      }

      // Catch bonus (immediate feedback for successful catch)
      if (npc.justCaughtHider) {
        reward += 10.0;
        console.log(`[SEEKER CATCH] +10.0 reward for catching hider!`);
        npc.justCaughtHider = false;
      }
    } else if (npc.role === "hider") {
      // ========== HIDER REWARDS ==========

      const visibleSeekers = visibleNPCs.filter((n) => n.role === "seeker");

      if (visibleSeekers.length > 0) {
        const nearest = visibleSeekers[0];

        // Danger penalty - being close to seeker is bad
        const threatLevel = Math.max(0, 1 - nearest.distance / 10);
        reward -= threatLevel * 0.5;

        // Reward for increasing distance from seeker
        if (npc.lastDistanceToSeeker !== null) {
          const distanceDelta = nearest.distance - npc.lastDistanceToSeeker;
          reward += distanceDelta * 1.0; // Escaping = positive, getting caught = negative
        }

        npc.lastDistanceToSeeker = nearest.distance;
      } else {
        // Safe - no seeker visible (no reward, just neutral)
        npc.lastDistanceToSeeker = null;
      }

      // Penalty for being stuck (hiders camping in holes learn nothing)
      if (distanceMoved < 0.01) {
        npc.consecutiveStationary++;
        if (npc.consecutiveStationary > 30) {
          // More lenient for hiders
          reward -= 0.05;
        }
      } else {
        npc.consecutiveStationary = 0;
      }

      // Boundary collision penalty
      if (npc.boundaryCollision) {
        reward -= 0.2;
      }

      // Caught penalty (immediate feedback)
      if (
        npc.hideSeekState === NPC.GAME_STATES.FOUND &&
        !npc.caughtPenaltyApplied
      ) {
        reward -= 5.0;
        npc.caughtPenaltyApplied = true;
        console.log(`[HIDER CAUGHT] -5.0 penalty for being caught`);
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
        if (npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
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
  //                   Metrics and Logging
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

    // Training Loss
    console.log(`┌─ Training Loss ────────────────────────────┐`);
    const seekerLossStr =
      metrics.seekerLoss !== null && !isNaN(metrics.seekerLoss)
        ? metrics.seekerLoss.toFixed(4)
        : "N/A";
    const hiderLossStr =
      metrics.hiderLoss !== null && !isNaN(metrics.hiderLoss)
        ? metrics.hiderLoss.toFixed(4)
        : "N/A";
    console.log(`│ Seeker Loss:      ${pad(seekerLossStr, 10)}           │`);
    console.log(`│ Hider Loss:       ${pad(hiderLossStr, 10)}           │`);
    console.log(`└────────────────────────────────────────────┘`);

    // Per-NPC Rewards
    if (metrics.npcRewards && Object.keys(metrics.npcRewards).length > 0) {
      console.log(`┌─ Per-NPC Rewards ──────────────────────────┐`);
      Object.entries(metrics.npcRewards).forEach(([id, reward]) => {
        const displayId =
          id.length > 12 ? id.substring(0, 12) + "…" : id.padEnd(12);
        console.log(
          `│ ${displayId}: ${pad(reward.toFixed(2), 10)}           │`
        );
      });
      console.log(`└────────────────────────────────────────────┘`);
    }

    // ➕ NEW: Experience Replay Buffer Stats
    console.log(`┌─ Memory Buffer ────────────────────────────┐`);
    const seekerStats = this.seekerMemory.getStats();
    const hiderStats = this.hiderMemory.getStats();
    console.log(
      `│ Seeker Buffer:    ${pad(seekerStats.utilization, 10)} (${
        seekerStats.size
      }/${seekerStats.capacity}) │`
    );
    console.log(
      `│ Hider Buffer:     ${pad(hiderStats.utilization, 10)} (${
        hiderStats.size
      }/${hiderStats.capacity}) │`
    );
    console.log(
      `│ Seeker Avg Rwd:   ${pad(seekerStats.avgReward, 10)}           │`
    );
    console.log(
      `│ Hider Avg Rwd:    ${pad(hiderStats.avgReward, 10)}           │`
    );
    console.log(`└────────────────────────────────────────────┘`);

    // ➕ NEW: Reward Range Check (detect unclipped rewards)
    const allRewards = Object.values(metrics.npcRewards || {});
    const minReward = Math.min(...allRewards, 0);
    const maxReward = Math.max(...allRewards, 0);
    if (minReward < -10 || maxReward > 10) {
      console.warn(
        `⚠️  REWARD OUT OF CLIPPED RANGE! Min: ${minReward.toFixed(
          2
        )}, Max: ${maxReward.toFixed(2)}`
      );
    }

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

    // ➕ NEW: Action Distribution Imbalance Check
    const totalActions = metrics.actionDistribution.reduce((a, b) => a + b, 0);
    if (totalActions > 0) {
      const maxActionPct = Math.max(
        ...metrics.actionDistribution.map((c) => (c / totalActions) * 100)
      );
      if (maxActionPct > 70) {
        const dominantIdx = metrics.actionDistribution.indexOf(
          Math.max(...metrics.actionDistribution)
        );
        const actionNames = [
          "Fwd",
          "Back",
          "Left",
          "Right",
          "Jump",
          "RotL",
          "RotR",
          "RotU",
          "RotD",
        ];
        console.warn(
          `⚠️  ACTION IMBALANCE! "${
            actionNames[dominantIdx]
          }" used ${maxActionPct.toFixed(1)}% of the time`
        );
      }
    }

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
      "PlaceBlk",
      "RemoveBlk",
    ];
    metrics.actionDistribution.forEach((count, idx) => {
      const percentage =
        totalActions > 0 ? ((count / totalActions) * 100).toFixed(1) : "0.0";
      const bar = "█".repeat(Math.floor(parseFloat(percentage) / 2));
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
    this.seekerAgent.dispose();
    this.hiderAgent.dispose();
    this.stateHistory.clear();
  }
}

export default TrainingOrchestrator;
