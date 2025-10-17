// ==============================================================
// FILE: research/src/ml/ppo-training-bridge.js
// ==============================================================

import { PPOWebSocketClient } from "./websocket-client.js";
import { StateEncoder } from "./state-encoder.js";
import { NPCVisionSystem } from "../npc/physics/npc-vision-system.js";
import { NPC } from "../npc/config-npc-behavior.js";
import { regenerateTerrain } from "../world/terrain-generator.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";

// IMPORT LOGGER
import sessionManager from "./log/session-manager.js";
import { PPOTrainingLogger } from "./log/ppo-training-bridge-logger.js";

export class PPOTrainingBridge {
  constructor(npcSystem, hideSeekManager, chunkManager) {
    this.npcSystem = npcSystem;
    this.hideSeekManager = hideSeekManager;
    this.movementController = npcSystem.movementController;
    this.chunkManager = chunkManager;
    this.wsClient = new PPOWebSocketClient();
    this.encoder = new StateEncoder();
    this.encoder.chunkManager = chunkManager;
    this.logger = new PPOTrainingLogger("http://localhost:3001", {
      logInterval: 100, // Log every 100 steps
      enabled: true, // Can be toggled
      sessionDir: sessionManager.getSessionDir(),
    });
    this.visionSystem = new NPCVisionSystem({
      visionRange: NPC.VISION.visionRange,
      visionAngle: NPC.VISION.visionAngle,
      rayCount: NPC.VISION.rayCount,
      rayAngleTolerance: NPC.VISION.rayAngleTolerance,
      debug: false,
    });

    if (chunkManager) {
      this.visionSystem.setChunkManager(chunkManager);
    }

    this.scene = npcSystem.scene;

    this.connected = false;
    this.training = false;
    this.currentEpisode = 0;
    this.currentStep = 0;
    this.currentActions = new Map();

    // Vision caching for performance
    this.currentVisionCache = null;

    // Debug mode
    this.DEBUG_MODE = true; // Set to true to see visual training
    this.episodeStartTime = 0;
    this.simulatedTime = 0;
  }

  // ============================================================
  // REWARD CONFIGURATION
  // ============================================================
  REWARD_CONFIG = {
    // Seeker rewards - REBALANCED to encourage movement
    SEEKER_SEES_HIDER: 2.0,              // Was 10.0 - reduced 80%
    SEEKER_CLOSE_BONUS: 8.0,             // Was 5.0 - increased
    SEEKER_VERY_CLOSE: 5.0,              // Was 3.0 - increased
    SEEKER_APPROACHING_BONUS: 10.0,      // NEW - reward getting closer
    SEEKER_EXPLORATION: 1.0,             // Was 0.5 - doubled
    
    // Seeker penalties - INCREASED to prevent exploitation
    SEEKER_STATIONARY_PENALTY: -5.0,     // Was -1.0 - 5x stronger
    SEEKER_ROTATION_ONLY_PENALTY: -8.0,  // NEW - spinning is bad
    SEEKER_RETREATING_PENALTY: -5.0,     // NEW - moving away is bad
    
    // Hider rewards - REBALANCED
    HIDER_SEEN_PENALTY: -8.0,            // Was -5.0
    HIDER_DISTANCE_REWARD: 5.0,          // Was 3.0
    HIDER_PANIC_PENALTY: -8.0,           // Was -5.0
    HIDER_ESCAPE_BONUS: 5.0,             // Was 2.0
    HIDER_STATIONARY_PENALTY: -2.0,      // Was -0.1
    HIDER_SMART_MOVEMENT_BONUS: 3.0,     // NEW - reward good hiding
    
    // Boundary penalties - NEW
    BOUNDARY_HIT_PENALTY: -10.0,         // Hit wall = bad
    NEAR_BOUNDARY_PENALTY: -2.0,         // Near wall = bad
    
    // Time penalty
    TIME_PENALTY: -0.01,                 // Was -0.001 - 10x stronger

    // End-of-episode bonuses
    SEEKER_SUCCESS: 100.0,
    SEEKER_FAILURE: -30.0,
    SEEKER_PARTIAL: 50.0,
    HIDER_SURVIVAL: 50.0,
    HIDER_CAUGHT: -50.0,
  };

  async connect() {
    try {
      await this.wsClient.connect();
      this.connected = true;
      return true;
    } catch (error) {
      alert(
        "Failed to connect to Python backend. Make sure 'python main.py' is running!"
      );
      return false;
    }
  }

