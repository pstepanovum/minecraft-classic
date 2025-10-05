// ==============================================================
// FILE: research/src/ml/encoding/state-encoder.js
// ==============================================================

import { NPC } from "../npc/config-npc-behavior.js";
import { CLIENT_WORLD_CONFIG } from "../../../../src/core/game-state.js";

export class StateEncoder {
  constructor() {
    this.stateSize = NPC.TRAINING.MODEL.stateSize;

    this.encoding = {
      position: { start: 0, size: 3 },
      orientation: { start: 3, size: 2 },
      velocity: { start: 5, size: 3 },
      onGround: { start: 8, size: 1 },
      visualField: { start: 9, size: 64 },
      memory: { start: 73, size: 16 },
      actionHistory: { start: 89, size: 9 },
      gameInfo: { start: 98, size: 5 },
      roleSpecific: { start: 103, size: 14 },
      boundaryProximity: { start: 117, size: 4 },
      jumpInfo: { start: 121, size: 4 },
      voxelNavigation: { start: 125, size: 12 },
      blockInteraction: { start: 137, size: 6 },
    };
  }

  encode(npc, gameState, perceptionData, worldSize) {
    const state = new Array(this.stateSize).fill(0);

    this.encodePosition(state, npc.position, worldSize);
    this.encodeOrientation(state, npc.yaw, npc.pitch);
    this.encodeVelocity(state, npc.velocity);
    state[this.encoding.onGround.start] = npc.isOnGround ? 1 : 0;
    this.encodeVisualField(state, perceptionData);
    this.encodeMemory(state, npc);
    this.encodeActionHistory(state, npc.lastAction);
    this.encodeGameInfo(state, gameState);
    this.encodeBoundaryProximity(state, npc, worldSize);
    this.encodeJumpInfo(state, npc, perceptionData);
    this.encodeVoxelNavigation(state, npc);

    if (npc.role === "seeker") {
      this.encodeSeekerInfo(state, npc, perceptionData);
    } else {
      this.encodeHiderInfo(state, npc, perceptionData);
    }

    // Validate state
    for (let i = 0; i < state.length; i++) {
      if (!isFinite(state[i])) {
        console.error(`State encoding NaN/Inf at index ${i}`);
        state[i] = 0;
      }
      if (Math.abs(state[i]) > 10) {
        console.warn(`State value too large at index ${i}: ${state[i]}`);
        state[i] = Math.sign(state[i]) * 1.0;
      }
    }

    return state;
  }

  encodePosition(state, position, worldSize) {
    const { start } = this.encoding.position;
    state[start] = position.x / worldSize;
    state[start + 1] = position.y / 100;
    state[start + 2] = position.z / worldSize;
  }

  encodeOrientation(state, yaw, pitch) {
    const { start } = this.encoding.orientation;

    // Normalize yaw to [-π, π]
    let normalizedYaw = yaw % (Math.PI * 2);
    if (normalizedYaw > Math.PI) normalizedYaw -= Math.PI * 2;
    if (normalizedYaw < -Math.PI) normalizedYaw += Math.PI * 2;

    state[start] = normalizedYaw / Math.PI;
    state[start + 1] = (pitch || 0) / (Math.PI / 2);
  }

  encodeVelocity(state, velocity) {
    const { start } = this.encoding.velocity;
    const maxSpeed = NPC.PHYSICS.SPRINT_SPEED;
    state[start] = Math.max(-1, Math.min(1, velocity.x / maxSpeed));
    state[start + 1] = Math.max(-1, Math.min(1, velocity.y / maxSpeed));
    state[start + 2] = Math.max(-1, Math.min(1, velocity.z / maxSpeed));
  }

  encodeVisualField(state, perceptionData) {
    const { start, size } = this.encoding.visualField;

    for (let i = 0; i < size; i++) {
      state[start + i] = 0;
    }

    if (perceptionData?.raycastData?.rays) {
      const rays = perceptionData.raycastData.rays;

      for (let i = 0; i < Math.min(size, rays.length); i++) {
        const ray = rays[i];

        if (ray.hit) {
          const normalizedDistance = ray.distance / 32;

          if (ray.isPlayer) {
            state[start + i] = normalizedDistance * 0.5 + 0.01;
          } else {
            const blockType = this.encodeBlockType(ray.blockType);
            state[start + i] = normalizedDistance * 0.5 + blockType * 0.01;
          }
        }
      }
    }
  }

