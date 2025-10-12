// ==============================================================
// FILE: research/src/ml/encoding/state-encoder.js
// ==============================================================

import { NPC } from "../npc/config-npc-behavior.js";
import { CLIENT_WORLD_CONFIG } from "../../../../src/core/game-state.js";

export class StateEncoder {
  constructor() {
    this.stateSize = 91;

    this.encoding = {
      position: { start: 0, size: 3 },
      orientation: { start: 3, size: 2 },
      velocity: { start: 5, size: 3 },
      onGround: { start: 8, size: 1 },
      boundaryProximity: { start: 9, size: 4 },
      visualField: { start: 13, size: 64 },
      gameInfo: { start: 77, size: 4 },
      targetMemory: { start: 81, size: 4 },
      roleSpecific: { start: 85, size: 6 },
    };

    // ADDED: Constants for normalization
    this.RAY_MAX_DIST = NPC.VISION?.visionRange || 32;
  }

  encode(npc, gameState, perceptionData, worldSize) {
    const state = new Array(this.stateSize).fill(0);

    this.encodePosition(state, npc.position, worldSize);
    this.encodeOrientation(state, npc.yaw, npc.pitch);
    this.encodeVelocity(state, npc); // CHANGED: Pass whole npc for role check
    state[this.encoding.onGround.start] = npc.isOnGround ? 1 : 0;
    this.encodeBoundaryProximity(state, npc, worldSize);
    this.encodeVisualField(state, perceptionData);
    this.encodeGameInfo(state, gameState);
    this.encodeTargetMemory(state, npc);

    if (npc.role === "seeker") {
      this.encodeSeekerInfo(state, npc, perceptionData);
    } else {
      this.encodeHiderInfo(state, npc, perceptionData);
    }

    for (let i = 0; i < state.length; i++) {
      if (!isFinite(state[i])) {
        state[i] = 0;
      }
      if (Math.abs(state[i]) > 10) {
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

    let normalizedYaw = yaw % (Math.PI * 2);
    if (normalizedYaw > Math.PI) normalizedYaw -= Math.PI * 2;
    if (normalizedYaw < -Math.PI) normalizedYaw += Math.PI * 2;

    state[start] = normalizedYaw / Math.PI;
    state[start + 1] = (pitch || 0) / (Math.PI / 2);
  }

  encodeVelocity(state, npc) {
    // CHANGED: Accept npc instead of just velocity
    const { start } = this.encoding.velocity;

    // FIXED: Use appropriate max speed based on role
    const maxSpeed =
      npc.role === "seeker" ? NPC.PHYSICS.SPRINT_SPEED : NPC.PHYSICS.WALK_SPEED;

    state[start] = Math.max(-1, Math.min(1, npc.velocity.x / maxSpeed));
    state[start + 1] = Math.max(-1, Math.min(1, npc.velocity.y / maxSpeed));
    state[start + 2] = Math.max(-1, Math.min(1, npc.velocity.z / maxSpeed));
  }

  encodeBoundaryProximity(state, npc, worldSize) {
    const { start } = this.encoding.boundaryProximity;
    const pos = npc.position;

    state[start] = pos.x / worldSize;
    state[start + 1] = (worldSize - pos.x) / worldSize;
    state[start + 2] = pos.z / worldSize;
    state[start + 3] = (worldSize - pos.z) / worldSize;
  }

  encodeVisualField(state, perceptionData) {
    const { start, size } = this.encoding.visualField;

    for (let i = 0; i < size; i++) {
      state[start + i] = 0;
    }

    if (!perceptionData?.raycastData?.rays) return;

    const rays = perceptionData.raycastData.rays;

    for (let i = 0; i < Math.min(size, rays.length); i++) {
      const ray = rays[i];

      if (ray.hit) {
        // FIXED: Use constant instead of hardcoded 32
        const normalizedDistance = ray.distance / this.RAY_MAX_DIST;

        if (ray.isPlayer) {
          state[start + i] = normalizedDistance * 0.5 + 0.01;
        } else {
          const blockType = this.encodeBlockType(ray.blockType);
          state[start + i] = normalizedDistance * 0.5 + blockType * 0.01;
        }
      }
    }
  }

  encodeBlockType(blockType) {
    if (!blockType || blockType === 0) {
      return 0;
    }

    const blockMap = {
      1: 0.9, // BEDROCK
      2: 0.2, // GRASS
      3: 0.5, // STONE
      4: 0.3, // DIRT
      5: 0.25, // SAND
      6: 0.2, // SNOW
      7: 0.1, // WATER
      8: 0.5, // COAL_ORE
      9: 0.5, // IRON_ORE
      10: 0.5, // GOLD_ORE
      11: 0.5, // DIAMOND_ORE
      12: 0.5, // EMERALD_ORE
      13: 0.5, // REDSTONE_ORE
      14: 0.5, // LAPIS_ORE
      15: 0.3, // PODZOL
      16: 0.3, // MUD
      17: 0.25, // RED_SAND
      18: 0.4, // GRAVEL
      19: 0.35, // CLAY
      20: 0.2, // JUNGLE_GRASS
      21: 0.2, // SAVANNA_GRASS
      22: 0.2, // SNOW_GRASS
      23: 0.15, // SEAGRASS
      24: 0.15, // ICE
      25: 0.7, // LOG
      26: 0.6, // LEAVES
      27: 0.5, // WOOD
    };

    return blockMap[blockType] || 0.5;
  }

  encodeGameInfo(state, gameState) {
    const { start } = this.encoding.gameInfo;

    const now = Date.now();

    // FIXED: Handle countdown phase properly
    const started = !!gameState.gameStartTime && gameState.gameStartTime <= now;
    const timeElapsed = started ? now - gameState.gameStartTime : 0;
    const totalGameTime = NPC.HIDE_AND_SEEK.gameTimeLimit;
    const timeRemaining = Math.max(0, totalGameTime - timeElapsed);

    state[start] = timeRemaining / totalGameTime;

    const totalHiders = gameState.totalHiders || 2;
    state[start + 1] = (gameState.hidersFound || 0) / totalHiders;

    // FIXED: Use constant instead of string
    state[start + 2] = gameState.state === NPC.GAME_STATES.SEEKING ? 1 : 0;

    state[start + 3] = timeRemaining < 20000 ? 1 : 0;
  }

  encodeTargetMemory(state, npc) {
    const { start } = this.encoding.targetMemory;

    if (!npc.lastSeenTarget) {
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      state[start + 3] = 0;
      return;
    }

    state[start] = npc.lastSeenTarget.x / 64;
    state[start + 1] = npc.lastSeenTarget.z / 64;

    // FIXED: Add small floor to prevent complete underflow (optional but safe)
    const timeSince = Date.now() - npc.lastSeenTarget.time;
    state[start + 2] = Math.max(0.01, Math.exp(-timeSince / 10000));

    state[start + 3] = npc.lastSeenTarget.currentlyVisible ? 1 : 0;
  }

  encodeSeekerInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

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
      state[start + 5] = nearest.distance < 2 ? 1 : 0;

      npc.lastSeenTarget = {
        x: nearest.position.x,
        z: nearest.position.z,
        time: Date.now(),
        currentlyVisible: true,
      };
    } else {
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      state[start + 3] = 0;
      state[start + 4] = 0;
      state[start + 5] = 0;

      if (npc.lastSeenTarget) {
        npc.lastSeenTarget.currentlyVisible = false;
      }
    }
  }

