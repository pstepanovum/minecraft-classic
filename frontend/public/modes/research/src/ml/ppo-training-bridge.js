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
      rayPrecisionAngle: NPC.VISION.rayPrecisionAngle,
      debug: false,
    });

    if (chunkManager) {
      this.visionSystem.setChunkManager(chunkManager);
    }

    this.connected = false;
    this.training = false;
    this.currentEpisode = 0;
    this.currentActions = new Map();

    // ADD: Debug mode and simulated time tracking
    this.DEBUG_MODE = false; // Set to false for fast training
    this.episodeStartTime = 0;
    this.simulatedTime = 0;
  }

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
    if (!this.connected) {
      return;
    }

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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stopTraining() {
    this.training = false;
  }

  async resetEpisode(episodeNum) {
    this.currentEpisode = episodeNum;

    if (this.hideSeekManager.gameRunning) {
      this.hideSeekManager.endGame("episode_reset");
    }

    await regenerateTerrain(this.chunkManager);
    this.npcSystem.removeAllNPCs();
    this.npcSystem.generateNPCs();

    const success = this.hideSeekManager.initializeGame(this.npcSystem.npcs);

    if (!success) {
      return [];
    }

    // Initialize simulated time for this episode
    this.episodeStartTime = Date.now();
    this.simulatedTime = this.episodeStartTime;

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

    const observations = this.collectObservations();

    return observations;
  }

  async executeStep(actions) {
    // Store actions for each agent
    for (const [agentId, action] of Object.entries(actions)) {
      // Convert Python continuous actions to JavaScript format
      // Python sends: {movement_forward, movement_strafe, rotation, look, jump}
      this.currentActions.set(agentId, {
        movement_forward: action.movement_forward || 0,
        movement_strafe: action.movement_strafe || 0,
        rotation: action.rotation || 0,
        look: action.look || 0,
        jump: action.jump || false,
      });
    }

    const FRAMES_PER_STEP = 60;
    const deltaTime = 1.0 / 60.0;
    const frameDelay = this.DEBUG_MODE ? 16 : 0;

    const gameStateBefore = this.hideSeekManager.getGameStatus();
    const originalDateNow = Date.now;

    try {
      // Use accumulated simulated time instead of real time
      Date.now = () => this.simulatedTime;

      for (let frame = 0; frame < FRAMES_PER_STEP; frame++) {
        this.npcSystem.npcs.forEach((npc) => {
          if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

          const action = this.currentActions.get(npc.userData.id);
          if (action) {
            // Pass continuous actions to movement controller
            // The controller will detect the format and use continuous execution
            this.movementController.executeActionGroups(npc, action, deltaTime);
          }
        });

        this.hideSeekManager.update(deltaTime);
        this.simulatedTime += deltaTime * 1000;

        // Add delay for debug visualization
        if (frameDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, frameDelay));
        }
      }
    } finally {
      Date.now = originalDateNow;
    }

    const gameStateAfter = this.hideSeekManager.getGameStatus();
    const rewards = {};

    this.npcSystem.npcs.forEach((npc) => {
      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) {
        rewards[npc.userData.id] = 0;
      } else {
        rewards[npc.userData.id] = this.calculateSimpleReward(npc);
        npc.episodeSteps++;
      }

      if (this.DEBUG_MODE) {
        console.log(
          `💰 ${npc.userData.id} reward: ${rewards[npc.userData.id].toFixed(3)}`
        );
      }
    });

    const done = this.isEpisodeDone();
    if (done) {
      this.applyEndOfEpisodeRewards(rewards);

      if (this.DEBUG_MODE) {
        console.log("🏁 EPISODE END REWARDS:", rewards);
      }
    }

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

    this.npcSystem.npcs.forEach((npc) => {
      npc.lastPosition.copy(npc.position);
    });

    return stepResult;
  }

  calculateSimpleReward(npc) {
    let reward = 0;
    reward -= 0.01;

    const cellX = Math.floor(npc.position.x);
    const cellZ = Math.floor(npc.position.z);
    const cellKey = `${cellX},${cellZ}`;

    if (!npc.explorationCells.has(cellKey)) {
      npc.explorationCells.add(cellKey);
      reward += 0.1;
    }

    return reward;
  }

  applyEndOfEpisodeRewards(rewards) {
    const allHidersFound =
      this.hideSeekManager.hidersFound === this.hideSeekManager.hiders.length;

    this.npcSystem.npcs.forEach((npc) => {
      let bonus = 0;

      if (npc.role === "seeker") {
        if (allHidersFound) {
          bonus = 20.0;
        } else {
          bonus = -10.0;
        }
      } else if (npc.role === "hider") {
        if (npc.hideSeekState !== NPC.GAME_STATES.FOUND) {
          bonus = 15.0;
        } else {
          bonus = -10.0;
        }
      }

      rewards[npc.userData.id] = (rewards[npc.userData.id] || 0) + bonus;
    });
  }

  collectObservations() {
    const observations = [];

    for (const npc of this.npcSystem.npcs) {
      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) continue;

      const gameState = this.hideSeekManager.getGameStatus();
      const perceptionData = this.visionSystem.getVisionData(
        npc,
        this.npcSystem.npcs
      );

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
