// ==============================================================
// FILE: research/src/npc/physics/npc-movement-controller.js
// ==============================================================

/**
 * Unified NPC Movement Controller with Intelligent Obstacle Handling
 */

import * as NPCPhysics from "./npc-physics.js";
import { NPC_BEHAVIOR } from "../config-npc-behavior.js";
import { NPCBlockRemoval } from "./npc-block-removal.js";
import { NPCBlockPlacement } from "./npc-block-placement.js";

const CHUNK_SIZE = 16;

export class NPCMovementController {
  constructor(scene, chunkManager) {
    this.scene = scene;
    this.chunkManager = chunkManager;

    this.blockRemoval = new NPCBlockRemoval();
    this.blockPlacement = new NPCBlockPlacement();

    // Physics constants from config
    this.physics = NPC_BEHAVIOR.PHYSICS;

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

    // Initialize jump cooldown (Kept for action 4, though smart jump uses stats)
    npc.jumpCooldown = 0;
  }

  /**
   * Execute a movement action
   */
  executeAction(npc, actionIndex, deltaTime = 0.016) {
    const speed = this.getNPCSpeed(npc);

    // Setup for intelligent forward movement
    const stats = this.movementStats.get(npc.userData.id);
    const currentTime = Date.now() / 1000;

    // Reset movement flags
    npc.isMoving = false;

    switch (actionIndex) {
      case 0: // Move forward (REPLACED with intelligent logic)
        return this.moveForwardWithObstacleDetection(
          npc,
          speed,
          deltaTime,
          stats,
          currentTime
        );

      case 1: // Move backward (Uses original simple logic)
        return this.moveBackward(npc, speed, deltaTime);

      case 2: // Move left (strafe) (Uses original simple logic)
        return this.moveLeft(npc, speed, deltaTime);

      case 3: // Move right (strafe) (Uses original simple logic)
        return this.moveRight(npc, speed, deltaTime);

      case 4: // Jump (Uses improved jump logic)
        return this.executeJump(npc, stats, currentTime);

      case 5: // Crouch (reserved for future)
        return { success: false, action: "crouch", reason: "not_implemented" };

      case 6: // Rotate left (Uses original simple logic)
        return this.rotateLeft(npc);

      case 7: // Rotate right (Uses original simple logic)
        return this.rotateRight(npc);

      case 8: // Look up (Uses original simple logic)
        return this.lookUp(npc);

      case 9: // Look down (Uses original simple logic)
        return this.lookDown(npc);

      case 10: // Place block
        return this.placeBlock(npc);

      case 11: // Remove block
        return this.removeBlock(npc);

      default:
        return { success: false, action: "none", reason: "invalid_action" };
    }
  }

  /**
   * Get appropriate speed for NPC based on role and state (Kept)
   */
  getNPCSpeed(npc) {
    // ... (logic remains the same)
    if (!npc.role) {
      return NPC_BEHAVIOR.PHYSICS.WALK_SPEED;
    }

    if (npc.role === "seeker") {
      return NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.moveSpeed;
    }

    if (npc.role === "hider") {
      if (npc.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FLEEING) {
        return NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.panicMoveSpeed;
      }
      return NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.stealthMoveSpeed;
    }

    return NPC_BEHAVIOR.PHYSICS.WALK_SPEED;
  }

  //--------------------------------------------------------------//
  //                    Movement Primitives
  //--------------------------------------------------------------//