  encodeBoundaryProximity(state, npc, worldSize) {
    const { start } = this.encoding.boundaryProximity;
    const pos = npc.position;

    state[start] = pos.x / worldSize;
    state[start + 1] = (worldSize - pos.x) / worldSize;
    state[start + 2] = pos.z / worldSize;
    state[start + 3] = (worldSize - pos.z) / worldSize;
  }

  encodeBlockType(blockType) {
    if (!blockType || blockType === 0) {
      console.warn("Invalid or empty block type encountered");
      return 0;
    }
    const blockMap = {
      8: 0.1,
      9: 0.1,
      1: 0.5,
      2: 0.5,
      3: 0.7,
      4: 0.3,
    };
    return blockMap[blockType] || 0.5;
  }

  encodeJumpInfo(state, npc, perceptionData) {
    const { start } = this.encoding.jumpInfo;

    state[start] = 0;
    state[start + 1] = 0;
    state[start + 2] = npc.isOnGround ? 1.0 : 0.0;
    state[start + 3] = npc.jumpCooldown > 0 ? 1.0 : 0.0;

    if (!perceptionData?.raycastData?.rays) return;

    const rays = perceptionData.raycastData.rays;
    const centerIdx = Math.floor(rays.length / 2);
    const checkRange = 3;

    let closestObstacle = Infinity;
    let obstacleDetected = false;

    for (let i = centerIdx - checkRange; i <= centerIdx + checkRange; i++) {
      if (i < 0 || i >= rays.length) continue;

      const ray = rays[i];
      const jumpDetectionRange = 2.5;
      if (ray.hit && !ray.isPlayer && ray.distance < jumpDetectionRange) {
        obstacleDetected = true;
        closestObstacle = Math.min(closestObstacle, ray.distance);
      }
    }

    if (obstacleDetected) {
      state[start] = 1.0;
      state[start + 1] = Math.max(0, 1.0 - closestObstacle / 2.5);
    }
  }

  encodeMemory(state, npc) {
    const { start } = this.encoding.memory;

    if (!npc.spatialMemory) {
      npc.spatialMemory = {
        visitedPositions: [],
        lastSeenTargetPos: null,
        lastSeenTargetTime: 0,
        exploredRegions: new Set(),
      };
    }

    if (npc.spatialMemory.lastSeenTargetPos) {
      const timeSinceSeen = Date.now() - npc.spatialMemory.lastSeenTargetTime;
      const recency = Math.exp(-timeSinceSeen / 10000);

      state[start] = npc.spatialMemory.lastSeenTargetPos.x / 64;
      state[start + 1] = npc.spatialMemory.lastSeenTargetPos.z / 64;
      state[start + 2] = recency;
    } else {
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
    }

    // Encode exploration coverage (4 quadrants)
    const quadrants = [
      [0, 32, 0, 32], // Top-left
      [32, 64, 0, 32], // Top-right
      [0, 32, 32, 64], // Bottom-left
      [32, 64, 32, 64], // Bottom-right
    ];

    for (let i = 0; i < 4; i++) {
      const [x1, x2, z1, z2] = quadrants[i];
      const quadrantKey = `${Math.floor((x1 + x2) / 2)},${Math.floor(
        (z1 + z2) / 2
      )}`;
      state[start + 3 + i] = npc.spatialMemory.exploredRegions.has(quadrantKey)
        ? 1
        : 0;
    }

    const recentPositions = npc.spatialMemory.visitedPositions.slice(-10);
    for (let i = 0; i < 9; i++) {
      if (i < recentPositions.length - 1) {
        const dx = recentPositions[i + 1].x - recentPositions[i].x;
        const dz = recentPositions[i + 1].z - recentPositions[i].z;
        const magnitude = Math.sqrt(dx * dx + dz * dz);
        state[start + 7 + i] = magnitude > 0 ? dx / (magnitude * 10) : 0;
      } else {
        state[start + 7 + i] = 0;
      }
    }
  }

