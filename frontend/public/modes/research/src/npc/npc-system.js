// ==============================================================
// FILE: research/src/npc/npc-system.js
// ==============================================================

import { createPlayer } from "../../../../src/player/players.js";
import * as GameState from "../../../../src/core/game-state.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as NPCPhysics from "../npc/physics/npc-physics.js";
import { NPC_BEHAVIOR } from "./config-npc-behavior.js";
import HideSeekManager from "./hide-seek/hide-seek-manager.js";
import { NPCBlockRemoval } from "./physics/npc-block-removal.js";
import { NPCBlockPlacement } from "./physics/npc-block-placement.js";

window.NPCPhysics = NPCPhysics;

class NPCSystem {
  constructor(scene) {
    this.scene = scene;
    this.npcs = [];
    this.npcCount = 0;
    this.active = false;
    this.gameMode = "hide_and_seek"; // Default mode

    this.hideSeekManager = new HideSeekManager(scene);
    this.blockRemoval = new NPCBlockRemoval();
    this.blockPlacement = new NPCBlockPlacement();

    this.lastUpdate = Date.now();

    this.settings = {
      maxNPCs: NPC_BEHAVIOR.MOVEMENT.maxNPCs,
      spawnDistance: {
        min: NPC_BEHAVIOR.MOVEMENT.spawnDistanceMin,
        max: NPC_BEHAVIOR.MOVEMENT.spawnDistanceMax,
      },
      moveSpeed: NPC_BEHAVIOR.PHYSICS.WALK_SPEED,
      directionChangeTime: {
        min: NPC_BEHAVIOR.MOVEMENT.directionChangeTimeMin,
        max: NPC_BEHAVIOR.MOVEMENT.directionChangeTimeMax,
      },
    };

    this.skins = {
      seeker: "../../../assets/images/skins/3.png",
      hider: "../../../assets/images/skins/3.png",
      default: "../../../assets/images/skins/3.png",
    };

    console.log("NPC System initialized in mode:", this.gameMode);
  }

  initialize() {
    console.log("Initializing NPC system...");
    return this;
  }

  //--------------------------------------------------------------//
  //                   FIX #1: Remove IDLE NPC spawning
  //--------------------------------------------------------------//

  generateNPCs(count = null) {
    // FIX: In hide_and_seek mode, ALWAYS use config values - IGNORE user input
    if (this.gameMode === "hide_and_seek") {
      const totalNPCs =
        NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount +
        NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;

      // If NPCs already exist, don't spawn more
      if (this.npcs.length > 0) {
        console.warn(
          `Hide and Seek game already has ${this.npcs.length} NPCs. Remove them first to restart.`
        );
        return this.npcs;
      }

      count = totalNPCs;
      console.log(
        `🎮 Hide and Seek mode: spawning ${NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount} seeker(s) and ${NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount} hider(s)`
      );
    } else if (count === null) {
      count = 3; // Default for other modes
    }

    const spawnCount = Math.min(
      count,
      this.settings.maxNPCs - this.npcs.length
    );

    if (!GameState.player) {
      console.warn("Player not loaded yet, cannot generate NPCs");
      return this.npcs;
    }

    console.log(`Generating ${spawnCount} NPCs...`);

    for (let i = 0; i < spawnCount; i++) {
      this.spawnNPC(i);
    }

    if (!this.active && this.npcs.length > 0) {
      this.startNPCSystem();
    }

    // FIX: Check against config values
    const requiredNPCs =
      NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount +
      NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;
    if (this.gameMode === "hide_and_seek" && this.npcs.length >= requiredNPCs) {
      setTimeout(() => this.startHideAndSeekGame(), 1000);
    }

    return this.npcs;
  }

