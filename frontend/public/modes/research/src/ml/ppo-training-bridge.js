// ==============================================================
// FILE: research/src/ml/ppo-training-bridge.js
// ==============================================================

import { PPOWebSocketClient } from "./websocket-client.js";
import { StateEncoder } from "./state-encoder.js";
import { NPCVisionSystem } from "../npc/physics/npc-vision-system.js";
import { NPC } from "../npc/config-npc-behavior.js";
import { regenerateTerrain } from "../world/terrain-generator.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";

export class PPOTrainingBridge {
  constructor(npcSystem, hideSeekManager, chunkManager) {
    this.npcSystem = npcSystem;
    this.hideSeekManager = hideSeekManager;
    this.movementController = npcSystem.movementController;
    this.chunkManager = chunkManager;
    this.wsClient = new PPOWebSocketClient();
    this.encoder = new StateEncoder();
    this.encoder.chunkManager = chunkManager;
    this.visionSystem = new NPCVisionSystem({
      visionRange: NPC.VISION.visionRange,
      visionAngle: NPC.VISION.visionAngle,
      rayCount: NPC.VISION.rayCount,
      rayAngleTolerance: NPC.VISION.rayAngleTolerance || 0.996,
      debug: false, // Always false for training
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
    this.DEBUG_MODE = false; // Set to true to see visual training
    this.episodeStartTime = 0;
    this.simulatedTime = 0;
  }

  async connect() {
    try {
      await this.wsClient.connect();
      this.connected = true;
      console.log("✅ Connected to Python training backend");
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
    console.log("🚀 PPO Training started");

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
        console.error("❌ Training error:", error);
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
    console.log("🎮 PPO Demo started - watching trained agents");

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
        console.error("❌ Demo error:", error);
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
    console.log("🛑 PPO Training stopped");
  }

  async resetEpisode(episodeNum) {
    this.currentEpisode = episodeNum;
    this.currentStep = 0;

    if (window.hideSeekUI) {
      window.hideSeekUI.updateTrainingEpisode(episodeNum);
    }

    console.log(`\n🔄 Episode ${episodeNum} - Reset`);

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
      console.error("❌ Failed to initialize game");
      return [];
    }

    // NOW override with simulated time (AFTER initializeGame)
    const startTime = this.simulatedTime;
    this.hideSeekManager.countdownStartTime = startTime;
    this.hideSeekManager.gameStartTime =
      startTime + this.hideSeekManager.countdownTime;

    // ADD THIS LOG:
    console.log(`⏰ Episode ${episodeNum} timing:`, {
      simulatedTime: this.simulatedTime,
      countdownStartTime: this.hideSeekManager.countdownStartTime,
      gameStartTime: this.hideSeekManager.gameStartTime,
      countdownDuration: this.hideSeekManager.countdownTime,
    });

    // Initialize NPC tracking
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

    const FRAMES_PER_STEP = 20;
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

      // ADDED: Debug logging every 10 steps
      if (this.currentStep % 10 === 0) {
        const elapsedTime = this.simulatedTime - this.episodeStartTime;
        const gameState = this.hideSeekManager.getGameStatus();
        console.log(`⏱️ Step ${this.currentStep}:`, {
          elapsed: `${(elapsedTime / 1000).toFixed(1)}s`,
          state: gameState.state,
          gameTime: `${(gameState.gameTime / 1000).toFixed(1)}s`,
          hidersFound: `${gameState.hidersFound}/${gameState.totalHiders}`,
        });
      }
    } finally {
      Date.now = originalDateNow;
    }

    // ADDED: Force game end if conditions met
    const gameState = this.hideSeekManager.getGameStatus();
    const elapsedTime = this.simulatedTime - this.episodeStartTime;
    const totalGameTime =
      NPC.HIDE_AND_SEEK.gameTimeLimit + NPC.HIDE_AND_SEEK.countdownTime;

    if (
      elapsedTime > totalGameTime &&
      gameState.state !== NPC.GAME_STATES.GAME_OVER
    ) {
      console.warn(
        `⚠️ Force ending - time exceeded: ${(elapsedTime / 1000).toFixed(
          1
        )}s > ${(totalGameTime / 1000).toFixed(1)}s`
      );
      this.hideSeekManager.endGame("time_limit");
    }

    if (
      gameState.hidersFound >= gameState.totalHiders &&
      gameState.state !== NPC.GAME_STATES.GAME_OVER
    ) {
      console.warn(
        `⚠️ Force ending - all hiders found: ${gameState.hidersFound}/${gameState.totalHiders}`
      );
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

    if (this.currentStep % 10 === 0 || this.currentStep === 1) {
      const elapsedTime = this.simulatedTime - this.episodeStartTime;
      const totalReward = Object.values(rewards).reduce((a, b) => a + b, 0);

      console.log(`\n📊 Step ${this.currentStep} Rewards:`, {
        elapsed: `${(elapsedTime / 1000).toFixed(1)}s`,
        gameState: gameState.state,
        totalReward: totalReward.toFixed(3),
        individual: Object.entries(rewards)
          .map(([id, r]) => `${id}:${r.toFixed(3)}`)
          .join(", "),
      });

      // Check if game is in SEEKING phase
      if (gameState.state !== NPC.GAME_STATES.SEEKING) {
        console.warn(
          `⚠️ Not in SEEKING phase! State: ${gameState.state} - All rewards will be 0!`
        );
      }
    }

    const done = this.isEpisodeDone();

    if (done) {
      this.applyEndOfEpisodeRewards(rewards);

      if (this.DEBUG_MODE) {
        console.log("🏁 Episode End - Final Rewards:", rewards);
      }
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

    return stepResult;
  }

  // ============================================================
  // REWARD CALCULATION
  // ============================================================

  calculateReward(npc, visionData, gameState) {
    let reward = 0;

    if (gameState.state !== NPC.GAME_STATES.SEEKING) {
      return 0;
    }

    if (npc.role === "seeker") {
      const visibleHiders = visionData.visibleNPCs.filter(
        (n) => n.role === "hider"
      );
      reward += visibleHiders.length * 1.0; // REDUCED from 2.0

      const hiders = this.npcSystem.npcs.filter(
        (n) => n.role === "hider" && n.hideSeekState !== NPC.GAME_STATES.FOUND
      );

      if (hiders.length > 0) {
        const closestDist = Math.min(
          ...hiders.map((h) => npc.position.distanceTo(h.position))
        );

        // REDUCED distance reward
        reward += Math.max(0, 0.5 * (1.0 - closestDist / 50)); // Was 2.0
      }

      const cellKey = `${Math.floor(npc.position.x)},${Math.floor(
        npc.position.z
      )}`;
      if (!npc.explorationCells.has(cellKey)) {
        npc.explorationCells.add(cellKey);
        reward += 0.02; // REDUCED from 0.05
      }
    } else if (npc.role === "hider") {
      const seekers = this.npcSystem.npcs.filter((n) => n.role === "seeker");
      const seenByAny = this.visionSystem.isVisibleToAny(npc, seekers);

      if (seenByAny) {
        reward -= 1.0; // REDUCED from 2.0
      }

      if (seekers.length > 0) {
        const closestDist = Math.min(
          ...seekers.map((s) => npc.position.distanceTo(s.position))
        );

        // REDUCED distance reward
        reward += Math.min(0.5, 0.5 * (closestDist / 50)); // Was 2.0
      }

      const horizontalSpeed = Math.sqrt(
        npc.velocity.x * npc.velocity.x + npc.velocity.z * npc.velocity.z
      );
      if (horizontalSpeed < 0.1) {
        reward -= 0.05; // REDUCED from 0.1
      }
    }

    reward -= 0.0001; // REDUCED time penalty

    return reward;
  }

  applyEndOfEpisodeRewards(rewards) {
    const allHidersFound =
      this.hideSeekManager.hidersFound === this.hideSeekManager.hiders.length;

    const seekers = this.hideSeekManager.seekers || [];
    const hiders = this.hideSeekManager.hiders || [];

    console.log(`\n🏁 EPISODE END - Applying final bonuses:`);
    console.log(
      `   Hiders found: ${this.hideSeekManager.hidersFound}/${hiders.length}`
    );
    console.log(`   All caught: ${allHidersFound}`);

    // ✅ ADDED: Store caught state BEFORE it might be cleared
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
          bonus = 50.0;
          console.log(`   🦊 ${npc.userData.id}: All caught! Bonus: +${bonus}`);
        } else {
          bonus = -20.0;
          console.log(`   🦊 ${npc.userData.id}: Failed. Penalty: ${bonus}`);
        }

        const partialBonus = this.hideSeekManager.hidersFound * 30.0;
        bonus += partialBonus;
        if (partialBonus > 0) {
          console.log(
            `   🦊 ${npc.userData.id}: Partial credit: +${partialBonus}`
          );
        }
      } else if (isHider) {
        // ✅ CHANGED: Check the stored caught state instead
        const wasCaught = caughtHiders.has(npc.userData.id);

        if (!wasCaught) {
          bonus = 50.0;
          console.log(`   🐔 ${npc.userData.id}: Survived! Bonus: +${bonus}`);
        } else {
          bonus = -20.0;
          console.log(`   🐔 ${npc.userData.id}: Caught! Penalty: ${bonus}`);
        }
      }

      const prevReward = rewards[npc.userData.id] || 0;
      rewards[npc.userData.id] = prevReward + bonus;

      console.log(
        `   ${npc.userData.id}: ${prevReward.toFixed(2)} + ${bonus.toFixed(
          2
        )} = ${rewards[npc.userData.id].toFixed(2)}`
      );
    });

    console.log(
      `🎁 Final: ${Object.entries(rewards)
        .map(([id, r]) => `${id}:${r.toFixed(2)}`)
        .join(", ")}`
    );
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
    const done = gameStatus.state === NPC.GAME_STATES.GAME_OVER;

    // ADDED: Debug logging
    if (this.currentStep % 10 === 0 || done) {
      console.log(`🔍 Episode done check (step ${this.currentStep}):`, {
        state: gameStatus.state,
        done: done,
        hidersFound: `${gameStatus.hidersFound}/${gameStatus.totalHiders}`,
      });
    }

    return done;
  }

  disconnect() {
    if (this.wsClient) {
      this.wsClient.close();
      this.connected = false;
    }
  }
}

export default PPOTrainingBridge;