  encodeActionHistory(state, lastAction) {
    const { start, size } = this.encoding.actionHistory;
    if (lastAction !== null && lastAction !== undefined) {
      const actionIdx = Math.min(Math.max(0, lastAction), size - 1);
      state[start + actionIdx] = 1;
    }
  }

  encodeGameInfo(state, gameState) {
    const { start } = this.encoding.gameInfo;

    const now = Date.now();
    const timeElapsed = now - (gameState.gameStartTime || now);
    const totalGameTime = NPC.HIDE_AND_SEEK.gameTimeLimit;
    const timeRemaining = Math.max(0, totalGameTime - timeElapsed);

    state[start] = timeRemaining / totalGameTime;
    state[start + 1] = 1.0 - timeRemaining / totalGameTime;

    const totalHiders = gameState.totalHiders || 2;
    state[start + 2] = (gameState.hidersFound || 0) / totalHiders;

    state[start + 3] = gameState.state === "seeking" ? 1 : 0;
    state[start + 4] = timeRemaining < 20000 ? 1 : 0;
  }

  encodeSeekerInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    for (let i = 0; i < 14; i++) {
      state[start + i] = 0;
    }

    const visibleHiders = perceptionData.visibleNPCs.filter(
      (n) => n.role === "hider"
    );

    if (visibleHiders.length > 0) {
      const nearest = visibleHiders[0];

      state[start] = 1.0;
      state[start + 1] = nearest.direction.x;
      state[start + 2] = nearest.direction.z;
      state[start + 3] = Math.min(1, nearest.distance / 12);
      state[start + 4] = Math.min(1, visibleHiders.length / 2);

      if (!npc.spatialMemory) {
        npc.spatialMemory = {
          visitedPositions: [],
          lastSeenTargetPos: null,
          lastSeenTargetTime: 0,
          exploredRegions: new Set(),
        };
      }
      npc.spatialMemory.lastSeenTargetPos = nearest.position.clone();
      npc.spatialMemory.lastSeenTargetTime = Date.now();
    } else {
      state[start + 5] = 1.0;
    }