  spawnNPC(index = 0) {
    const spawnPos = this.findValidSpawnPosition();
    if (!spawnPos) {
      console.warn("Could not find valid spawn position");
      return null;
    }

    const id = `npc-${++this.npcCount}`;
    let skin = this.skins.default;

    // FIX: Use config to determine role based on index
    if (this.gameMode === "hide_and_seek") {
      skin =
        index < NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount
          ? this.skins.seeker
          : this.skins.hider;
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
    console.log(`Spawned NPC ${id} at position:`, spawnPos);

    return npc;
  }

  initializeNPC(npc) {
    npc.isNPC = true;
    npc.velocity = { x: 0, y: 0, z: 0 };
    npc.isOnGround = true;
    npc.isMoving = false;
    npc.jumpCooldown = 0;

    npc.moveDirection = new THREE.Vector3(
      Math.random() * 2 - 1,
      0,
      Math.random() * 2 - 1
    ).normalize();

    npc.moveTimer =
      Date.now() + Math.random() * this.settings.directionChangeTime.max;

    npc.role = null;
    npc.hideSeekState = null;
    npc.searchTarget = null;
    npc.hidingSpot = null;
    npc.randomTarget = null;

    this.blockRemoval.initializeNPC(npc);
    this.blockPlacement.initializeNPC(npc);
  }

  removeAllNPCs() {
    console.log(`Removing ${this.npcs.length} NPCs...`);

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
  }

  findValidSpawnPosition() {
    if (!GameState.player) return null;

    const playerPos = GameState.player.position;
    const { min, max } = this.settings.spawnDistance;

    for (let attempts = 0; attempts < 20; attempts++) {
      const distance = min + Math.random() * (max - min);
      const angle = Math.random() * Math.PI * 2;

      const x = playerPos.x + Math.cos(angle) * distance;
      const z = playerPos.z + Math.sin(angle) * distance;
      const y = this.findGroundLevel(x, z);

      if (y > 0) {
        return { x, y, z };
      }
    }

    return {
      x: playerPos.x + (Math.random() * 6 - 3),
      y: playerPos.y + 2,
      z: playerPos.z + (Math.random() * 6 - 3),
    };
  }

  findGroundLevel(x, z) {
    const startY = TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL + 20;
    const testPosition = new THREE.Vector3(x, startY, z);

    for (let y = startY; y > 0; y--) {
      testPosition.y = y;
      const currentCollision = NPCPhysics.checkNPCCollision(
        testPosition,
        this.scene
      );

      testPosition.y = y - 1;
      const belowCollision = NPCPhysics.checkNPCCollision(
        testPosition,
        this.scene
      );

      if (!currentCollision.collides && belowCollision.collides) {
        return y;
      }
    }

    return -1;
  }

  startNPCSystem() {
    if (this.active) return;
    this.active = true;
    this.lastUpdate = Date.now();
    console.log("Starting NPC system...");
    this.updateLoop();
  }

  stopNPCSystem() {
    this.active = false;
    console.log("Stopping NPC system...");
  }

  updateLoop() {
    if (!this.active) return;

    const now = Date.now();
    const deltaTime = Math.min((now - this.lastUpdate) / 1000, 0.1);
    this.lastUpdate = now;

    if (this.gameMode === "hide_and_seek") {
      this.updateHideAndSeekNPCs(deltaTime);
    } else {
      this.updateNormalNPCs(deltaTime);
    }

    requestAnimationFrame(() => this.updateLoop());
  }

  updateHideAndSeekNPCs(deltaTime) {
    this.hideSeekManager.update(deltaTime);

    for (const npc of this.npcs) {
      if (!npc.visible || !npc.parent) continue;

      if (npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) {
        npc.isMoving = false;
        npc.velocity = { x: 0, y: 0, z: 0 };
        continue;
      }

      NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);

      // Optional automatic behavior (keep for showcase)
      this.blockRemoval.update(npc, this.scene, deltaTime);
      if (!npc.blockInteraction?.currentlyInteracting) {
        this.blockPlacement.update(npc, this.scene, deltaTime);
      }

      if (NPCPhysics.isNPCStuck(npc)) {
        this.respawnNPC(npc);
      }

      this.publishNPCMovement(npc);
    }
  }

