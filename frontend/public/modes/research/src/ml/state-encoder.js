// ==============================================================
// FILE: research/src/ml/encoding/state-encoder.js
// ==============================================================

export class StateEncoder {
  constructor() {
    this.stateSize = 140;

    this.encoding = {
      position: { start: 0, size: 3 },
      orientation: { start: 3, size: 2 },
      velocity: { start: 5, size: 3 },
      onGround: { start: 8, size: 1 },
      visualField: { start: 9, size: 64 },
      memory: { start: 73, size: 16 },
      actionHistory: { start: 89, size: 12 },
      gameInfo: { start: 101, size: 5 },
      roleSpecific: { start: 106, size: 14 },
      boundaryProximity: { start: 120, size: 4 },
      jumpInfo: { start: 124, size: 4 },
      voxelNavigation: { start: 128, size: 12 },
    };
  }

  encode(npc, gameState, perceptionData, worldSize = 512) {
    const state = new Array(this.stateSize).fill(0);

    this.encodePosition(state, npc.position, worldSize);
    this.encodeOrientation(state, npc.yaw, npc.pitch);
    this.encodeVelocity(state, npc.velocity);
    state[this.encoding.onGround.start] = npc.isOnGround ? 1 : 0;
    this.encodeVisualField(state, perceptionData);
    this.encodeMemory(state, npc.spatialMemory);
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

    return state;
  }

  encodePosition(state, position, worldSize = 512) {
    const { start } = this.encoding.position;
    state[start] = position.x / worldSize;
    state[start + 1] = position.y / 100;
    state[start + 2] = position.z / worldSize;
  }

  encodeOrientation(state, yaw, pitch) {
    const { start } = this.encoding.orientation;
    state[start] = yaw / Math.PI;
    state[start + 1] = (pitch || 0) / (Math.PI / 2);
  }

  encodeVelocity(state, velocity) {
    const { start } = this.encoding.velocity;
    const maxSpeed = 0.2;
    state[start] = Math.max(-1, Math.min(1, velocity.x / maxSpeed));
    state[start + 1] = Math.max(-1, Math.min(1, velocity.y / maxSpeed));
    state[start + 2] = Math.max(-1, Math.min(1, velocity.z / maxSpeed));
  }

  encodeVisualField(state, perceptionData) {
    const { start, size } = this.encoding.visualField;

    // Initialize to "no detection"
    for (let i = 0; i < size; i++) {
      state[start + i] = 0;
    }

    // Encode raycast data
    if (perceptionData?.raycastData?.rays) {
      const rays = perceptionData.raycastData.rays;

      for (let i = 0; i < Math.min(size, rays.length); i++) {
        const ray = rays[i];

        if (ray.hit) {
          const normalizedDistance = ray.distance / 12; // Normalize by vision range

          if (ray.isPlayer) {
            // Strong signal: player detected
            state[start + i] = 1.0 + normalizedDistance; // 1.0 to 2.0
          } else {
            // Block hit
            const blockType = this.encodeBlockType(ray.blockType);
            state[start + i] = normalizedDistance * 0.5 + blockType * 0.01; // 0.0 to 0.5
          }
        }
      }
    }
  }

  encodeBoundaryProximity(state, npc, worldSize) {
    const { start } = this.encoding.boundaryProximity;
    const pos = npc.position;

    // Normalize by world size (0 = at boundary, 1 = at opposite boundary)
    state[start] = pos.z / worldSize; // Distance to north (z=0)
    state[start + 1] = (worldSize - pos.z) / worldSize; // Distance to south
    state[start + 2] = pos.x / worldSize; // Distance to west (x=0)
    state[start + 3] = (worldSize - pos.x) / worldSize; // Distance to east
  }

  encodeBlockType(blockType) {
    if (!blockType || blockType === 0) return 0;
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

    // Default: no obstacle
    state[start] = 0; // Obstacle ahead requiring jump
    state[start + 1] = 0; // Obstacle height
    state[start + 2] = npc.isOnGround ? 1.0 : 0.0; // Can jump now?
    state[start + 3] = npc.jumpCooldown > 0 ? 1.0 : 0.0; // Jump on cooldown?

    if (!perceptionData?.raycastData?.rays) return;

    // Check central rays (directly ahead) for close obstacles
    const rays = perceptionData.raycastData.rays;
    const centerIdx = Math.floor(rays.length / 2);
    const checkRange = 3; // Check 3 rays each side of center

    let closestObstacle = Infinity;
    let obstacleDetected = false;

    for (let i = centerIdx - checkRange; i <= centerIdx + checkRange; i++) {
      if (i < 0 || i >= rays.length) continue;

      const ray = rays[i];
      if (ray.hit && !ray.isPlayer && ray.distance < 2.5) {
        // Block detected ahead within jump distance
        obstacleDetected = true;
        closestObstacle = Math.min(closestObstacle, ray.distance);
      }
    }

    if (obstacleDetected) {
      state[start] = 1.0; // Obstacle present
      state[start + 1] = Math.max(0, 1.0 - closestObstacle / 2.5); // Closer = higher value
    }
  }

  encodeMemory(state, spatialMemory) {
    const { start, size } = this.encoding.memory;
    if (!spatialMemory || !spatialMemory.chunks) return;
    for (let i = 0; i < size; i++) {
      state[start + i] = Math.random() * 0.5; // Placeholder
    }
  }

  encodeActionHistory(state, lastAction) {
    const { start, size } = this.encoding.actionHistory;
    if (lastAction !== null && lastAction !== undefined) {
      const actionIdx = Math.min(lastAction, size - 1);
      state[start + actionIdx] = 1;
    }
  }

