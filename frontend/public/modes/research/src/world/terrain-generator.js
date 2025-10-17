// ==============================================================
// FILE: research/src/world/terrain-generator.js
// ==============================================================

import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import * as GameState from "../../../../src/core/game-state.js"; // ✅ IMPORT

// ✅ Store the current terrain seed globally
let currentTerrainSeed = TRAINING_WORLD_CONFIG.SEED;

export function getCurrentTerrainSeed() {
  return currentTerrainSeed;
}

async function waitForChunks(chunkManager) {
  const worldSize = TRAINING_WORLD_CONFIG.SIZE;
  const worldCenter = worldSize / 2;
  const chunkSize = chunkManager.CHUNK_SIZE;

  const spawnChunkX = Math.floor(worldCenter / chunkSize);
  const spawnChunkZ = Math.floor(worldCenter / chunkSize);

  const chunksNeeded = Math.ceil(worldSize / chunkSize);
  const radius = Math.floor(chunksNeeded / 2);

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const chunkX = spawnChunkX + dx;
      const chunkZ = spawnChunkZ + dz;
      if (chunkManager.isChunkInBounds(chunkX, chunkZ)) {
        chunkManager.generateChunk(chunkX, chunkZ);
      }
    }
  }

  const expectedMeshes = chunksNeeded * chunksNeeded * 3;

  return new Promise((resolve) => {
    const checkInterval = 100;
    const maxWaitTime = 10000;
    const startTime = Date.now();

    const checkMeshes = () => {
      let meshCount = 0;
      chunkManager.chunks.forEach((chunkData) => {
        chunkData.meshes.forEach((meshData) => {
          if (meshData.mesh && meshData.mesh.parent) {
            meshCount++;
          }
        });
      });

      const elapsed = Date.now() - startTime;

      if (meshCount >= expectedMeshes * 0.5 || elapsed > maxWaitTime) {
        console.log(
          `   Generated ${meshCount}/${expectedMeshes} chunks in ${elapsed}ms`
        );
        resolve();
        return;
      }

      setTimeout(checkMeshes, checkInterval);
    };

    checkMeshes();
  });
}

export async function regenerateTerrain(chunkManager) {
  if (!chunkManager?.chunkWorker) {
    console.warn(
      "Chunk manager or its worker is not available for terrain regeneration."
    );
    return;
  }

  const USE_SAME_SEED = false;
  const seed = USE_SAME_SEED ? 42 : Math.floor(Math.random() * 1000000);

  // ✅ Store the seed for NPC spawns
  currentTerrainSeed = seed;

  // ✅✅ CRITICAL: Update worldConfig.SEED so everything uses the same seed!
  if (GameState.worldConfig) {
    GameState.worldConfig.SEED = seed;
  }

  console.log(`🌍 Regenerating terrain with seed ${seed}...`);

  // Tell worker to regenerate with new seed
  chunkManager.chunkWorker.postMessage({
    type: "regenerate",
    seed: seed,
  });

  chunkManager.clearAllChunks();
  await waitForChunks(chunkManager);

  console.log(`✅ Terrain ready with seed ${seed}`);
}