  async startTraining() {
    if (!this.connected) return;

    this.training = true;

    const originalHandler = this.wsClient.handleMessage.bind(this.wsClient);

    this.wsClient.handleMessage = async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "reset") {
          const observations = await this.resetEpisode(message.episode);
          this.wsClient.send({
            type: "observation",
            agents: observations,
          });
        } else if (message.type === "step") {
          const stepResult = await this.executeStep(message.actions);
          this.wsClient.send({
            type: "observation",
            agents: stepResult.agents,
            episode_done: stepResult.episode_done,
          });
        } else {
          originalHandler(data);
        }
      } catch (error) {
        this.wsClient.sendError("Message handling failed", error.toString());
        originalHandler(data);
      }
    };

    while (this.training) {
      await this.sleep(1000);
    }
  }

  async startDemo() {
    if (!this.connected) return;

    this.training = false; // Not training
    this.DEBUG_MODE = true; // Visual mode

    const originalHandler = this.wsClient.handleMessage.bind(this.wsClient);

    this.wsClient.handleMessage = async (data) => {
      try {
        const message = JSON.parse(data);

        if (message.type === "reset") {
          const observations = await this.resetEpisode(message.episode);
          this.wsClient.send({
            type: "observation",
            agents: observations,
          });
        } else if (message.type === "step") {
          const stepResult = await this.executeStep(message.actions);
          this.wsClient.send({
            type: "observation",
            agents: stepResult.agents,
            episode_done: stepResult.episode_done,
          });
        } else {
          originalHandler(data);
        }
      } catch (error) {
        this.wsClient.sendError(
          "Demo message handling failed",
          error.toString()
        );
        originalHandler(data);
      }
    };

    // Keep connection alive
    while (this.connected) {
      await this.sleep(1000);
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stopTraining() {
    this.training = false;
    if (this.logger) {
      this.logger.close();
    }
  }

  async resetEpisode(episodeNum) {
    this.currentEpisode = episodeNum;
    this.currentStep = 0;

    // Start episode logging
    this.logger.startEpisode(episodeNum);

    if (window.hideSeekUI) {
      window.hideSeekUI.updateTrainingEpisode(episodeNum);
    }

    if (this.hideSeekManager.gameRunning) {
      this.hideSeekManager.endGame("episode_reset");
    }

    await regenerateTerrain(this.chunkManager);
    this.npcSystem.removeAllNPCs();
    this.npcSystem.generateNPCs();

    // Initialize simulated time FIRST
    this.episodeStartTime = Date.now();
    this.simulatedTime = this.episodeStartTime;

    // Initialize game (this will set countdownStartTime to real Date.now())
    const success = this.hideSeekManager.initializeGame(this.npcSystem.npcs);

    if (!success) {
      return [];
    }

    // NOW override with simulated time (AFTER initializeGame)
    const startTime = this.simulatedTime;
    this.hideSeekManager.countdownStartTime = startTime;
    this.hideSeekManager.gameStartTime =
      startTime + this.hideSeekManager.countdownTime;

    this.npcSystem.npcs.forEach((npc) => {
      npc.lastPosition = npc.position.clone();
      npc.explorationCells = new Set();
      npc.episodeSteps = 0;
    });

    this.currentActions.clear();
    this.currentVisionCache = null;

    const observations = this.collectObservations();

    return observations;
  }

  async executeStep(actions) {
    this.currentStep++;

    // Store actions for each agent
    for (const [agentId, action] of Object.entries(actions)) {
      this.currentActions.set(agentId, {
        movement_forward: action.movement_forward || 0,
        movement_strafe: action.movement_strafe || 0,
        rotation: action.rotation || 0,
        look: action.look || 0,
        jump: action.jump || false,
        place_block: action.place_block || false,
        remove_block: action.remove_block || false,
      });
    }

    const FRAMES_PER_STEP = 5;
    const deltaTime = 1.0 / 60.0;
    const frameDelay = this.DEBUG_MODE ? 16 : 0;

    const originalDateNow = Date.now;

    try {
      // Use simulated time
      Date.now = () => this.simulatedTime;

      // Physics simulation
      for (let frame = 0; frame < FRAMES_PER_STEP; frame++) {
        this.npcSystem.npcs.forEach((npc) => {
          if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

          const action = this.currentActions.get(npc.userData.id);
          if (action) {
            this.movementController.executeActionGroups(npc, action, deltaTime);
          }
        });

        this.hideSeekManager.update(deltaTime);
        this.simulatedTime += deltaTime * 1000;

        if (frameDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, frameDelay));
        }
      }
    } finally {
      Date.now = originalDateNow;
    }

    // Force game end if conditions met
    const gameState = this.hideSeekManager.getGameStatus();
    const elapsedTime = this.simulatedTime - this.episodeStartTime;
    const totalGameTime =
      NPC.HIDE_AND_SEEK.gameTimeLimit + NPC.HIDE_AND_SEEK.countdownTime;

    if (
      elapsedTime > totalGameTime &&
      gameState.state !== NPC.GAME_STATES.GAME_OVER
    ) {
      this.hideSeekManager.endGame("time_limit");
    }

    if (
      gameState.hidersFound >= gameState.totalHiders &&
      gameState.state !== NPC.GAME_STATES.GAME_OVER
    ) {
      this.hideSeekManager.endGame("all_found");
    }

    // Calculate vision once per step
    const visionCache = new Map();
    this.npcSystem.npcs.forEach((npc) => {
      if (npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
        const visionData = this.visionSystem.getVisionData(
          npc,
          this.npcSystem.npcs
        );
        visionCache.set(npc.userData.id, visionData);
      }
    });
    this.currentVisionCache = visionCache;

    // Calculate rewards using cached vision
    const rewards = {};

    this.npcSystem.npcs.forEach((npc) => {
      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) {
        rewards[npc.userData.id] = 0;
      } else {
        const visionData = visionCache.get(npc.userData.id);
        rewards[npc.userData.id] = this.calculateReward(
          npc,
          visionData,
          gameState
        );
        npc.episodeSteps++;
      }
    });

    // Log step data
    this.logger.logStep(this.currentStep, {
      rewards,
      gameState,
      elapsedTime,
    });

    const done = this.isEpisodeDone();

    if (done) {
      this.applyEndOfEpisodeRewards(rewards);
      this.logger.endEpisode(rewards, gameState);
    }

    // Collect observations using cached vision
    const observations = this.collectObservations();

    const stepResult = {
      agents: observations.map((obs) => ({
        id: obs.id,
        role: obs.role,
        observation: obs.observation,
        reward: rewards[obs.id] || 0,
        done:
          this.npcSystem.npcs.find((n) => n.userData.id === obs.id)
            ?.hideSeekState === NPC.GAME_STATES.FOUND || false,
      })),
      episode_done: done,
    };

    // Update last positions
    this.npcSystem.npcs.forEach((npc) => {
      npc.lastPosition.copy(npc.position);
    });

    // ADD THIS DEBUG LOG - only every 100 steps to avoid spam
    if (this.currentStep % 100 === 0) {
      console.log("📤 Sending to Python:", {
        step: this.currentStep,
        rewards: stepResult.agents
          .map((a) => `${a.id}:${a.reward.toFixed(2)}`)
          .join(", "),
      });
    }

    return stepResult;
  }

  calculateReward(npc, visionData, gameState) {
    let reward = 0;

    if (gameState.state !== NPC.GAME_STATES.SEEKING) {
      return 0;
    }

    if (npc.role === "seeker") {
      reward = this.calculateSeekerReward(npc, visionData);
    } else if (npc.role === "hider") {
      reward = this.calculateHiderReward(npc, visionData);
    }

    // Global time penalty
    reward += this.REWARD_CONFIG.TIME_PENALTY;

    return reward;
  }

  calculateSeekerReward(npc, visionData) {
    let reward = 0;

    // === VISIBILITY REWARDS (REDUCED) ===
    const visibleHiders = visionData.visibleNPCs.filter(
      (n) => n.role === "hider"
    );
    reward += visibleHiders.length * this.REWARD_CONFIG.SEEKER_SEES_HIDER;

    // === PROXIMITY & APPROACH REWARDS ===
    const hiders = this.npcSystem.npcs.filter(
      (n) => n.role === "hider" && n.hideSeekState !== NPC.GAME_STATES.FOUND
    );

    if (hiders.length > 0) {
      // Find closest hider
      let closestDist = Infinity;
      let closestHider = null;
      
      hiders.forEach((h) => {
        const dist = npc.position.distanceTo(h.position);
        if (dist < closestDist) {
          closestDist = dist;
          closestHider = h;
        }
      });

      // Distance-based bonus (closer = better)
      const proximityReward = Math.max(
        0,
        this.REWARD_CONFIG.SEEKER_CLOSE_BONUS * (1.0 - closestDist / 50)
      );
      reward += proximityReward;

      // Very close bonus
      if (closestDist < 10) {
        reward += this.REWARD_CONFIG.SEEKER_VERY_CLOSE;
      }

      // ✅ APPROACH REWARD - reward for getting closer
      if (npc.lastClosestDistance !== undefined) {
        const distanceChange = npc.lastClosestDistance - closestDist;
        
        if (distanceChange > 0.05) {
          // Getting closer! Good!
          const approachReward = this.REWARD_CONFIG.SEEKER_APPROACHING_BONUS * distanceChange;
          reward += approachReward;
        } else if (distanceChange < -0.05) {
          // Getting farther! Bad!
          const retreatPenalty = this.REWARD_CONFIG.SEEKER_RETREATING_PENALTY * Math.abs(distanceChange);
          reward += retreatPenalty;
        }
      }
      npc.lastClosestDistance = closestDist;
    }

    // === EXPLORATION REWARD ===
    const cellKey = `${Math.floor(npc.position.x)},${Math.floor(
      npc.position.z
    )}`;
    if (!npc.explorationCells) {
      npc.explorationCells = new Set();
    }
    if (!npc.explorationCells.has(cellKey)) {
      npc.explorationCells.add(cellKey);
      reward += this.REWARD_CONFIG.SEEKER_EXPLORATION;
    }

    // === MOVEMENT ANALYSIS ===
    const horizontalSpeed = Math.sqrt(
      npc.velocity.x * npc.velocity.x + npc.velocity.z * npc.velocity.z
    );

    // Calculate angular velocity (rotation speed)
    if (npc.lastYaw === undefined) {
      npc.lastYaw = npc.yaw;
    }
    
    let yawDiff = npc.yaw - npc.lastYaw;
    // Normalize angle difference to [-PI, PI]
    while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
    while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;
    
    const angularSpeed = Math.abs(yawDiff) * 60; // Convert to degrees/sec equivalent
    npc.lastYaw = npc.yaw;

    // ✅ DETECT SPINNING EXPLOIT
    // If rotating fast (>30 deg/sec) but barely moving (<0.5 units/sec)
    if (angularSpeed > 0.5 && horizontalSpeed < 0.5) {
      reward += this.REWARD_CONFIG.SEEKER_ROTATION_ONLY_PENALTY;
    }

    // ✅ STATIONARY PENALTY
    if (horizontalSpeed < 0.3) {
      reward += this.REWARD_CONFIG.SEEKER_STATIONARY_PENALTY;
    }

    // === BOUNDARY PENALTIES ===
    const boundaryDist = this.getDistanceToBoundary(npc.position);
    
    if (boundaryDist < 2.0) {
      reward += this.REWARD_CONFIG.NEAR_BOUNDARY_PENALTY;
    }
    
    if (boundaryDist < 0.5) {
      reward += this.REWARD_CONFIG.BOUNDARY_HIT_PENALTY;
    }

    return reward;
  }

  calculateHiderReward(npc, visionData) {
    let reward = 0;

    const seekers = this.npcSystem.npcs.filter((n) => n.role === "seeker");
    
    // === VISIBILITY PENALTY ===
    const seenByAny = this.visionSystem.isVisibleToAny(npc, seekers);

    if (seenByAny) {
      reward += this.REWARD_CONFIG.HIDER_SEEN_PENALTY;
    } else {
      // ✅ REWARD STAYING HIDDEN
      reward += this.REWARD_CONFIG.HIDER_DISTANCE_REWARD * 0.3; // Small bonus per step hidden
    }

    // === DISTANCE FROM SEEKER ===
    if (seekers.length > 0) {
      let closestSeekerDist = Infinity;
      
      seekers.forEach((s) => {
        const dist = npc.position.distanceTo(s.position);
        if (dist < closestSeekerDist) {
          closestSeekerDist = dist;
        }
      });

      // Reward being far from seeker
      const distanceReward = Math.min(
        this.REWARD_CONFIG.HIDER_DISTANCE_REWARD,
        this.REWARD_CONFIG.HIDER_DISTANCE_REWARD * (closestSeekerDist / 50)
      );
      reward += distanceReward;

      // === PANIC MODE HANDLING ===
      const horizontalSpeed = Math.sqrt(
        npc.velocity.x * npc.velocity.x + npc.velocity.z * npc.velocity.z
      );

      if (closestSeekerDist < 15) {
        // Seeker is close! Should be moving!
        if (horizontalSpeed < 0.3) {
          // Freezing in panic - BAD
          reward += this.REWARD_CONFIG.HIDER_PANIC_PENALTY;
        } else {
          // Running away - GOOD
          reward += this.REWARD_CONFIG.HIDER_ESCAPE_BONUS;
          
          // ✅ BONUS: Moving away from seeker
          if (npc.lastSeekerDistance !== undefined) {
            const distChange = closestSeekerDist - npc.lastSeekerDistance;
            if (distChange > 0.05) {
              // Increasing distance = good
              reward += this.REWARD_CONFIG.HIDER_SMART_MOVEMENT_BONUS * distChange;
            }
          }
        }
        npc.lastSeekerDistance = closestSeekerDist;
      } else {
        // Safe distance - can afford to be still (but slight penalty)
        if (horizontalSpeed < 0.1) {
          reward += this.REWARD_CONFIG.HIDER_STATIONARY_PENALTY;
        }
      }
    }

    // === BOUNDARY PENALTIES ===
    const boundaryDist = this.getDistanceToBoundary(npc.position);
    
    if (boundaryDist < 2.0) {
      reward += this.REWARD_CONFIG.NEAR_BOUNDARY_PENALTY;
    }
    
    if (boundaryDist < 0.5) {
      reward += this.REWARD_CONFIG.BOUNDARY_HIT_PENALTY;
    }

    return reward;
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  getDistanceToBoundary(position) {
    const worldSize = this.chunkManager?.worldConfig?.SIZE || 100;
    
    const distToNorth = position.z;
    const distToSouth = worldSize - position.z;
    const distToWest = position.x;
    const distToEast = worldSize - position.x;
    
    return Math.min(distToNorth, distToSouth, distToWest, distToEast);
  }

  applyEndOfEpisodeRewards(rewards) {
    const allHidersFound =
      this.hideSeekManager.hidersFound === this.hideSeekManager.hiders.length;

    const seekers = this.hideSeekManager.seekers || [];
    const hiders = this.hideSeekManager.hiders || [];

    const caughtHiders = new Set();
    hiders.forEach((hider) => {
      if (hider.hideSeekState === NPC.GAME_STATES.FOUND) {
        caughtHiders.add(hider.userData.id);
      }
    });

    this.npcSystem.npcs.forEach((npc) => {
      let bonus = 0;

      const isSeeker = seekers.some((s) => s.userData.id === npc.userData.id);
      const isHider = hiders.some((h) => h.userData.id === npc.userData.id);

      if (isSeeker) {
        if (allHidersFound) {
          bonus = this.REWARD_CONFIG.SEEKER_SUCCESS;
        } else {
          bonus = this.REWARD_CONFIG.SEEKER_FAILURE;
        }

        const partialBonus =
          this.hideSeekManager.hidersFound * this.REWARD_CONFIG.SEEKER_PARTIAL;
        bonus += partialBonus;
      } else if (isHider) {
        const wasCaught = caughtHiders.has(npc.userData.id);

        if (!wasCaught) {
          bonus = this.REWARD_CONFIG.HIDER_SURVIVAL;
        } else {
          bonus = this.REWARD_CONFIG.HIDER_CAUGHT;
        }
      }

      const prevReward = rewards[npc.userData.id] || 0;
      rewards[npc.userData.id] = prevReward + bonus;
    });
  }

  // ============================================================
  // OBSERVATION COLLECTION
  // ============================================================

  collectObservations() {
    const observations = [];

    for (const npc of this.npcSystem.npcs) {
      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) continue;

      const gameState = this.hideSeekManager.getGameStatus();

      // Use cached vision data if available
      const perceptionData =
        this.currentVisionCache?.get(npc.userData.id) ||
        this.visionSystem.getVisionData(npc, this.npcSystem.npcs);

      const state = this.encoder.encode(
        npc,
        gameState,
        perceptionData,
        TRAINING_WORLD_CONFIG.SIZE
      );

      observations.push({
        id: npc.userData.id,
        role: npc.role,
        observation: Array.from(state),
      });
    }

    return observations;
  }

  isEpisodeDone() {
    const gameStatus = this.hideSeekManager.getGameStatus();
    return gameStatus.state === NPC.GAME_STATES.GAME_OVER;
  }

  disconnect() {
    if (this.wsClient) {
      this.wsClient.close();
      this.connected = false;
    }
  }
}

export default PPOTrainingBridge;
