// ==============================================================
// FILE: research/src/npc/physics/npc-movement-controller.js
// ==============================================================

/**
 * Unified NPC Movement Controller with Intelligent Obstacle Handling
 */

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
  BlockType.BEDROCK,
  BlockType.LOG,
  BlockType.LEAVES,
  BlockType.GRAVEL,
];

const CHUNK_SIZE = 16;

export class NPCMovementController {
  constructor(scene, chunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;

    this.blockRemoval = new NPCBlockRemoval();
    this.blockPlacement = new NPCBlockPlacement();

    // Physics constants from config
    this.physics = NPC.PHYSICS;

    // Track movement statistics (from reference)
    this.movementStats = new Map();

    // Jump parameters (from reference)
    this.jumpConfig = {
      minJumpHeight: 0.5,
      maxJumpHeight: 2.0,
      jumpCooldown: 0.5, // Seconds between jumps (more realistic)
      smartJumpEnabled: true,
      jumpVelocity: this.physics.JUMP_SPEED,
    };
  }

  /**
   * Initialize NPC (Adjusted to include new stats)
   */
  initializeNPC(npc) {
    this.blockRemoval.initializeNPC(npc);
    this.blockPlacement.initializeNPC(npc);

    // Initialize physics state
    NPCPhysics.resetNPCPhysics(npc);

    // Initialize movement tracking (from reference)
    if (!this.movementStats.has(npc.userData.id)) {
      this.movementStats.set(npc.userData.id, {
        blockedCount: 0,
        jumpAttempts: 0,
        successfulJumps: 0,
        lastJumpTime: 0,
        consecutiveBlocked: 0,
      });
    }

    npc.jumpCooldown = 0;
  }

  /**
   * Execute a movement action
   */
  executeAction(npc, actionIndex, deltaTime) {
    switch (actionIndex) {
      case 0:
        return this.moveForward(npc, speed, deltaTime);
      case 1:
        return this.moveBackward(npc, speed, deltaTime);
      case 2:
        return this.executeJump(npc, stats, currentTime);
      case 3:
        return this.rotateLeft(npc);
      case 4:
        return this.rotateRight(npc);
      case 5:
        return this.lookUp(npc);
      case 6:
        return this.lookDown(npc);
      case 7:
        return this.placeBlock(npc);
      case 8:
        return this.removeBlock(npc);
      default:
        return { success: false, action: "none" };
    }
  }

  /**
   * Get appropriate speed for NPC based on role and state (Kept)
   */
  getNPCSpeed(npc) {
    // ... (logic remains the same)
    if (!npc.role) {
      return NPC.PHYSICS.WALK_SPEED;
    }

    return NPC.PHYSICS.WALK_SPEED;
  }

  // In npc-movement-controller.js

  executeActionGroups(npc, groups, deltaTime) {
    const speed = this.getNPCSpeed(npc);
    const stats = this.movementStats.get(npc.userData.id);
    const currentTime = Date.now() / 1000;
    const results = [];
    if (npc.role === "seeker" && npc.inPreparationPhase) {
      return {
        success: false,
        results: [],
        groups: groups,
      };
    }

    // Execute all selected actions simultaneously

    // Movement (0=none, 1=forward, 2=backward)
    if (groups.movement === 1) {
      results.push(this.moveForward(npc, speed, deltaTime));
    } else if (groups.movement === 2) {
      results.push(this.moveBackward(npc, speed, deltaTime));
    }

    // Jump (0=no, 1=yes)
    if (groups.jump === 1) {
      results.push(this.executeJump(npc, stats, currentTime));
    }

    // Rotation (0=none, 1=left, 2=right)
    if (groups.rotation === 1) {
      results.push(this.rotateLeft(npc));
    } else if (groups.rotation === 2) {
      results.push(this.rotateRight(npc));
    }

    // Look (0=none, 1=up, 2=down)
    if (groups.look === 1) {
      results.push(this.lookUp(npc));
    } else if (groups.look === 2) {
      results.push(this.lookDown(npc));
    }

    // Block (0=none, 1=place, 2=remove)
    if (groups.block === 1) {
      results.push(this.placeBlock(npc));
    } else if (groups.block === 2) {
      results.push(this.removeBlock(npc));
    }

    return {
      success: results.length > 0 && results.some((r) => r.success),
      results: results,
      groups: groups,
    };
  }

  //--------------------------------------------------------------//
  //                    Movement Primitives
  //--------------------------------------------------------------//

