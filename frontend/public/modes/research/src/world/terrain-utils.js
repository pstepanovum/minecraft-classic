// ==============================================================
// FILE: research/src/world/terrain-utils.js
// ==============================================================

import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";

/**
 * Calculate terrain height using the EXACT same formula as the web worker
 * This ensures NPCs spawn at correct heights
 */
export function calculateTerrainHeight(x, z, seed) {
  // SimplexNoise is loaded globally via <script> tag
  if (!window.SimplexNoise) {
    console.error("❌ SimplexNoise not available!");
    return TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL;
  }

  const noise = new window.SimplexNoise(seed);
  
  let noiseValue = 0;
  let amplitude = TRAINING_WORLD_CONFIG.TERRAIN.AMPLITUDE;
  let frequency = TRAINING_WORLD_CONFIG.TERRAIN.FREQUENCY;
  const scale = TRAINING_WORLD_CONFIG.TERRAIN.SCALE;
  const octaves = TRAINING_WORLD_CONFIG.TERRAIN.OCTAVES;

  // Generate noise using multiple octaves (IDENTICAL to worker)
  for (let i = 0; i < octaves; i++) {
    noiseValue += noise.noise2D(x * scale * frequency, z * scale * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  // Normalize noise to range [0, 1]
  const normalizedNoise = (noiseValue + 1) / 2;
  
  // Calculate surface height
  const surfaceHeight = Math.floor(
    TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL + 
    normalizedNoise * TRAINING_WORLD_CONFIG.TERRAIN_HEIGHT_RANGE
  );

  // Ensure doesn't exceed max height
  return Math.min(surfaceHeight, TRAINING_WORLD_CONFIG.MAX_HEIGHT);
}

/**
 * Find safe spawn height with proper clearance above terrain
 */
export function findSafeSpawnHeight(x, z, seed) {
  const terrainHeight = calculateTerrainHeight(x, z, seed);
  const waterLevel = TRAINING_WORLD_CONFIG.WATER_LEVEL;
  
  // If terrain is underwater, spawn above water surface
  if (terrainHeight < waterLevel) {
    return waterLevel + 2; // 2 blocks above water
  }
  
  // Normal spawn: 2 blocks above solid ground
  return terrainHeight + 2;
}

/**
 * Validate that a position is safe (not too close to boundaries)
 */
export function isPositionSafe(x, z, worldSize, minBuffer = 10) {
  return (
    x >= minBuffer && 
    x <= worldSize - minBuffer &&
    z >= minBuffer && 
    z <= worldSize - minBuffer
  );
}