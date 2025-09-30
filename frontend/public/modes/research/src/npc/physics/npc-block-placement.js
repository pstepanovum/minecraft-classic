// ==============================================================
// FILE: research/src/npc/physics/npc-block-placement.js
// ==============================================================

import * as GameState from "../../../../../src/core/game-state.js";
import { NPC_BEHAVIOR } from "../config-npc-behavior.js";

export class NPCBlockPlacement {
  constructor() {
    this.maxReachDistance = NPC_BEHAVIOR.BLOCK_PLACEMENT.maxReachDistance;
    this.blockTypes = NPC_BEHAVIOR.BLOCK_PLACEMENT.availableBlockTypes;
    console.log("NPCBlockPlacement initialized");
  }

  initializeNPC(npc) {
    npc.blockPlacement = {
      currentlyPlacing: false,
      blockCount: 0,
      cooldownUntil: 0,
      targetPosition: null,
      blockInventory: this.generateInventory(),
    };
  }

  generateInventory() {
    const inventory = {};
    const numTypes = 2 + Math.floor(Math.random() * 2);

    for (let i = 0; i < numTypes; i++) {
      const blockType =
        this.blockTypes[Math.floor(Math.random() * this.blockTypes.length)];
      inventory[blockType] =
        (inventory[blockType] || 0) + (3 + Math.floor(Math.random() * 8));
    }

    return inventory;
  }

  // Optional automatic behavior (for showcase)
  update(npc, scene, deltaTime) {
    if (!npc.blockPlacement) return;

    const now = Date.now();
    if (now < npc.blockPlacement.cooldownUntil) return;

    if (!npc.blockPlacement.currentlyPlacing) {
      if (
        Math.random() <
        NPC_BEHAVIOR.BLOCK_PLACEMENT.interactionChance * deltaTime
      ) {
        npc.blockPlacement.currentlyPlacing = true;
        npc.blockPlacement.blockCount = 0;
      }
      return;
    }

    if (
      npc.blockPlacement.blockCount >=
      NPC_BEHAVIOR.BLOCK_PLACEMENT.maxBlocksPerSession
    ) {
      npc.blockPlacement.currentlyPlacing = false;
      npc.blockPlacement.cooldownUntil =
        now + NPC_BEHAVIOR.BLOCK_PLACEMENT.cooldownAfterSession;
      return;
    }

    if (!npc.blockPlacement.targetPosition) {
      this.findPlaceToBuild(npc);
      return;
    }

    this.lookAtTarget(npc, npc.blockPlacement.targetPosition);

    if (this.isTargetInReachAndView(npc, npc.blockPlacement.targetPosition)) {
      if (this.placeBlock(npc, npc.blockPlacement.targetPosition)) {
        npc.blockPlacement.blockCount++;
      }
      npc.blockPlacement.targetPosition = null;
    }
  }

  // Direct ML trigger - place block at position
  placeBlock(npc, target) {
    if (!target || !target.blockType) return false;

    const x = Math.floor(target.x);
    const y = Math.floor(target.y);
    const z = Math.floor(target.z);

    try {
      const currentBlock = GameState.getBlockType(x, y, z);

      if (currentBlock === 0) {
        if (npc.blockPlacement.blockInventory[target.blockType] > 0) {
          npc.blockPlacement.blockInventory[target.blockType]--;
          GameState.chunkManager?.updateBlock(x, y, z, target.blockType);

          if (GameState.isOnline && GameState.socket?.connected) {
            GameState.socket.emit("blockUpdate", {
              position: { x, y, z },
              type: target.blockType,
            });
          }

          return true;
        }
      }
    } catch (e) {
      console.warn(`Block placement failed: ${e.message}`);
    }

    return false;
  }

  // Find valid placement positions (for ML action space)
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
          const x = npcPos.x + dx;
          const y = npcPos.y + dy;
          const z = npcPos.z + dz;

          try {
            const blockType = GameState.getBlockType(x, y, z);
            if (blockType === 0 && this.hasAdjacentBlock(x, y, z)) {
              const distance = Math.sqrt(dx * dx + dz * dz);
              if (distance <= this.maxReachDistance) {
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

  findPlaceToBuild(npc) {
    const searchRadius = 3;
    const npcPos = {
      x: Math.floor(npc.position.x),
      y: Math.floor(npc.position.y),
      z: Math.floor(npc.position.z),
    };

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -searchRadius; dz <= searchRadius; dz++) {
          const x = npcPos.x + dx;
          const y = npcPos.y + dy;
          const z = npcPos.z + dz;

          try {
            const blockType = GameState.getBlockType(x, y, z);
            if (blockType === 0 && this.hasAdjacentBlock(x, y, z)) {
              const availableType = this.getAvailableBlockType(npc);
              if (availableType) {
                npc.blockPlacement.targetPosition = {
                  x,
                  y,
                  z,
                  blockType: availableType,
                };
                return true;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    return false;
  }

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

  getAvailableBlockType(npc) {
    const available = Object.entries(npc.blockPlacement.blockInventory)
      .filter(([_, count]) => count > 0)
      .map(([type]) => parseInt(type));

    return available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : null;
  }

  isTargetInReachAndView(npc, target) {
    if (!target) return false;

    const dx = target.x - npc.position.x;
    const dz = target.z - npc.position.z;
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

    const dx = target.x - npc.position.x;
    const dz = target.z - npc.position.z;
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

export default NPCBlockPlacement;
