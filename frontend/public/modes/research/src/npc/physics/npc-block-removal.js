// ==============================================================
// FILE: research/src/npc/physics/npc-block-removal.js
// ==============================================================

import * as GameState from "../../../../../src/core/game-state.js";
import { NPC_BEHAVIOR } from "../config-npc-behavior.js";

export class NPCBlockRemoval {
  constructor() {
    this.maxReachDistance = NPC_BEHAVIOR.BLOCK_REMOVAL.maxReachDistance;
    console.log("NPCBlockRemoval initialized");
  }

  initializeNPC(npc) {
    npc.blockInteraction = {
      currentlyInteracting: false,
      blockCount: 0,
      cooldownUntil: 0,
      targetBlock: null,
    };
  }

  // Optional automatic behavior (for showcase)
  update(npc, scene, deltaTime) {
    if (!npc.blockInteraction) return;

    const now = Date.now();
    if (now < npc.blockInteraction.cooldownUntil) return;

    if (!npc.blockInteraction.currentlyInteracting) {
      if (
        Math.random() <
        NPC_BEHAVIOR.BLOCK_REMOVAL.interactionChance * deltaTime
      ) {
        npc.blockInteraction.currentlyInteracting = true;
        npc.blockInteraction.blockCount = 0;
      }
      return;
    }

    if (
      npc.blockInteraction.blockCount >=
      NPC_BEHAVIOR.BLOCK_REMOVAL.maxBlocksPerSession
    ) {
      npc.blockInteraction.currentlyInteracting = false;
      npc.blockInteraction.cooldownUntil =
        now + NPC_BEHAVIOR.BLOCK_REMOVAL.cooldownAfterSession;
      return;
    }

    if (!npc.blockInteraction.targetBlock) {
      this.findBlockToRemove(npc);
      return;
    }

    this.lookAtTarget(npc, npc.blockInteraction.targetBlock);

    if (this.isTargetInReachAndView(npc, npc.blockInteraction.targetBlock)) {
      if (this.removeBlock(npc, npc.blockInteraction.targetBlock)) {
        npc.blockInteraction.blockCount++;
      }
      npc.blockInteraction.targetBlock = null;
    }
  }

  // Direct ML trigger - remove block at position
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

        return true;
      }
    } catch (e) {
      console.warn(`Block removal failed: ${e.message}`);
    }

    return false;
  }

  // Find nearby blocks (for ML observation space)
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
              const distance = Math.sqrt(dx * dx + dz * dz);
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

  findBlockToRemove(npc) {
    const searchRadius = 3;
    const npcPos = {
      x: Math.floor(npc.position.x),
      y: Math.floor(npc.position.y),
      z: Math.floor(npc.position.z),
    };

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -1; dy <= 3; dy++) {
        for (let dz = -searchRadius; dz <= searchRadius; dz++) {
          const x = npcPos.x + dx;
          const y = npcPos.y + dy;
          const z = npcPos.z + dz;

          try {
            const blockType = GameState.getBlockType(x, y, z);
            if (blockType > 0) {
              const dirX = x - npc.position.x;
              const dirY = y - npc.position.y;
              const dirZ = z - npc.position.z;
              const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

              npc.blockInteraction.targetBlock = {
                position: new THREE.Vector3(x, y, z),
                normal: new THREE.Vector3(
                  dirX / length,
                  dirY / length,
                  dirZ / length
                ).negate(),
              };
              return true;
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    return false;
  }

  isTargetInReachAndView(npc, target) {
    if (!target) return false;

    const dx = target.position.x - npc.position.x;
    const dz = target.position.z - npc.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > this.maxReachDistance) return false;

    const targetDir = new THREE.Vector3(dx, 0, dz).normalize();
    const npcDir = new THREE.Vector3(
      -Math.sin(npc.yaw),
      0,
      -Math.cos(npc.yaw)
    ).normalize();

    return targetDir.dot(npcDir) > 0.5;
  }

  lookAtTarget(npc, target) {
    if (!target) return;

    const dx = target.position.x - npc.position.x;
    const dz = target.position.z - npc.position.z;
    const targetYaw = Math.atan2(-dx, -dz);

    let currentYaw = npc.yaw;
    while (currentYaw < -Math.PI) currentYaw += Math.PI * 2;
    while (currentYaw > Math.PI) currentYaw -= Math.PI * 2;

    let diff = targetYaw - currentYaw;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    const rotationSpeed = 0.1;
    npc.yaw +=
      Math.abs(diff) > rotationSpeed ? Math.sign(diff) * rotationSpeed : diff;
  }
}

export default NPCBlockRemoval;