  moveForward(npc, speed, deltaTime) {
    const direction = new THREE.Vector3(
      -Math.sin(npc.yaw),
      0,
      -Math.cos(npc.yaw)
    );
    return this.moveInDirection(npc, direction, speed, deltaTime);
  }

  moveBackward(npc, speed, deltaTime) {
    const direction = new THREE.Vector3(
      Math.sin(npc.yaw),
      0,
      Math.cos(npc.yaw)
    );
    return this.moveInDirection(npc, direction, speed, deltaTime);
  }

  moveLeft(npc, speed, deltaTime) {
    const direction = new THREE.Vector3(
      -Math.cos(npc.yaw),
      0,
      Math.sin(npc.yaw)
    );
    return this.moveInDirection(npc, direction, speed, deltaTime);
  }

  moveRight(npc, speed, deltaTime) {
    const direction = new THREE.Vector3(
      Math.cos(npc.yaw),
      0,
      -Math.sin(npc.yaw)
    );
    return this.moveInDirection(npc, direction, speed, deltaTime);
  }

  /**
   * Core movement execution (Kept and used by all simple movement actions)
   */
  moveInDirection(npc, direction, speed, deltaTime) {
    const result = NPCPhysics.moveNPC(
      npc,
      direction,
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

  //--------------------------------------------------------------//
  //                    Rotation & Look (Kept)
  //--------------------------------------------------------------//

  rotateLeft(npc) {
    // π/32 = 5.625 degrees - much more human-like
    const ROTATION_STEP = Math.PI / 32;
    
    if (!npc.totalRotation) npc.totalRotation = 0;
    npc.totalRotation -= ROTATION_STEP;
    
    npc.yaw -= ROTATION_STEP;
    npc.yaw = ((npc.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    
    return { success: true, action: "rotate_left", yaw: npc.yaw };
  }

  rotateRight(npc) {
    const ROTATION_STEP = Math.PI / 32;
    
    if (!npc.totalRotation) npc.totalRotation = 0;
    npc.totalRotation += ROTATION_STEP;
    
    npc.yaw += ROTATION_STEP;
    npc.yaw = ((npc.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    
    return { success: true, action: "rotate_right", yaw: npc.yaw };
  }

  lookUp(npc) {
    if (!npc.pitch) npc.pitch = 0;
    // Also reduce look speed for consistency
    npc.pitch = Math.min(Math.PI / 4, npc.pitch + Math.PI / 32);
    return { success: true, action: "look_up", pitch: npc.pitch };
  }

  lookDown(npc) {
    if (!npc.pitch) npc.pitch = 0;
    npc.pitch = Math.max(-Math.PI / 4, npc.pitch - Math.PI / 32);
    return { success: true, action: "look_down", pitch: npc.pitch };
  }

  //--------------------------------------------------------------//
  //                         Jump (ADJUSTED)
  //--------------------------------------------------------------//

  /**
   * Execute jump (Action Index 4)
   */
  executeJump(npc, stats, currentTime) {
    if (!stats) return { success: false, action: "jump", reason: "no_stats" };

    // Check if on ground and if cooldown has passed (using jumpConfig for cooldown)
    if (
      npc.isOnGround &&
      currentTime - stats.lastJumpTime > this.jumpConfig.jumpCooldown
    ) {
      return this.executeJumpLogic(npc, stats, currentTime)
        ? { success: true, action: "jump" }
        : { success: false, action: "jump", reason: "jump_failed_internal" };
    }
    return {
      success: false,
      action: "jump",
      reason: npc.isOnGround ? "cooldown" : "not_on_ground",
    };
  }

  /**
   * Core jump execution logic (from reference)
   */
  executeJumpLogic(npc, stats, currentTime) {
    // We already checked cooldown/isOnGround in executeJump/moveForwardWithObstacleDetection

    // NOTE: Using NPCPhysics.makeNPCJump here (which should set velocity.y and isOnGround=false)
    const success = NPCPhysics.makeNPCJump(npc, this.jumpConfig.jumpVelocity);

    if (success) {
      // Update stats
      npc.isOnGround = false;
      stats.jumpAttempts++;
      stats.lastJumpTime = currentTime;

      // Add slight forward momentum when jumping
      const forwardDir = {
        x: -Math.sin(npc.yaw),
        z: -Math.cos(npc.yaw),
      };
      // NOTE: This adds to existing velocity, so it must be called AFTER NPCPhysics sets initial velocity
      npc.velocity.x += forwardDir.x * this.physics.WALK_SPEED * 0.3;
      npc.velocity.z += forwardDir.z * this.physics.WALK_SPEED * 0.3;

      return true;
    }
    return false;
  }

  //--------------------------------------------------------------//
  //                    Block Placement (Kept)
  //--------------------------------------------------------------//

  placeBlock(npc) {
    if ((npc.blocksPlaced || 0) >= 1) {
      return { success: false, action: "place_block", reason: "limit_reached" };
    }

    const validPositions = this.blockPlacement.findValidPositions(npc, 3);
    if (validPositions.length === 0) {
      return {
        success: false,
        action: "place_block",
        reason: "no_valid_position",
      };
    }

    // Pick closest position
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

    // Randomly select block type (NN doesn't choose type)
    const blockType =
      AVAILABLE_BLOCKS[Math.floor(Math.random() * AVAILABLE_BLOCKS.length)];

    const success = this.blockPlacement.placeBlock(npc, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      blockType: blockType,
    });

    if (success) {
      npc.blocksPlaced = (npc.blocksPlaced || 0) + 1;
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

  //--------------------------------------------------------------//
  //                    Block Removal (Kept)
  //--------------------------------------------------------------//

  removeBlock(npc) {
    if ((npc.blocksRemoved || 0) >= 1) {
      return {
        success: false,
        action: "remove_block",
        reason: "limit_reached",
      };
    }

    const nearbyBlocks = this.blockRemoval.findBlocksInRadius(npc, 3);
    if (nearbyBlocks.length === 0) {
      return { success: false, action: "remove_block", reason: "no_blocks" };
    }

    // Pick closest block
    const targetBlock = nearbyBlocks.reduce((closest, block) => {
      return block.distance < closest.distance ? block : closest;
    });

    const success = this.blockRemoval.removeBlock(npc, targetBlock);

    if (success) {
      npc.blocksRemoved = (npc.blocksRemoved || 0) + 1;
      return {
        success: true,
        action: "remove_block",
        position: targetBlock.position,
        blockType: targetBlock.type,
      };
    }

    return { success: false, action: "remove_block", reason: "removal_failed" };
  }

  //--------------------------------------------------------------//
  //              World Interaction Helpers
  //--------------------------------------------------------------//

  /**
   * Get block at world coordinates (from reference)
   */
  getBlockAt(worldX, worldY, worldZ) {
    if (!this.chunkManager) {
      return null;
    }

    const chunkX = Math.floor(worldX / CHUNK_SIZE);
    const chunkY = Math.floor(worldY / CHUNK_SIZE);
    const chunkZ = Math.floor(worldZ / CHUNK_SIZE);

    const localX = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((worldY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const blockType = this.chunkManager.getBlockType(
      chunkX,
      chunkY,
      chunkZ,
      localX,
      localY,
      localZ
    );

    return blockType ? { blockType } : null;
  }

  //--------------------------------------------------------------//
  //                  Physics Update (per frame) (ADJUSTED)
  //--------------------------------------------------------------//

  /**
   * Update physics and cooldowns (call every frame)
   */
  updatePhysics(npc, deltaTime) {
    // Update jump cooldown
    if (npc.jumpCooldown > 0) {
      npc.jumpCooldown -= deltaTime;
    }

    const wasOnGround = npc.isOnGround;

    // Apply physics
    NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);

    // Track successful jump landing
    const stats = this.movementStats.get(npc.userData.id);
    if (stats && !wasOnGround && npc.isOnGround) {
      stats.successfulJumps++;
    }
  }

  //--------------------------------------------------------------//
  //              Statistics/Debugging Helpers
  //--------------------------------------------------------------//

  /**
   * Get movement statistics for debugging
   */
  getMovementStats(npcId) {
    return this.movementStats.get(npcId) || null;
  }

  /**
   * Reset movement statistics
   */
  resetStats(npcId) {
    this.movementStats.delete(npcId);
  }

  /**
   * Log movement statistics for all NPCs
   */
  logAllStats() {
    console.log("=== NPC Movement Statistics ===");
    this.movementStats.forEach((stats, npcId) => {
      const jumpSuccess =
        stats.jumpAttempts > 0
          ? ((stats.successfulJumps / stats.jumpAttempts) * 100).toFixed(1)
          : 0;
      console.log(`NPC ${npcId}:`);
      console.log(`  Blocked: ${stats.blockedCount} times`);
      console.log(`  Jump attempts: ${stats.jumpAttempts}`);
      console.log(
        `  Successful jumps: ${stats.successfulJumps} (${jumpSuccess}%)`
      );
      console.log(`  Consecutive blocked: ${stats.consecutiveBlocked}`);
    });
  }
}

export default NPCMovementController;
