// ==============================================================
// FILE: frontend/public/modes/research/src/core/boundary-integration.js
// ==============================================================

import * as GameState from "../../../../src/core/game-state.js";
import ResearchBoundaryWalls from "../world/boundary.js";

let researchBoundarySystem = null;
let originalGetBlockType = null;

export function initializeResearchBoundaries(scene, worldConfig) {
  if (researchBoundarySystem) {
    researchBoundarySystem.dispose();
  }

  researchBoundarySystem = new ResearchBoundaryWalls(scene, worldConfig);
  researchBoundarySystem.initialize();

  return researchBoundarySystem;
}

export function getResearchBlockType(x, y, z) {
  if (researchBoundarySystem && researchBoundarySystem.initialized) {
    if (researchBoundarySystem.isBoundaryBlock(x, y, z)) {
      return 998;
    }
  }

  try {
    const getBlockTypeFn = originalGetBlockType || GameState.getBlockType;
    return getBlockTypeFn(x, y, z);
  } catch (error) {
    const worldSize = researchBoundarySystem
      ? researchBoundarySystem.worldConfig.SIZE
      : 32;

    if (
      x < -5 ||
      x >= worldSize + 5 ||
      z < -5 ||
      z >= worldSize + 5 ||
      y < -10 ||
      y > 256
    ) {
      return 998;
    }

    return 0;
  }
}

export function enableResearchBoundaryIntegration() {
  if (!originalGetBlockType) {
    originalGetBlockType = GameState.getBlockType;
  }

  try {
    GameState.getBlockType = function (x, y, z) {
      return getResearchBlockType(x, y, z);
    };
    return true;
  } catch (overrideError) {
    if (!window.ResearchGameState) {
      window.ResearchGameState = {
        getBlockType: getResearchBlockType,
        original: GameState,
      };
    }
    return false;
  }
}

export function disableResearchBoundaryIntegration() {
  if (originalGetBlockType) {
    try {
      GameState.getBlockType = originalGetBlockType;
    } catch (restoreError) {
      // Silent fail
    }
  }

  if (window.ResearchGameState) {
    delete window.ResearchGameState;
  }
}

export function getResearchModeBlockTypeFn() {
  return window.ResearchGameState
    ? window.ResearchGameState.getBlockType
    : getResearchBlockType;
}

export function toggleResearchBoundaryDebug() {
  if (!researchBoundarySystem) {
    return 0;
  }

  const currentState = researchBoundarySystem.getDisplayState();
  let newState;

  switch (currentState) {
    case 2:
      newState = 1;
      break;
    case 1:
      newState = 0;
      break;
    case 0:
    default:
      newState = 2;
      break;
  }

  researchBoundarySystem.setDisplayState(newState);
  return newState;
}

export function setResearchBoundaryState(state) {
  if (!researchBoundarySystem) return;
  researchBoundarySystem.setDisplayState(state);
}

export function getResearchBoundaryState() {
  if (!researchBoundarySystem) return 0;
  return researchBoundarySystem.getDisplayState();
}

export function checkNPCBoundaryCollision(
  npcPosition,
  entitySize = { width: 0.6, height: 1.8 }
) {
  if (!researchBoundarySystem) {
    return { collides: false, boundaryBlock: false };
  }

  return researchBoundarySystem.checkMeshBoundaryCollision(
    npcPosition,
    entitySize
  );
}

export function correctNPCMovementForBoundaries(
  oldPosition,
  newPosition,
  entitySize = { width: 0.6, height: 1.8 }
) {
  if (!researchBoundarySystem) {
    return newPosition;
  }

  return researchBoundarySystem.correctMovementForMeshBoundary(
    oldPosition,
    newPosition,
    entitySize
  );
}

export function enforceNPCContainment(npc) {
  if (!researchBoundarySystem || !npc) {
    return false;
  }

  return researchBoundarySystem.enforceNPCContainment(npc);
}

export function getResearchBoundarySystem() {
  return researchBoundarySystem;
}

export function setResearchBoundaryVisibility(visible) {
  if (!researchBoundarySystem) return;
  const state = visible ? 1 : 0;
  setResearchBoundaryState(state);
}

export function updateBoundaryWallAppearance(wallName, properties) {
  if (!researchBoundarySystem) return;
  researchBoundarySystem.updateWallAppearance(wallName, properties);
}

export function isNearResearchBoundary(position, threshold = 2) {
  if (!researchBoundarySystem) return false;

  const worldSize = researchBoundarySystem.worldConfig.SIZE;

  return (
    position.x < threshold ||
    position.x > worldSize - threshold ||
    position.z < threshold ||
    position.z > worldSize - threshold ||
    position.y < threshold ||
    position.y > researchBoundarySystem.BOUNDARY_HEIGHT - threshold
  );
}

export function getSafeNPCSpawnPosition(worldConfig) {
  const worldSize = worldConfig ? worldConfig.SIZE : 100;
  const buffer = 5;

  return new THREE.Vector3(
    buffer + Math.random() * (worldSize - buffer * 2),
    30,
    buffer + Math.random() * (worldSize - buffer * 2)
  );
}

export function isBoundaryBlockType(blockType) {
  return blockType === 998;
}

export function getBoundaryInfo() {
  if (!researchBoundarySystem) {
    return { available: false };
  }

  return {
    available: true,
    initialized: researchBoundarySystem.initialized,
    worldSize: researchBoundarySystem.worldConfig.SIZE,
    displayState: researchBoundarySystem.displayState,
    isVisible: researchBoundarySystem.isVisible(),
  };
}

export function cleanupResearchBoundaries() {
  disableResearchBoundaryIntegration();

  if (researchBoundarySystem) {
    researchBoundarySystem.dispose();
    researchBoundarySystem = null;
  }

  originalGetBlockType = null;
}

export function quickSetupBoundaries(scene, worldSize = 100) {
  const worldConfig = {
    SIZE: worldSize,
    MAX_HEIGHT: 256,
  };

  const boundarySystem = initializeResearchBoundaries(scene, worldConfig);
  enableResearchBoundaryIntegration();

  return boundarySystem;
}

export default {
  initializeResearchBoundaries,
  enableResearchBoundaryIntegration,
  disableResearchBoundaryIntegration,
  getResearchModeBlockTypeFn,
  getResearchBlockType,
  toggleResearchBoundaryDebug,
  setResearchBoundaryState,
  getResearchBoundaryState,
  setResearchBoundaryVisibility,
  updateBoundaryWallAppearance,
  checkNPCBoundaryCollision,
  correctNPCMovementForBoundaries,
  enforceNPCContainment,
  getSafeNPCSpawnPosition,
  isNearResearchBoundary,
  getResearchBoundarySystem,
  isBoundaryBlockType,
  getBoundaryInfo,
  cleanupResearchBoundaries,
  quickSetupBoundaries,
};
