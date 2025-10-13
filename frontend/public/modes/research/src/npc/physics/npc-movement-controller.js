// ==============================================================
// FILE: research/src/npc/physics/npc-movement-controller.js
// ==============================================================

import * as NPCPhysics from "./npc-physics.js";
import { NPC } from "../config-npc-behavior.js";
import { NPCBlockRemoval } from "./npc-block-removal.js";
import { NPCBlockPlacement } from "./npc-block-placement.js";
import { BlockType } from "../../../../../src/world/textures.js";

const AVAILABLE_BLOCKS = [
  BlockType.GRASS,
  BlockType.STONE,
  BlockType.DIRT,
  BlockType.SAND,
  BlockType.SNOW,
  BlockType.LOG,
  BlockType.LEAVES,
];

export class NPCMovementController {
  constructor(scene, chunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;
    this.physics = NPC.PHYSICS;
    this.movementStats = new Map();

    // Block systems - PASS chunkManager!
    this.blockRemoval = new NPCBlockRemoval();
    this.blockPlacement = new NPCBlockPlacement();

    // ADDED: Set chunkManager on block systems if they have the method
    if (this.blockRemoval.setChunkManager) {
      this.blockRemoval.setChunkManager(chunkManager);
    }
    if (this.blockPlacement.setChunkManager) {
      this.blockPlacement.setChunkManager(chunkManager);
    }

    // Store references for block operations
    this.blockRemoval.chunkManager = chunkManager;
    this.blockRemoval.scene = scene;
    this.blockPlacement.chunkManager = chunkManager;
    this.blockPlacement.scene = scene;

    // Continuous action limits
    this.maxRotationPerStep = Math.PI / 8;
    this.maxPitchPerStep = Math.PI / 16;
    this.maxPitch = Math.PI / 3;
    this.jumpCooldown = 0.5;

    this.maxBlocksPlaced = NPC.BLOCK_PLACEMENT.maxBlocksPlaced;
    this.maxBlocksRemoved = NPC.BLOCK_REMOVAL.maxBlocksRemoved;
  }

  initializeNPC(npc) {
    NPCPhysics.resetNPCPhysics(npc);

    // Initialize block systems for this NPC
    if (this.blockRemoval.initializeNPC) {
      this.blockRemoval.initializeNPC(npc);
    }
    if (this.blockPlacement.initializeNPC) {
      this.blockPlacement.initializeNPC(npc);
    }

    if (!npc.pitch) npc.pitch = 0;

    npc.blocksPlaced = 0;
    npc.blocksRemoved = 0;

    if (!this.movementStats.has(npc.userData.id)) {
      this.movementStats.set(npc.userData.id, {
        lastJumpTime: 0,
        jumpAttempts: 0,
      });
    }
  }

  executeActionGroups(npc, actions, deltaTime) {
    if (npc.role === "seeker" && npc.inPreparationPhase) {
      return { success: false, results: [] };
    }

    const results = [];
    const speed = this.physics.WALK_SPEED;
    const stats = this.movementStats.get(npc.userData.id);
    const currentTime = Date.now() / 1000;

    // 1. MOVEMENT
    const movementForward = actions.movement_forward || 0;
    const movementStrafe = actions.movement_strafe || 0;

    if (Math.abs(movementForward) > 0.1 || Math.abs(movementStrafe) > 0.1) {
      const result = this.executeMovement(
        npc,
        movementForward,
        movementStrafe,
        speed,
        deltaTime
      );
      results.push(result);
    }

    // 2. ROTATION
    const rotationAmount = actions.rotation || 0;
    if (Math.abs(rotationAmount) > 0.05) {
      const result = this.executeRotation(npc, rotationAmount);
      results.push(result);
    }

    // 3. LOOK
    const lookAmount = actions.look || 0;
    if (Math.abs(lookAmount) > 0.05) {
      const result = this.executeLook(npc, lookAmount);
      results.push(result);
    }

    // 4. JUMP
    if (actions.jump) {
      const result = this.executeJump(npc, stats, currentTime);
      results.push(result);
    }

    // 5. BLOCK PLACEMENT - ADDED LOGGING
    if (actions.place_block) {
      const result = this.placeBlock(npc);
      results.push(result);
    }

    // 6. BLOCK REMOVAL - ADDED LOGGING
    if (actions.remove_block) {
      const result = this.removeBlock(npc);
      results.push(result);
    }

    return {
      success: results.length > 0 && results.some((r) => r.success),
      results: results,
    };
  }

  executeMovement(npc, forward, strafe, speed, deltaTime) {
    const forwardDir = new THREE.Vector3(
      -Math.sin(npc.yaw),
      0,
      -Math.cos(npc.yaw)
    );

    const strafeDir = new THREE.Vector3(
      Math.cos(npc.yaw),
      0,
      -Math.sin(npc.yaw)
    );

    const combinedDir = new THREE.Vector3();
    combinedDir.addScaledVector(forwardDir, forward);
    combinedDir.addScaledVector(strafeDir, strafe);

    if (combinedDir.length() === 0) {
      return { success: false, action: "move" };
    }

    combinedDir.normalize();

    const result = NPCPhysics.moveNPC(
      npc,
      combinedDir,
      speed,
      this.scene,
      deltaTime
    );

    npc.isMoving = result.hasMoved;

    return {
      success: result.hasMoved,
      action: "move",
      blocked: result.xBlocked || result.zBlocked,
    };
  }

