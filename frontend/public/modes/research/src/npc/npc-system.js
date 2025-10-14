// ==============================================================
// FILE: research/src/npc/npc-system.js
// ==============================================================

import { createPlayer } from "../../../../src/player/players.js";
import * as GameState from "../../../../src/core/game-state.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as NPCPhysics from "../npc/physics/npc-physics.js";
import { NPC } from "./config-npc-behavior.js";
import HideSeekManager from "./hide-seek-manager.js";
import NPCMovementController from "./physics/npc-movement-controller.js";

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

  initialize() {
    return this;
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
      return null;
    }

    let id;
    let skin;

    if (this.gameMode === "hide_and_seek") {
      const seekerCount = NPC.HIDE_AND_SEEK.seekerCount;

      if (index < seekerCount) {
        this.seekerCount++;
        id = `seeker-${this.seekerCount}`;
        skin = this.skins.seeker;
      } else {
        this.hiderCount++;
        id = `hider-${this.hiderCount}`;
        skin = this.skins.hider;
      }
    } else {
      id = `npc-${++this.npcCount}`;
      skin = this.skins.default;
    }

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

    for (const npc of this.npcs) {
      if (npc.parent) {
        this.scene.remove(npc);
      }
    }

    this.npcs = [];
    this.npcCount = 0;
    this.seekerCount = 0;
    this.hiderCount = 0;
  }

  findValidSpawnPosition() {
    if (!GameState.player) return null;

    const playerPos = GameState.player.position;
    const { min, max } = this.settings.spawnDistance;

    for (let attempts = 0; attempts < 100; attempts++) {  // Increased from 50
      const distance = min + Math.random() * (max - min);
      const angle = Math.random() * Math.PI * 2;

      const x = playerPos.x + Math.cos(angle) * distance;
      const z = playerPos.z + Math.sin(angle) * distance;
      const groundY = this.findGroundLevel(x, z);

      if (groundY > 0) {
        // ✅ ADDED: Spawn with buffer above ground
        const spawnY = groundY + 0.5;  // Half block above ground for safety
        const spawnPos = new THREE.Vector3(x, spawnY, z);
        
        // ✅ IMPROVED: Check more headroom (NPC is 1.7 blocks tall)
        const hasHeadroom = this.checkHeadroom(spawnPos, 2.0);
        const collision = NPCPhysics.checkNPCCollision(spawnPos, this.scene);
        
        if (!collision.collides && hasHeadroom) {
          const tooCloseToOthers = this.npcs.some((npc) => {
            const dist = npc.position.distanceTo(spawnPos);
            return dist < this.settings.minNPCDistance;
          });

          if (!tooCloseToOthers) {
            console.log(`✅ Valid spawn found at (${x.toFixed(1)}, ${spawnY.toFixed(1)}, ${z.toFixed(1)})`);
            return { x, y: spawnY, z };
          }
        }
      }
    }

    // ✅ IMPROVED: Better fallback with actual ground detection
    console.warn("⚠️ Using fallback spawn position");
    const fallbackAngle = Math.random() * Math.PI * 2;
    const fallbackDist = 15;
    const fallbackX = playerPos.x + Math.cos(fallbackAngle) * fallbackDist;
    const fallbackZ = playerPos.z + Math.sin(fallbackAngle) * fallbackDist;
    const fallbackY = this.findGroundLevel(fallbackX, fallbackZ);
    
    if (fallbackY > 0) {
      return {
        x: fallbackX,
        y: fallbackY + 1.0,  // 1 block above ground for safety
        z: fallbackZ,
      };
    }
    
    // ✅ LAST RESORT: Use world center at high altitude
    console.error("❌ Could not find valid spawn! Using world center");
    const worldSize = TRAINING_WORLD_CONFIG.SIZE;
    return {
      x: worldSize / 2,
      y: TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL + 10,
      z: worldSize / 2,
    };
  }

  checkHeadroom(position, requiredHeight) {
    const testPos = new THREE.Vector3();
    
    for (let y = 0; y <= requiredHeight; y += 0.5) {
      testPos.copy(position);
      testPos.y += y;
      
      const collision = NPCPhysics.checkNPCCollision(testPos, this.scene);
      if (collision.collides) {
        return false;
      }
    }
    
    return true;
  }

  findGroundLevel(x, z) {
    const startY = TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL + 30;
    const testPosition = new THREE.Vector3(x, startY, z);

    for (let y = startY; y > 0; y -= 0.5) {
      testPosition.y = y;
      const currentCollision = NPCPhysics.checkNPCCollision(
        testPosition,
        this.scene
      );

      testPosition.y = y - 0.5;
      const belowCollision = NPCPhysics.checkNPCCollision(
        testPosition,
        this.scene
      );

      // ✅ SIMPLIFIED: Current pos clear, below is solid = ground!
      if (!currentCollision.collides && belowCollision.collides) {
        return y;
      }
    }

    console.warn(`⚠️ No ground found at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    return -1;
  }

  startNPCSystem() {
    if (this.active) return;
    this.active = true;
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

    const newPos = this.findValidSpawnPosition();
    if (newPos) {
      npc.position.set(newPos.x, newPos.y, newPos.z);
      NPCPhysics.resetNPCPhysics(npc);
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
      return false;
    }

    return this.hideSeekManager.initializeGame(this.npcs);
  }

  restartHideSeekGame() {
    this.hideSeekManager.restartGame();
  }

  getHideSeekStatus() {
    return this.hideSeekManager.getGameStatus();
  }

  setGameMode(mode) {
    this.gameMode = mode;
    this.removeAllNPCs();
  }

  getNPCsByRole(role) {
    return this.npcs.filter((npc) => npc.role === role);
  }
}

export default NPCSystem;
