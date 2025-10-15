// ==============================================================
// FILE: research/src/npc/npc-system.js (UPDATED)
// ==============================================================

import { createPlayer } from "../../../../src/player/players.js";
import * as GameState from "../../../../src/core/game-state.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as NPCPhysics from "../npc/physics/npc-physics.js";
import { NPC } from "./config-npc-behavior.js";
import HideSeekManager from "./hide-seek-manager.js";
import NPCMovementController from "./physics/npc-movement-controller.js";
import { NPCSystemLogger } from "../ml/log/npc-system-logger.js";
import sessionManager from "../ml/log/session-manager.js";
import { getCurrentTerrainSeed } from "../world/terrain-generator.js";

window.NPCPhysics = NPCPhysics;

class NPCSystem {
  constructor(scene, chunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.npcs = [];
    this.npcCount = 0;
    this.active = false;
    this.gameMode = "hide_and_seek";

    this.hideSeekManager = new HideSeekManager(scene);
    this.lastUpdate = Date.now();
    this.movementController = new NPCMovementController(scene, chunkManager);
    this.seekerCount = 0;
    this.hiderCount = 0;

    this.logger = new NPCSystemLogger("http://localhost:3001", {
      enabled: true,
      logLevel: "INFO",
      sessionDir: sessionManager.getSessionDir(),
    });

    this.settings = {
      maxNPCs: 10,
      spawnDistance: {
        min: 8,
        max: 20,
      },
      minNPCDistance: 5,
    };

    this.skins = {
      seeker: "../../../assets/images/skins/fox.png",
      hider: "../../../assets/images/skins/chicken.png",
      default: "../../../assets/images/skins/1.png",
    };
  }

  // ============================================================
  // TERRAIN HEIGHT CALCULATION (same as player spawn)
  // ============================================================

  initialize() {
    return this;
  }

  findValidSpawnPosition() {
    const worldSize = TRAINING_WORLD_CONFIG.SIZE;
    const buffer = 5; // Stay away from edges

    for (let attempt = 0; attempt < 50; attempt++) {
      // Random position in world
      const x = buffer + Math.random() * (worldSize - buffer * 2);
      const z = buffer + Math.random() * (worldSize - buffer * 2);

      // Center on block
      const blockX = Math.floor(x) + 0.5;
      const blockZ = Math.floor(z) + 0.5;

      // Find ground height
      const y = this.findSafeSpawnHeight(blockX, blockZ);

      // Check headroom
      const headPos = new THREE.Vector3(blockX, y + 1.8, blockZ);
      const headCheck = NPCPhysics.checkNPCCollision(headPos, this.scene);

      if (headCheck.collides) continue;

      // Check distance to other NPCs
      const spawnPos = new THREE.Vector3(blockX, y, blockZ);
      const tooClose = this.npcs.some((npc) => {
        return npc.position.distanceTo(spawnPos) < this.settings.minNPCDistance;
      });

      if (!tooClose) {
        return { x: blockX, y, z: blockZ };
      }
    }

    // Fallback: world center
    const centerX = worldSize / 2 + 0.5;
    const centerZ = worldSize / 2 + 0.5;
    const centerY = this.findSafeSpawnHeight(centerX, centerZ);

    return { x: centerX, y: centerY, z: centerZ };
  }

  generateNPCs(count = null) {
    if (this.gameMode === "hide_and_seek") {
      const totalNPCs =
        NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;

      if (this.npcs.length > 0) {
        return this.npcs;
      }
      this.seekerCount = 0;
      this.hiderCount = 0;

      count = totalNPCs;
    } else if (count === null) {
      count = 3;
    }

    const spawnCount = Math.min(
      count,
      this.settings.maxNPCs - this.npcs.length
    );

    if (!GameState.player) {
      return this.npcs;
    }

    for (let i = 0; i < spawnCount; i++) {
      this.spawnNPC(i);
    }

    if (!this.active && this.npcs.length > 0) {
      this.startNPCSystem();
    }

    const requiredNPCs =
      NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;
    if (this.gameMode === "hide_and_seek" && this.npcs.length >= requiredNPCs) {
      setTimeout(() => this.startHideAndSeekGame(), 1000);
    }

    return this.npcs;
  }

  spawnNPC(index = 0, position = null) {
    const spawnPos = position || this.findValidSpawnPosition();
    if (!spawnPos) {
      this.logger.logSpawnFailure("No valid position found", { attempts: 100 });
      return null;
    }

    let id;
    let skin;
    let role;

    if (this.gameMode === "hide_and_seek") {
      const seekerCount = NPC.HIDE_AND_SEEK.seekerCount;

      if (index < seekerCount) {
        this.seekerCount++;
        id = `seeker-${this.seekerCount}`;
        skin = this.skins.seeker;
        role = "seeker";
      } else {
        this.hiderCount++;
        id = `hider-${this.hiderCount}`;
        skin = this.skins.hider;
        role = "hider";
      }
    } else {
      id = `npc-${++this.npcCount}`;
      skin = this.skins.default;
      role = "default";
    }

    this.logger.logSpawnAttempt(index, spawnPos, role);

    const npc = createPlayer(
      this.scene,
      {
        id,
        position: spawnPos,
        rotation: Math.random() * Math.PI * 2,
        isFlying: false,
        collisionsEnabled: true,
      },
      skin,
      false
    );

    this.initializeNPC(npc);
    this.npcs.push(npc);

    this.logger.logSpawnSuccess(id, spawnPos, role);

    return npc;
  }