    // Update visited positions
    this.updateSpatialMemory(npc);
  }

  encodeHiderInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    for (let i = 0; i < 14; i++) {
      state[start + i] = 0;
    }

    const visibleSeekers = perceptionData.visibleNPCs.filter(
      (n) => n.role === "seeker"
    );

    if (visibleSeekers.length > 0) {
      const nearest = visibleSeekers[0];
      const threatLevel = 1 - nearest.distance / 12;

      state[start] = 1.0;
      state[start + 1] = nearest.direction.x;
      state[start + 2] = nearest.direction.z;
      state[start + 3] = Math.min(1, nearest.distance / 12);
      state[start + 4] = threatLevel;

      // Update spatial memory with threat location
      if (!npc.spatialMemory) {
        npc.spatialMemory = {
          visitedPositions: [],
          lastSeenTargetPos: null,
          lastSeenTargetTime: 0,
          exploredRegions: new Set(),
        };
      }
      npc.spatialMemory.lastSeenTargetPos = nearest.position.clone();
      npc.spatialMemory.lastSeenTargetTime = Date.now();
    } else {
      state[start + 5] = 1.0;
    }

    state[start + 6] = npc.hideSeekState === "HIDDEN" ? 1 : 0;
    state[start + 7] = npc.hideSeekState === "FLEEING" ? 1 : 0;

    // Update visited positions
    this.updateSpatialMemory(npc);
  }

  updateSpatialMemory(npc) {
    if (!npc.spatialMemory) return;

    const currentPos = { x: npc.position.x, z: npc.position.z };
    npc.spatialMemory.visitedPositions.push(currentPos);
    if (npc.spatialMemory.visitedPositions.length > 10) {
      npc.spatialMemory.visitedPositions.shift();
    }

    // Track explored regions (16x16 grid cells)
    const gridX = Math.floor(npc.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const gridZ = Math.floor(npc.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    npc.spatialMemory.exploredRegions.add(`${gridX},${gridZ}`);
  }

  encodeVoxelNavigation(state, npc) {
    const { start } = this.encoding.voxelNavigation;

    const forward = {
      x: -Math.sin(npc.yaw),
      z: -Math.cos(npc.yaw),
    };

    const currentX = Math.floor(npc.position.x);
    const currentY = Math.floor(npc.position.y);
    const currentZ = Math.floor(npc.position.z);

    for (let dist = 1; dist <= 3; dist++) {
      const checkX = Math.floor(currentX + forward.x * dist);
      const checkZ = Math.floor(currentZ + forward.z * dist);

      const blockAtFeet = this.getBlockAt(checkX, currentY - 1, checkZ);
      const blockAtLevel = this.getBlockAt(checkX, currentY, checkZ);
      const blockAbove = this.getBlockAt(checkX, currentY + 1, checkZ);

      const idx = (dist - 1) * 4;

      if (!blockAtFeet && !blockAtLevel) {
        state[start + idx] = -1;
        state[start + idx + 1] = 0;
        state[start + idx + 2] = 0;
        state[start + idx + 3] = 0;
      } else if (blockAtLevel && !blockAbove) {
        state[start + idx] = 0;
        state[start + idx + 1] = 1;
        state[start + idx + 2] = 0;
        state[start + idx + 3] = 0;
      } else if (blockAtLevel && blockAbove) {
        state[start + idx] = 0;
        state[start + idx + 1] = 0;
        state[start + idx + 2] = 1;
        state[start + idx + 3] = 0;
      } else {
        state[start + idx] = 1;
        state[start + idx + 1] = 0;
        state[start + idx + 2] = 0;
        state[start + idx + 3] = 0;
      }
    }
  }

  getBlockAt(worldX, worldY, worldZ) {
    if (!this.chunkManager) {
      return null;
    }

    const CHUNK_SIZE = CLIENT_WORLD_CONFIG.CHUNK_SIZE;
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

    return { blockType };
  }

  encodeBlockInteraction(state, npc) {
    const { start } = this.encoding.blockInteraction;

    // Blocks placed/removed this episode (normalized)
    state[start] = (npc.blocksPlaced || 0) / 10;
    state[start + 1] = (npc.blocksRemoved || 0) / 10;

    // Can still place/remove?
    state[start + 2] = (npc.blocksPlaced || 0) < 10 ? 1.0 : 0.0;
    state[start + 3] = (npc.blocksRemoved || 0) < 10 ? 1.0 : 0.0;

    // Blocks nearby (normalized count)
    const nearbyBlocks = this.getNearbyBlockCount(npc);
    state[start + 4] = Math.min(nearbyBlocks / 20, 1.0);

    // Valid placement positions nearby
    const validPlacements = this.getValidPlacementCount(npc);
    state[start + 5] = Math.min(validPlacements / 10, 1.0);
  }

  getNearbyBlockCount(npc) {
    // Quick approximation using voxel navigation data
    return 5; // Placeholder - implement if needed
  }

  getValidPlacementCount(npc) {
    // Quick approximation
    return 3; // Placeholder - implement if needed
  }

  decodeAction(actionGroups) {
    if (typeof actionGroups === "number") {
      // Backwards compatibility with old single-action system
      actionGroups = this.seekerAgent.indexToActionGroups(actionGroups);
    }

    const parts = [];

    if (actionGroups.movement === 1) parts.push("fwd");
    if (actionGroups.movement === 2) parts.push("back");
    if (actionGroups.jump === 1) parts.push("jump");
    if (actionGroups.rotation === 1) parts.push("rotL");
    if (actionGroups.rotation === 2) parts.push("rotR");
    if (actionGroups.look === 1) parts.push("lookU");
    if (actionGroups.look === 2) parts.push("lookD");
    if (actionGroups.block === 1) parts.push("place");
    if (actionGroups.block === 2) parts.push("remove");

    return parts.length > 0 ? parts.join("+") : "idle";
  }
}

export default StateEncoder;