  encodeGameInfo(state, gameState) {
    const { start } = this.encoding.gameInfo;

    // Time tracking - critical for game awareness
    const now = Date.now();
    const timeElapsed = now - (gameState.gameStartTime || now);
    const totalGameTime = 60000; // 60 seconds total game time
    const timeRemaining = Math.max(0, totalGameTime - timeElapsed);

    // Normalized time remaining (1.0 = full time, 0.0 = time up)
    state[start] = timeRemaining / totalGameTime;

    // Time urgency factor (increases as time runs out)
    state[start + 1] = 1.0 - timeRemaining / totalGameTime;

    // Game progress - hiders found
    const totalHiders = gameState.totalHiders || 2;
    state[start + 2] = (gameState.hidersFound || 0) / totalHiders;

    // Game phase (0 = countdown, 1 = seeking)
    state[start + 3] = gameState.state === "seeking" ? 1 : 0;

    // Critical time marker (1 if less than 20 seconds left)
    state[start + 4] = timeRemaining < 20000 ? 1 : 0;
  }

  encodeSeekerInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    // Reset
    for (let i = 0; i < 14; i++) {
      state[start + i] = 0;
    }

    const visibleHiders = perceptionData.visibleNPCs.filter(
      (n) => n.role === "hider"
    );

    if (visibleHiders.length > 0) {
      const nearest = visibleHiders[0];

      state[start] = 1.0; // Detection flag
      state[start + 1] = nearest.direction.x; // Direction X
      state[start + 2] = nearest.direction.z; // Direction Z
      state[start + 3] = Math.min(1, nearest.distance / 12); // Normalized distance
      state[start + 4] = Math.min(1, visibleHiders.length / 2); // Count
    } else {
      state[start + 5] = 1.0; // Exploration mode flag
    }
  }

  encodeHiderInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    // Reset
    for (let i = 0; i < 14; i++) {
      state[start + i] = 0;
    }

    const visibleSeekers = perceptionData.visibleNPCs.filter(
      (n) => n.role === "seeker"
    );

    if (visibleSeekers.length > 0) {
      const nearest = visibleSeekers[0];
      const threatLevel = 1 - nearest.distance / 12;

      state[start] = 1.0; // Detection flag
      state[start + 1] = nearest.direction.x; // Direction X
      state[start + 2] = nearest.direction.z; // Direction Z
      state[start + 3] = Math.min(1, nearest.distance / 12); // Normalized distance
      state[start + 4] = threatLevel; // Threat level
    } else {
      state[start + 5] = 1.0; // Safe/hide mode flag
    }

    // Hiding state
    state[start + 6] = npc.hideSeekState === "HIDDEN" ? 1 : 0;
    state[start + 7] = npc.hideSeekState === "FLEEING" ? 1 : 0;
  }

  encodeVoxelNavigation(state, npc) {
    const { start } = this.encoding.voxelNavigation;

    // Direction NPC is facing
    const forward = {
      x: -Math.sin(npc.yaw),
      z: -Math.cos(npc.yaw),
    };

    const currentX = Math.floor(npc.position.x);
    const currentY = Math.floor(npc.position.y);
    const currentZ = Math.floor(npc.position.z);

    // Check 3 distances ahead: 1, 2, 3 blocks
    for (let dist = 1; dist <= 3; dist++) {
      const checkX = Math.floor(currentX + forward.x * dist);
      const checkZ = Math.floor(currentZ + forward.z * dist);

      // Check blocks at different heights relative to NPC
      const blockAtFeet = this.getBlockAt(checkX, currentY - 1, checkZ); // Ground
      const blockAtLevel = this.getBlockAt(checkX, currentY, checkZ); // Body height
      const blockAbove = this.getBlockAt(checkX, currentY + 1, checkZ); // Head height

      const idx = (dist - 1) * 4;

      // Encode what's at this distance
      if (!blockAtFeet && !blockAtLevel) {
        // DROP-OFF (no ground, dangerous!)
        state[start + idx] = -1;
        state[start + idx + 1] = 0;
        state[start + idx + 2] = 0;
        state[start + idx + 3] = 0;
      } else if (blockAtLevel && !blockAbove) {
        // 1-BLOCK STEP (need to jump)
        state[start + idx] = 0;
        state[start + idx + 1] = 1; // Jump needed
        state[start + idx + 2] = 0;
        state[start + idx + 3] = 0;
      } else if (blockAtLevel && blockAbove) {
        // 2-BLOCK WALL (can't pass)
        state[start + idx] = 0;
        state[start + idx + 1] = 0;
        state[start + idx + 2] = 1; // Wall
        state[start + idx + 3] = 0;
      } else {
        // WALKABLE (clear path)
        state[start + idx] = 1; // Walkable
        state[start + idx + 1] = 0;
        state[start + idx + 2] = 0;
        state[start + idx + 3] = 0;
      }
    }
  }

  getBlockAt(worldX, worldY, worldZ) {
    if (!this.chunkManager) {
      console.warn("ChunkManager not set in StateEncoder");
      return null;
    }

    const CHUNK_SIZE = 16;
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

  decodeAction(actionIndex) {
    const actions = [
      "move_forward", // 0
      "move_backward", // 1
      "move_left", // 2
      "move_right", // 3
      "jump", // 4
      "rotate_left", // 5 (was 6)
      "rotate_right", // 6 (was 7)
      "rotate_up", // 7 (was 8)
      "rotate_down", // 8 (was 9)
      // Crouching (5), place_block (10), and remove_block (11) are removed/ignored
    ];
    return actions[actionIndex] || "unknown";
  }
}

export default StateEncoder;