  encodeHiderInfo(state, npc, perceptionData) {
    const { start } = this.encoding.roleSpecific;

    const visibleSeekers = perceptionData.visibleNPCs.filter(
      (n) => n.role === "seeker"
    );

    if (visibleSeekers.length > 0) {
      const nearest = visibleSeekers[0];
      const threatLevel = Math.max(0, 1 - nearest.distance / 12);

      state[start] = 1.0;
      state[start + 1] = nearest.direction.x;
      state[start + 2] = nearest.direction.z;
      state[start + 3] = Math.min(1, nearest.distance / 12);
      state[start + 4] = threatLevel;
      state[start + 5] = nearest.distance < 3 ? 1 : 0;

      npc.lastSeenTarget = {
        x: nearest.position.x,
        z: nearest.position.z,
        time: Date.now(),
        currentlyVisible: true,
      };
    } else {
      state[start] = 0;
      state[start + 1] = 0;
      state[start + 2] = 0;
      state[start + 3] = 0;
      state[start + 4] = 0;
      state[start + 5] = 1;

      if (npc.lastSeenTarget) {
        npc.lastSeenTarget.currentlyVisible = false;
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

  decodeAction(action) {
    const parts = [];

    if (action.movement_forward !== undefined) {
      if (Math.abs(action.movement_forward) > 0.1) {
        parts.push(`fwd:${action.movement_forward.toFixed(2)}`);
      }
      if (Math.abs(action.movement_strafe) > 0.1) {
        parts.push(`strafe:${action.movement_strafe.toFixed(2)}`);
      }
      if (Math.abs(action.rotation) > 0.1) {
        parts.push(`rot:${action.rotation.toFixed(2)}`);
      }
      if (Math.abs(action.look) > 0.1) {
        parts.push(`look:${action.look.toFixed(2)}`);
      }
      if (action.jump) {
        parts.push("jump");
      }
    }

    return parts.length > 0 ? parts.join("+") : "idle";
  }
}

export default StateEncoder;