  updateNormalNPCs(deltaTime) {
    const now = Date.now();

    for (const npc of this.npcs) {
      if (!npc.visible || !npc.parent) continue;

      if (now > npc.moveTimer) {
        npc.moveDirection = new THREE.Vector3(
          Math.random() * 2 - 1,
          0,
          Math.random() * 2 - 1
        ).normalize();

        npc.moveTimer =
          now +
          this.settings.directionChangeTime.min +
          Math.random() *
            (this.settings.directionChangeTime.max -
              this.settings.directionChangeTime.min);
      }

      NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);

      this.blockRemoval.update(npc, this.scene, deltaTime);
      if (!npc.blockInteraction?.currentlyInteracting) {
        this.blockPlacement.update(npc, this.scene, deltaTime);
      }

      const movementResult = NPCPhysics.moveNPC(
        npc,
        npc.moveDirection,
        this.settings.moveSpeed,
        this.scene,
        deltaTime
      );

      npc.yaw = Math.atan2(-npc.moveDirection.x, -npc.moveDirection.z);
      npc.isMoving = movementResult.hasMoved;

      if (
        (movementResult.xBlocked || movementResult.zBlocked) &&
        npc.isOnGround &&
        npc.jumpCooldown <= 0 &&
        Math.random() < 0.1
      ) {
        NPCPhysics.makeNPCJump(npc);
        npc.jumpCooldown = 1.5;
      }

      if (NPCPhysics.isNPCStuck(npc)) {
        this.respawnNPC(npc);
      }

      this.publishNPCMovement(npc);
    }
  }

  respawnNPC(npc) {
    if (npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) return;

    const newPos = this.findValidSpawnPosition();
    if (newPos) {
      npc.position.set(newPos.x, newPos.y, newPos.z);
      NPCPhysics.resetNPCPhysics(npc);
      console.log(`Respawned stuck NPC ${npc.userData?.id}`);
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

  //--------------------------------------------------------------//
  //           ML Training Interface - Direct Triggers
  //--------------------------------------------------------------//

  triggerBlockRemoval(npc, targetBlock) {
    return this.blockRemoval.removeBlock(npc, targetBlock);
  }

  triggerBlockPlacement(npc, position, blockType) {
    return this.blockPlacement.placeBlock(npc, {
      x: position.x,
      y: position.y,
      z: position.z,
      blockType,
    });
  }

  findNearbyBlocks(npc, radius = 5) {
    return this.blockRemoval.findBlocksInRadius(npc, radius);
  }

  findPlacementPositions(npc, radius = 5) {
    return this.blockPlacement.findValidPositions(npc, radius);
  }

  //--------------------------------------------------------------//
  //                 Hide and Seek Interface
  //--------------------------------------------------------------//

  startHideAndSeekGame() {
    const requiredNPCs =
      NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount +
      NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;

    if (this.npcs.length < requiredNPCs) {
      console.warn(
        `Need at least ${requiredNPCs} NPCs to start Hide and Seek (${NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount} seeker(s) + ${NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount} hider(s))`
      );
      return false;
    }
    console.log("🎮 Starting Hide and Seek game...");
    return this.hideSeekManager.initializeGame(this.npcs);
  }

  restartHideSeekGame() {
    this.hideSeekManager.restartGame();
  }

  getHideSeekStatus() {
    return this.hideSeekManager.getGameStatus();
  }

  setGameMode(mode) {
    console.log(`Switching game mode to: ${mode}`);
    this.gameMode = mode;
    this.removeAllNPCs();
    if (mode === "hide_and_seek") {
      this.generateNPCs(); // Will use config values now
    }
  }

  getNPCByRole(role) {
    return this.npcs.filter((npc) => npc.role === role); // Return array for multiple
  }

  getNPCsByRole(role) {
    return this.npcs.filter((npc) => npc.role === role);
  }

  forceSeeker() {
    const seekers = this.getNPCsByRole("seeker");
    seekers.forEach((seeker) => {
      seeker.hideSeekState = NPC_BEHAVIOR.GAME_STATES.SEEKING;
    });
  }

  forceHidersToFlee() {
    this.npcs
      .filter((npc) => npc.role === "hider")
      .forEach((hider) => {
        hider.hideSeekState = NPC_BEHAVIOR.GAME_STATES.FLEEING;
      });
  }

  toggleVisionDebug() {
    return this.hideSeekManager.toggleVisionDebug();
  }

  toggleVisionCones() {
    return this.hideSeekManager.toggleVisionCones();
  }

  toggleRaycastLines() {
    return this.hideSeekManager.toggleRaycastLines();
  }

  toggleNPCCamera(npc = null) {
    return this.hideSeekManager.toggleNPCCamera(npc);
  }

  getVisionDebugInfo() {
    return this.hideSeekManager.getVisionDebugInfo();
  }
}

export default NPCSystem;