  /**
   * Move forward with intelligent obstacle detection and auto-jumping (NEW/ADJUSTED)
   */
  moveForwardWithObstacleDetection(npc, speed, deltaTime, stats, currentTime) {
    const forwardDir = new THREE.Vector3(
      -Math.sin(npc.yaw),
      0,
      -Math.cos(npc.yaw)
    );
    const forwardDirRaw = { x: forwardDir.x, z: forwardDir.z };

    // 1. Check for obstacles ahead
    const obstacleInfo = this.checkForObstacles(npc, forwardDirRaw);

    if (obstacleInfo.hasObstacle) {
      stats.consecutiveBlocked++;
      stats.blockedCount++;

      // Smart jumping: automatically jump if jumpable obstacle and off cooldown
      if (
        obstacleInfo.canJump &&
        this.jumpConfig.smartJumpEnabled &&
        npc.isOnGround &&
        currentTime - stats.lastJumpTime > this.jumpConfig.jumpCooldown
      ) {
        console.log(
          `[NPC ${
            npc.userData.id
          }] Auto-jumping over obstacle (height: ${obstacleInfo.obstacleHeight.toFixed(
            1
          )})`
        );
        this.executeJumpLogic(npc, stats, currentTime); // Use jump helper

        // Use original moveInDirection logic, but at a slightly reduced speed
        // NOTE: We only set the velocity for forward momentum, the jump sets the Y velocity
        npc.velocity.x = forwardDir.x * speed * 0.8;
        npc.velocity.z = forwardDir.z * speed * 0.8;

        // This execution of `moveInDirection` is for *normal* movement *without* obstacle checking
        // Since the obstacle check already happened, we just apply momentum and return
        npc.isMoving = true;
        return {
          success: true,
          action: "move_forward_auto_jump",
          blocked: true,
        };
      } else if (obstacleInfo.canWalkOver) {
        // Small step, just walk over it
        npc.position.y += 0.1; // Small step up
        stats.consecutiveBlocked = 0;

        // Execute normal forward movement
        return this.moveInDirection(npc, forwardDir, speed, deltaTime);
      } else {
        // Can't jump over it / Too tall / Drop-off
        if (stats.consecutiveBlocked > 5) {
          // Un-stuck logic: Try moving diagonally
          const sideDir = Math.random() < 0.5 ? -1 : 1;
          const diagDir = new THREE.Vector3(
            forwardDir.x * 0.5 - forwardDir.z * sideDir * 0.5,
            0,
            forwardDir.z * 0.5 + forwardDir.x * sideDir * 0.5
          ).normalize();
          stats.consecutiveBlocked = 0;

          return this.moveInDirection(npc, diagDir, speed, deltaTime);
        } else {
          // Reduced forward movement when blocked
          // Still use moveInDirection, but with reduced speed/direction
          const reducedSpeed = speed * 0.2;
          const result = NPCPhysics.moveNPC(
            npc,
            forwardDir,
            reducedSpeed,
            this.scene,
            deltaTime
          );
          npc.isMoving = result.hasMoved;
          return {
            success: true,
            action: "move_forward_blocked",
            blocked: true,
          };
        }
      }
    } else {
      // No obstacle, move forward normally
      stats.consecutiveBlocked = 0;
      return this.moveInDirection(npc, forwardDir, speed, deltaTime);
    }
  }

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
    npc.yaw -= Math.PI / 8; // Reverted to smoother original in the reference code
    return { success: true, action: "rotate_left", yaw: npc.yaw };
  }

  rotateRight(npc) {
    npc.yaw += Math.PI / 8; // Reverted to smoother original in the reference code
    return { success: true, action: "rotate_right", yaw: npc.yaw };
  }

  lookUp(npc) {
    if (!npc.pitch) npc.pitch = 0;
    npc.pitch = Math.min(Math.PI / 4, npc.pitch + Math.PI / 16);
    return { success: true, action: "look_up", pitch: npc.pitch };
  }

  lookDown(npc) {
    if (!npc.pitch) npc.pitch = 0;
    npc.pitch = Math.max(-Math.PI / 4, npc.pitch - Math.PI / 16);
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
    // ... (logic remains the same, calling this.blockPlacement)
    const validPositions = this.blockPlacement.findValidPositions(npc, 4);

    if (validPositions.length === 0) {
      return {
        success: false,
        action: "place_block",
        reason: "no_valid_position",
      };
    }

    // Choose closest valid position
    const targetPos = validPositions.reduce((closest, pos) => {
      // ... distance calculation logic
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

    const availableType = this.blockPlacement.getAvailableBlockType(npc);
    if (!availableType) {
      return {
        success: false,
        action: "place_block",
        reason: "no_blocks_in_inventory",
      };
    }

    const target = {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      blockType: availableType,
    };

    const success = this.blockPlacement.placeBlock(npc, target);

    if (success) {
      return {
        success: true,
        action: "place_block",
        position: targetPos,
        blockType: availableType,
      };
    } else {
      return {
        success: false,
        action: "place_block",
        reason: "placement_failed",
      };
    }
  }

  //--------------------------------------------------------------//
  //                    Block Removal (Kept)
  //--------------------------------------------------------------//

  removeBlock(npc) {
    // ... (logic remains the same, calling this.blockRemoval)
    const nearbyBlocks = this.blockRemoval.findBlocksInRadius(npc, 4);

    if (nearbyBlocks.length === 0) {
      return {
        success: false,
        action: "remove_block",
        reason: "no_blocks_nearby",
      };
    }

    // Choose closest block
    const targetBlock = nearbyBlocks.reduce((closest, block) => {
      return block.distance < closest.distance ? block : closest;
    });

    // Remove the block
    const success = this.blockRemoval.removeBlock(npc, targetBlock);

    if (success) {
      return {
        success: true,
        action: "remove_block",
        position: {
          x: Math.floor(targetBlock.position.x),
          y: Math.floor(targetBlock.position.y),
          z: Math.floor(targetBlock.position.z),
        },
        blockType: targetBlock.type,
      };
    } else {
      return {
        success: false,
        action: "remove_block",
        reason: "removal_failed",
      };
    }
  }

  //--------------------------------------------------------------//
  //              Voxel World Interaction Helpers (ADDED)
  //--------------------------------------------------------------//

  /**
   * Check for obstacles in front of the NPC (from reference)
   */
  checkForObstacles(npc, direction) {
    if (!this.chunkManager) {
      // NOTE: Crucial for movement; log a warning if missing
      // console.warn("ChunkManager is missing. Obstacle detection disabled.");
      return { hasObstacle: false };
    }

    const checkDistance = 1.5; // How far ahead to check
    const pos = npc.position;

    // Check at multiple heights
    const feetY = Math.floor(pos.y);
    const bodyY = Math.floor(pos.y + 0.5);
    const headY = Math.floor(pos.y + 1.5);

    // Check position ahead
    const checkX = Math.floor(pos.x + direction.x * checkDistance);
    const checkZ = Math.floor(pos.z + direction.z * checkDistance);

    // Get blocks at different heights
    const blockAtFeet = this.getBlockAt(checkX, feetY, checkZ);
    const blockAtBody = this.getBlockAt(checkX, bodyY, checkZ);
    const blockAtHead = this.getBlockAt(checkX, headY, checkZ);
    const blockAbove = this.getBlockAt(checkX, headY + 1, checkZ);
    const groundBelow = this.getBlockAt(checkX, feetY - 1, checkZ);

    // Analyze obstacle type
    if (!groundBelow) {
      // Drop-off ahead - be careful
      return {
        hasObstacle: true,
        canJump: false,
        dropOff: true,
      };
    }

    if (blockAtBody || blockAtHead) {
      // There's a block at body or head height
      if (!blockAbove) {
        // We might be able to jump over it (1 or 2 blocks high)
        const obstacleHeight = blockAtHead ? 2 : 1;
        return {
          hasObstacle: true,
          canJump:
            obstacleHeight <= this.jumpConfig.maxJumpHeight && npc.isOnGround,
          obstacleHeight: obstacleHeight,
          canWalkOver: false,
        };
      } else {
        // Too tall to jump over
        return {
          hasObstacle: true,
          canJump: false,
          obstacleHeight: 3,
          canWalkOver: false,
        };
      }
    }

    if (blockAtFeet && !blockAtBody) {
      // Small step up (1 block high)
      return {
        hasObstacle: true,
        canJump: true,
        obstacleHeight: 0.5,
        canWalkOver: true,
      };
    }

    return { hasObstacle: false };
  }

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
  //              Perception Helpers (Kept)
  //--------------------------------------------------------------//

  /**
   * Get nearby blocks (for ML observation)
   */
  getNearbyBlocks(npc, radius = 5) {
    return this.blockRemoval.findBlocksInRadius(npc, radius);
  }

  /**
   * Get valid placement positions (for ML observation)
   */
  getValidPlacementPositions(npc, radius = 5) {
    return this.blockPlacement.findValidPositions(npc, radius);
  }

  /**
   * Get block inventory status (for ML observation)
   */
  getBlockInventory(npc) {
    // Also include surrounding blocks context (from reference)
    if (!this.chunkManager) {
      return {
        hasBlocks: false,
        blockTypes: [],
        canPlace: false,
        canRemove: false,
      };
    }

    const pos = npc.position;
    const surroundingBlocks = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const block = this.getBlockAt(
            Math.floor(pos.x + dx),
            Math.floor(pos.y + dy),
            Math.floor(pos.z + dz)
          );
          if (block && block.blockType) {
            surroundingBlocks.push(block);
          }
        }
      }
    }

    return {
      hasBlocks: true,
      blockTypes: this.blockPlacement.getInventoryStatus(npc)
        ?.availableTypes || [1, 2, 3], // Example types
      surroundingBlocks: surroundingBlocks,
      canPlace: this.blockPlacement.getTotalBlocks(npc) > 0,
      canRemove: surroundingBlocks.length > 0,
    };
  }

  /**
   * Get total blocks available (for ML observation)
   */
  getTotalBlocks(npc) {
    return this.blockPlacement.getTotalBlocks(npc);
  }

  //--------------------------------------------------------------//
  //                  Physics Update (per frame) (ADJUSTED)
  //--------------------------------------------------------------//

  /**
   * Update physics and cooldowns (call every frame)
   */
  updatePhysics(npc, deltaTime = 0.016) {
    // Update jump cooldown (Kept from original code)
    if (npc.jumpCooldown > 0) {
      npc.jumpCooldown -= deltaTime;
    }

    const wasOnGround = npc.isOnGround;

    // Apply physics
    NPCPhysics.updateNPCPhysics(npc, this.scene, deltaTime);

    // Track successful jump landing (from reference)
    const stats = this.movementStats.get(npc.userData.id);
    if (stats && !wasOnGround && npc.isOnGround) {
      // If it was not on ground, but now is, a jump attempt has concluded.
      stats.successfulJumps++;
    }
  }

  //--------------------------------------------------------------//
  //           High-Level Movement (optional convenience) (ADJUSTED)
  //--------------------------------------------------------------//

  /**
   * Move toward a target position (convenience method)
   */
  moveTowardsTarget(npc, targetPos, deltaTime) {
    const direction = targetPos.clone().sub(npc.position);
    direction.y = 0;

    if (direction.lengthSq() < 0.01) {
      npc.isMoving = false;
      return { success: false, atTarget: true };
    }

    direction.normalize();
    npc.yaw = Math.atan2(-direction.x, -direction.z);

    const speed = this.getNPCSpeed(npc);
    const result = NPCPhysics.moveNPC(
      npc,
      direction,
      speed,
      this.scene,
      deltaTime
    );

    // Auto-jump if blocked
    const stats = this.movementStats.get(npc.userData.id);
    const currentTime = Date.now() / 1000;

    if (
      (result.xBlocked || result.zBlocked) &&
      npc.isOnGround &&
      stats &&
      currentTime - stats.lastJumpTime > this.jumpConfig.jumpCooldown
    ) {
      this.executeJumpLogic(npc, stats, currentTime);
    }

    npc.isMoving = result.hasMoved;

    return {
      success: result.hasMoved,
      action: "move_to_target",
      distance: npc.position.distanceTo(targetPos),
    };
  }

  //--------------------------------------------------------------//
  //              Statistics/Debugging Helpers (ADDED)
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
