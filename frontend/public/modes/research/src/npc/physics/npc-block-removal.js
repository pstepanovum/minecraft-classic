// ==============================================================
// FILE: research/src/npc/physics/npc-block-removal.js
// ==============================================================

import * as GameState from "../../../../../src/core/game-state.js";
import { NPC_BEHAVIOR } from "../config-npc-behavior.js";

export class NPCBlockRemoval {
  constructor() {
    this.maxReachDistance = NPC_BEHAVIOR.BLOCK_REMOVAL.maxReachDistance;
    console.log("NPCBlockRemoval initialized (ML-controlled)");
  }

  initializeNPC(npc) {
    npc.blockInteraction = {
      lastRemovalTime: 0,
    };
  }

  //--------------------------------------------------------------//
  //                  Triggered Actions
  //--------------------------------------------------------------//

  /**
   * Remove block at target position
   * Called by NPCMovementController.executeAction(npc, 11)
   */
  removeBlock(npc, target) {
    if (!target) return false;

    const x = Math.floor(target.position.x);
    const y = Math.floor(target.position.y);
    const z = Math.floor(target.position.z);

    try {
      const blockType = GameState.getBlockType(x, y, z);

      if (blockType > 0) {
        GameState.chunkManager?.updateBlock(x, y, z, 0);

        if (GameState.isOnline && GameState.socket?.connected) {
          GameState.socket.emit("blockUpdate", {
            position: { x, y, z },
            type: "remove",
          });
        }

        npc.blockInteraction.lastRemovalTime = Date.now();
        return true;
      }
    } catch (e) {
      console.warn(`Block removal failed: ${e.message}`);
    }

    return false;
  }

  //--------------------------------------------------------------//
  //              Perception Helpers (for ML state)
  //--------------------------------------------------------------//

  /**
   * Find all blocks within radius (for ML observation)
   */
  findBlocksInRadius(npc, radius = 5) {
    const blocks = [];
    const npcPos = {
      x: Math.floor(npc.position.x),
      y: Math.floor(npc.position.y),
      z: Math.floor(npc.position.z),
    };

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const x = npcPos.x + dx;
          const y = npcPos.y + dy;
          const z = npcPos.z + dz;

          try {
            const blockType = GameState.getBlockType(x, y, z);
            if (blockType > 0) {
              const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (distance <= this.maxReachDistance) {
                blocks.push({
                  position: new THREE.Vector3(x, y, z),
                  type: blockType,
                  distance: distance,
                });
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    return blocks;
  }

  /**
   * Check if block is within reach and view
   */
  isBlockInReachAndView(npc, blockPos) {
    const dx = blockPos.x - npc.position.x;
    const dy = blockPos.y - npc.position.y;
    const dz = blockPos.z - npc.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > this.maxReachDistance) return false;

    // Check if roughly facing the block (within 90° cone)
    const targetDir = new THREE.Vector3(dx, 0, dz).normalize();
    const npcDir = new THREE.Vector3(
      -Math.sin(npc.yaw),
      0,
      -Math.cos(npc.yaw)
    ).normalize();

    return targetDir.dot(npcDir) > 0.5; // ~60° cone
  }
}

export default NPCBlockRemoval;
