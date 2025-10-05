// ==============================================================
// FILE: research/src/npc/physics/npc-block-placement.js
// ==============================================================

import * as GameState from "../../../../../src/core/game-state.js";
import { NPC } from "../config-npc-behavior.js";

export class NPCBlockPlacement {
  constructor() {
    this.maxReachDistance = NPC.BLOCK_PLACEMENT.maxReachDistance;
    this.blockTypes = NPC.BLOCK_PLACEMENT.availableBlockTypes;
    console.log("NPCBlockPlacement initialized (ML-controlled)");
  }

  initializeNPC(npc) {
    npc.blockPlacement = {
      lastPlacementTime: 0,
    };
  }

  //--------------------------------------------------------------//
  //                  Triggered Actions Only
  //--------------------------------------------------------------//

  placeBlock(npc, target) {
    if (!target || !target.blockType) return false;

    const x = Math.floor(target.x);
    const y = Math.floor(target.y);
    const z = Math.floor(target.z);

    try {
      const currentBlock = GameState.getBlockType(x, y, z);

      if (currentBlock === 0) {
        // Place block (no inventory check - unlimited)
        GameState.chunkManager?.updateBlock(x, y, z, target.blockType);

        if (GameState.isOnline && GameState.socket?.connected) {
          GameState.socket.emit("blockUpdate", {
            position: { x, y, z },
            type: target.blockType,
          });
        }

        npc.blockPlacement.lastPlacementTime = Date.now();
        return true;
      }
    } catch (e) {
      console.warn(`Block placement failed: ${e.message}`);
    }

    return false;
  }

  //--------------------------------------------------------------//
  //              Perception Helpers (for ML state)
  //--------------------------------------------------------------//

  /**
   * Find all valid placement positions (for ML action space)
   */
  findValidPositions(npc, radius = 5) {
    const positions = [];
    const npcPos = {
      x: Math.floor(npc.position.x),
      y: Math.floor(npc.position.y),
      z: Math.floor(npc.position.z),
    };

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // ✅ Skip positions too close to NPC
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Math.abs(dz) <= 1) {
            continue; // Don't place blocks in 3x3x3 area around NPC
          }

          const x = npcPos.x + dx;
          const y = npcPos.y + dy;
          const z = npcPos.z + dz;

          try {
            const blockType = GameState.getBlockType(x, y, z);
            if (blockType === 0 && this.hasAdjacentBlock(x, y, z)) {
              const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (distance <= this.maxReachDistance && distance > 1.5) {
                // ✅ Minimum distance
                positions.push({ x, y, z });
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    return positions;
  }

  /**
   * Check if position has at least one adjacent solid block
   */
  hasAdjacentBlock(x, y, z) {
    const adjacent = [
      { x: x + 1, y, z },
      { x: x - 1, y, z },
      { x, y: y + 1, z },
      { x, y: y - 1, z },
      { x, y, z: z + 1 },
      { x, y, z: z - 1 },
    ];

    for (const pos of adjacent) {
      try {
        if (GameState.getBlockType(pos.x, pos.y, pos.z) > 0) {
          return true;
        }
      } catch (e) {
        continue;
      }
    }

    return false;
  }

  /**
   * Check if position is within reach and view
   */
  isPositionInReachAndView(npc, pos) {
    const dx = pos.x - npc.position.x;
    const dy = pos.y - npc.position.y;
    const dz = pos.z - npc.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > this.maxReachDistance) return false;

    // Check if roughly facing the position (within ~60° cone)
    const targetDir = new THREE.Vector3(dx, 0, dz).normalize();
    const npcDir = new THREE.Vector3(
      -Math.sin(npc.yaw),
      0,
      -Math.cos(npc.yaw)
    ).normalize();

    return targetDir.dot(npcDir) > 0.5;
  }
}

export default NPCBlockPlacement;