  initializeNPC(npc) {
    npc.isNPC = true;
    npc.velocity = { x: 0, y: 0, z: 0 };
    npc.isOnGround = true;
    npc.isMoving = false;
    npc.jumpCooldown = 0;
    npc.moveDirection = new THREE.Vector3(0, 0, 0);

    npc.role = null;
    npc.hideSeekState = null;
    npc.mlControlled = false;

    this.movementController.initializeNPC(npc);
  }

  removeAllNPCs() {
    if (this.hideSeekManager.gameRunning) {
      this.hideSeekManager.endGame("manual_stop");
    }

    const count = this.npcs.length;

    for (const npc of this.npcs) {
      if (npc.parent) {
        this.scene.remove(npc);
      }
    }

    this.npcs = [];
    this.npcCount = 0;
    this.seekerCount = 0;
    this.hiderCount = 0;

    this.logger.logAllNPCsRemoved(count);
  }

  findSafeSpawnHeight(x, z) {
    // Start scanning from a reasonable high point
    const maxY =
      TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL +
      TRAINING_WORLD_CONFIG.TERRAIN_HEIGHT_RANGE +
      5;
    const minY = TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL - 5;

    // Scan down in small steps
    for (let y = maxY; y >= minY; y -= 0.5) {
      const testPos = new THREE.Vector3(x, y, z);
      const belowPos = new THREE.Vector3(x, y - 0.5, z);

      // Check if current position is air and below is solid
      const currentCheck = NPCPhysics.checkNPCCollision(testPos, this.scene);
      const belowCheck = NPCPhysics.checkNPCCollision(belowPos, this.scene);

      // Found ground: air above, solid below
      if (!currentCheck.collides && belowCheck.collides) {
        // Return position slightly above the solid block
        return y + 0.5;
      }
    }

    // No ground found - return a safe fallback
    console.warn(`No ground found at (${x}, ${z}), using fallback`);
    return TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL + 10;
  }

  startNPCSystem() {
    if (this.active) return;
    this.active = true;
    this.logger.logSystemStart();
  }

  update(deltaTime) {
    if (!this.active) return;

    this.hideSeekManager.update(deltaTime);

    for (const npc of this.npcs) {
      if (!npc.visible || !npc.parent) continue;

      if (npc.hideSeekState === NPC.GAME_STATES.FOUND) {
        npc.isMoving = false;
        npc.velocity = { x: 0, y: 0, z: 0 };
        continue;
      }

      if (npc.role === "seeker" && npc.inPreparationPhase) {
        npc.velocity = { x: 0, y: 0, z: 0 };
        npc.isMoving = false;
        continue;
      }

      NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);
      this.publishNPCMovement(npc);
    }
  }

  respawnNPC(npc) {
    if (npc.hideSeekState === NPC.GAME_STATES.FOUND) return;

    const oldPos = { ...npc.position };
    const newPos = this.findValidSpawnPosition();

    if (newPos) {
      npc.position.set(newPos.x, newPos.y, newPos.z);
      NPCPhysics.resetNPCPhysics(npc);
      this.logger.logRespawn(npc.userData?.id, oldPos, newPos);
    }
  }

  publishNPCMovement(npc) {
    GameState.publish(GameState.EVENTS.PLAYER_MOVED, {
      id: npc.userData?.id,
      position: npc.position,
      rotation: npc.yaw,
      isFlying: false,
      isMoving: npc.isMoving,
    });
  }

  startHideAndSeekGame() {
    const requiredNPCs =
      NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;

    if (this.npcs.length < requiredNPCs) {
      this.logger.logInsufficientNPCs(requiredNPCs, this.npcs.length);
      return false;
    }

    this.logger.logHideSeekStart(
      NPC.HIDE_AND_SEEK.seekerCount,
      NPC.HIDE_AND_SEEK.hiderCount
    );

    return this.hideSeekManager.initializeGame(this.npcs);
  }

  restartHideSeekGame() {
    this.logger.logHideSeekRestart();
    this.hideSeekManager.restartGame();
  }

  getHideSeekStatus() {
    return this.hideSeekManager.getGameStatus();
  }

  setGameMode(mode) {
    const oldMode = this.gameMode;
    this.gameMode = mode;
    this.logger.logGameModeChange(oldMode, mode);
    this.removeAllNPCs();
  }

  getNPCsByRole(role) {
    return this.npcs.filter((npc) => npc.role === role);
  }

  cleanup() {
    this.logger.logStats();
    this.logger.close();
  }
}

export default NPCSystem;