  executeRotation(npc, amount) {
    const rotationChange = amount * this.maxRotationPerStep;
    npc.yaw += rotationChange;
    npc.yaw = ((npc.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;

    return {
      success: true,
      action: "rotate",
      amount: rotationChange,
      yaw: npc.yaw,
    };
  }

  executeLook(npc, amount) {
    const pitchChange = amount * this.maxPitchPerStep;
    if (!npc.pitch) npc.pitch = 0;
    npc.pitch += pitchChange;
    npc.pitch = Math.max(-this.maxPitch, Math.min(this.maxPitch, npc.pitch));

    return {
      success: true,
      action: "look",
      amount: pitchChange,
      pitch: npc.pitch,
    };
  }

  executeJump(npc, stats, currentTime) {
    if (!stats) {
      return { success: false, action: "jump", reason: "no_stats" };
    }

    if (!npc.isOnGround) {
      return { success: false, action: "jump", reason: "not_on_ground" };
    }

    if (currentTime - stats.lastJumpTime < this.jumpCooldown) {
      return { success: false, action: "jump", reason: "cooldown" };
    }

    const success = NPCPhysics.makeNPCJump(npc, this.physics.JUMP_SPEED);

    if (success) {
      npc.isOnGround = false;
      stats.jumpAttempts++;
      stats.lastJumpTime = currentTime;

      const forwardDir = {
        x: -Math.sin(npc.yaw),
        z: -Math.cos(npc.yaw),
      };
      npc.velocity.x += forwardDir.x * this.physics.WALK_SPEED * 0.3;
      npc.velocity.z += forwardDir.z * this.physics.WALK_SPEED * 0.3;

      return { success: true, action: "jump" };
    }

    return { success: false, action: "jump", reason: "physics_failed" };
  }

  placeBlock(npc) {
    // Check limit
    if (npc.blocksPlaced >= this.maxBlocksPlaced) {
      return {
        success: false,
        action: "place_block",
        reason: "limit_reached",
      };
    }

    // ADDED: Check if block system is available
    if (!this.blockPlacement || !this.blockPlacement.findValidPositions) {
      console.error("Block placement system not initialized!");
      return {
        success: false,
        action: "place_block",
        reason: "system_not_initialized",
      };
    }

    // Find valid positions
    const validPositions = this.blockPlacement.findValidPositions(npc, 3);

    if (validPositions.length === 0) {
      return {
        success: false,
        action: "place_block",
        reason: "no_valid_position",
      };
    }

    // Choose closest position
    const targetPos = validPositions.reduce((closest, pos) => {
      const distToPos = Math.sqrt(
        Math.pow(pos.x - npc.position.x, 2) +
          Math.pow(pos.y - npc.position.y, 2) +
          Math.pow(pos.z - npc.position.z, 2)
      );
      const distToClosest = Math.sqrt(
        Math.pow(closest.x - npc.position.x, 2) +
          Math.pow(closest.y - npc.position.y, 2) +
          Math.pow(closest.z - npc.position.z, 2)
      );
      return distToPos < distToClosest ? pos : closest;
    });

    const blockType =
      AVAILABLE_BLOCKS[Math.floor(Math.random() * AVAILABLE_BLOCKS.length)];

    // Attempt placement
    const success = this.blockPlacement.placeBlock(npc, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      blockType: blockType,
    });

    if (success) {
      npc.blocksPlaced++;
      return {
        success: true,
        action: "place_block",
        position: targetPos,
        blockType: blockType,
      };
    }

    return {
      success: false,
      action: "place_block",
      reason: "placement_failed",
    };
  }

  removeBlock(npc) {
    // Check limit
    if (npc.blocksRemoved >= this.maxBlocksRemoved) {
      return {
        success: false,
        action: "remove_block",
        reason: "limit_reached",
      };
    }

    // ADDED: Check if block system is available
    if (!this.blockRemoval || !this.blockRemoval.findBlocksInRadius) {
      console.error("Block removal system not initialized!");
      return {
        success: false,
        action: "remove_block",
        reason: "system_not_initialized",
      };
    }

    // Find nearby blocks
    const nearbyBlocks = this.blockRemoval.findBlocksInRadius(npc, 3);

    if (nearbyBlocks.length === 0) {
      return {
        success: false,
        action: "remove_block",
        reason: "no_blocks",
      };
    }

    // Choose closest block
    const targetBlock = nearbyBlocks.reduce((closest, block) => {
      return block.distance < closest.distance ? block : closest;
    });

    // Attempt removal
    const success = this.blockRemoval.removeBlock(npc, targetBlock);

    if (success) {
      npc.blocksRemoved++;
      return {
        success: true,
        action: "remove_block",
        position: targetBlock.position,
        blockType: targetBlock.type,
      };
    }

    return {
      success: false,
      action: "remove_block",
      reason: "removal_failed",
    };
  }

  getMovementStats(npcId) {
    return this.movementStats.get(npcId) || null;
  }

  resetStats(npcId) {
    this.movementStats.delete(npcId);
  }
}

export default NPCMovementController;
