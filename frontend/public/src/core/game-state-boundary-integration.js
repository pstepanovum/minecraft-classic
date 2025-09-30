// ==============================================================
// FILE: src/core/game-state-boundary-integration.js
// ==============================================================

/**
 * This file extends the GameState module to support world boundaries
 * without modifying the existing physics engine
 */

import * as GameState from "./game-state.js";
import WorldBoundarySystem from "../../src/world/world-boundaries.js";

// Global boundary system reference
let globalBoundarySystem = null;

/**
 * Initialize the boundary system with world configuration
 */
export function initializeBoundarySystem(scene, worldConfig) {
  if (globalBoundarySystem) {
    globalBoundarySystem.destroy();
  }

  globalBoundarySystem = new WorldBoundarySystem(scene, worldConfig);
  globalBoundarySystem.initialize();

  console.log("World boundary system initialized");
  return globalBoundarySystem;
}

/**
 * Enhanced getBlockType function that includes boundary blocks
 * This extends the existing GameState.getBlockType() function
 */
export function getBlockTypeWithBoundaries(x, y, z) {
  // Check boundary blocks first
  if (globalBoundarySystem && globalBoundarySystem.initialized) {
    if (globalBoundarySystem.isBoundaryBlock(x, y, z)) {
      return 999; // Boundary block type (solid but invisible)
    }
  }

  // Fall back to normal block checking
  try {
    return GameState.getBlockType(x, y, z);
  } catch (error) {
    // If we can't get the block type (outside loaded chunks),
    // treat as boundary to prevent falling off the world
    const worldSize = globalBoundarySystem
      ? globalBoundarySystem.worldConfig.SIZE
      : 32;

    if (
      x < 0 ||
      x >= worldSize ||
      z < 0 ||
      z >= worldSize ||
      y < -5 ||
      y > 100
    ) {
      return 999; // Boundary block
    }

    return 0; // Air
  }
}

/**
 * Override the global GameState.getBlockType function
 * This makes the boundary system transparent to existing code
 */
export function enableBoundaryIntegration() {
  // Store the original function
  const originalGetBlockType = GameState.getBlockType;

  // Override with boundary-aware version
  GameState.getBlockType = function (x, y, z) {
    return getBlockTypeWithBoundaries(x, y, z);
  };

  // Also store reference to original for debugging
  GameState.getBlockType.original = originalGetBlockType;

  console.log(
    "Boundary integration enabled - GameState.getBlockType now includes boundaries"
  );
}

/**
 * Disable boundary integration (restore original function)
 */
export function disableBoundaryIntegration() {
  if (GameState.getBlockType.original) {
    GameState.getBlockType = GameState.getBlockType.original;
    console.log("Boundary integration disabled");
  }
}

/**
 * Get the current boundary system
 */
export function getBoundarySystem() {
  return globalBoundarySystem;
}

/**
 * Check if a position is near world boundaries
 */
export function isNearBoundary(position, threshold = 3) {
  if (!globalBoundarySystem) return false;

  const worldSize = globalBoundarySystem.worldConfig.SIZE;

  return (
    position.x < threshold ||
    position.x > worldSize - 1 - threshold ||
    position.z < threshold ||
    position.z > worldSize - 1 - threshold ||
    position.y < threshold ||
    position.y > globalBoundarySystem.BOUNDARY_HEIGHT - threshold
  );
}

/**
 * Get a safe position away from boundaries
 */
export function getSafePosition(position) {
  if (!globalBoundarySystem) return position.clone();

  const worldSize = globalBoundarySystem.worldConfig.SIZE;
  const buffer = 2;

  const safePos = position.clone();

  // Clamp to safe boundaries
  safePos.x = Math.max(0 + buffer, Math.min(worldSize - 1 - buffer, safePos.x));
  safePos.z = Math.max(0 + buffer, Math.min(worldSize - 1 - buffer, safePos.z));
  safePos.y = Math.max(
    buffer,
    Math.min(globalBoundarySystem.BOUNDARY_HEIGHT - buffer, safePos.y)
  );

  return safePos;
}

/**
 * Emergency teleport function for entities that fall off the world
 */
export function emergencyTeleportToSafety(entity, scene) {
  if (!entity || !globalBoundarySystem) return false;

  // Find a safe spawn position
  const worldSize = globalBoundarySystem.worldConfig.SIZE;
  const centerX = Math.floor(worldSize / 2);
  const centerZ = Math.floor(worldSize / 2);

  // Try to find ground level at center
  let safeY = 32; // Default height
  for (let y = 60; y > 10; y--) {
    const blockType = getBlockTypeWithBoundaries(centerX, y - 1, centerZ);
    if (blockType > 0 && blockType !== 8 && blockType !== 9) {
      // Solid ground (not water)
      safeY = y;
      break;
    }
  }

  const safePosition = new THREE.Vector3(centerX, safeY + 1, centerZ);
  entity.position.copy(safePosition);

  // Reset physics if entity has physics state
  if (entity.velocity) {
    entity.velocity.x = 0;
    entity.velocity.y = 0;
    entity.velocity.z = 0;
    entity.isOnGround = false;
  }

  console.log(
    `Emergency teleport: moved entity to safe position (${centerX}, ${safeY}, ${centerZ})`
  );
  return true;
}

/**
 * Monitor entities for boundary violations
 */
export function checkEntityBoundaries(entity) {
  if (!entity || !globalBoundarySystem) return false;

  const position = entity.position;

  // Check if entity has fallen off the world
  if (position.y < -20) {
    console.warn("Entity fell below world, teleporting to safety");
    emergencyTeleportToSafety(entity);
    return true;
  }

  // Check if entity is way outside world boundaries
  const worldSize = globalBoundarySystem.worldConfig.SIZE;
  const emergencyDistance = worldSize * 1.5; // Adjusted

  if (
    position.x < -emergencyDistance ||
    position.x > worldSize - 1 + emergencyDistance ||
    position.z < -emergencyDistance ||
    position.z > worldSize - 1 + emergencyDistance
  ) {
    console.warn("Entity escaped world boundaries, teleporting to safety");
    emergencyTeleportToSafety(entity);
    return true;
  }

  return false;
}

// Export all functions
export default {
  initializeBoundarySystem,
  getBlockTypeWithBoundaries,
  enableBoundaryIntegration,
  disableBoundaryIntegration,
  getBoundarySystem,
  isNearBoundary,
  getSafePosition,
  emergencyTeleportToSafety,
  checkEntityBoundaries,
};
