// ==============================================================
// FILE: research/src/npc/physics/npc-physics.js
// ==============================================================

import * as GameState from "../../../../../src/core/game-state.js";
import { NPC } from "../config-npc-behavior.js";

//--------------------------------------------------------------//
//                        Physics Constants
//--------------------------------------------------------------//

export const NPC_PHYSICS = {
  GRAVITY: NPC.PHYSICS.GRAVITY,
  TERMINAL_VELOCITY: NPC.PHYSICS.TERMINAL_VELOCITY,
  JUMP_SPEED: NPC.PHYSICS.JUMP_SPEED,
  COLLISION_WIDTH: NPC.PHYSICS.COLLISION_WIDTH,
  COLLISION_HEIGHT: NPC.PHYSICS.COLLISION_HEIGHT,
  WALK_SPEED: NPC.PHYSICS.WALK_SPEED,
  GROUND_CHECK_DISTANCE: NPC.PHYSICS.GROUND_CHECK_DISTANCE,
};

const tempVector = new THREE.Vector3();
const testPosition = new THREE.Vector3();

//--------------------------------------------------------------//
//                        Core Physics
//--------------------------------------------------------------//

export function applyNPCGravity(npc, scene, deltaTime) {
  if (!npc.velocity) {
    npc.velocity = { x: 0, y: 0, z: 0 };
    npc.isOnGround = false;
  }

  const wasOnGround = npc.isOnGround;

  npc.velocity.y = Math.max(
    npc.velocity.y - NPC_PHYSICS.GRAVITY * deltaTime,
    NPC_PHYSICS.TERMINAL_VELOCITY
  );

  testPosition.copy(npc.position);
  testPosition.y += npc.velocity.y * deltaTime;

  const collision = checkNPCCollision(testPosition, scene);

  if (collision.collides) {
    npc.velocity.y = 0;
    npc.isOnGround = npc.velocity.y <= 0;
  } else {
    npc.position.y = testPosition.y;
    npc.isOnGround = false;
  }

  testPosition.copy(npc.position);
  testPosition.y -= NPC_PHYSICS.GROUND_CHECK_DISTANCE;

  if (checkNPCCollision(testPosition, scene).collides) {
    npc.isOnGround = true;
  }

  return {
    isOnGround: npc.isOnGround,
    justLanded: !wasOnGround && npc.isOnGround,
  };
}

export function makeNPCJump(npc, jumpVelocity = NPC_PHYSICS.JUMP_SPEED) {
  if (!npc.isOnGround || !npc.velocity) return false;

  npc.velocity.y = jumpVelocity;
  npc.isOnGround = false;
  return true;
}

export function moveNPC(npc, direction, speed, scene, deltaTime) {
  if (!direction || direction.lengthSq() === 0) {
    return { hasMoved: false, xBlocked: false, zBlocked: false };
  }

  tempVector
    .copy(direction)
    .normalize()
    .multiplyScalar(speed * deltaTime);
  tempVector.y = 0;

  const startPosition = npc.position.clone();

  testPosition.copy(npc.position);
  testPosition.x += tempVector.x;
  const xCollision = checkNPCCollision(testPosition, scene);

  if (!xCollision.collides) {
    npc.position.x = testPosition.x;
  }

  testPosition.copy(npc.position);
  testPosition.z += tempVector.z;
  const zCollision = checkNPCCollision(testPosition, scene);

  if (!zCollision.collides) {
    npc.position.z = testPosition.z;
  }

  enforceNPCBoundaries(npc);

  return {
    hasMoved: !npc.position.equals(startPosition),
    xBlocked: xCollision.collides,
    zBlocked: zCollision.collides,
  };
}

//--------------------------------------------------------------//
//                     Collision Detection
//--------------------------------------------------------------//

export function checkNPCCollision(position, scene) {
  const halfWidth = NPC_PHYSICS.COLLISION_WIDTH / 2;
  const halfHeight = NPC_PHYSICS.COLLISION_HEIGHT / 2;

  const minX = Math.floor(position.x - halfWidth);
  const maxX = Math.ceil(position.x + halfWidth);
  const minY = Math.floor(position.y - halfHeight);
  const maxY = Math.ceil(position.y + halfHeight);
  const minZ = Math.floor(position.z - halfWidth);
  const maxZ = Math.ceil(position.z + halfWidth);

  for (let x = minX; x < maxX; x++) {
    for (let y = minY; y < maxY; y++) {
      for (let z = minZ; z < maxZ; z++) {
        const blockType = getBlockTypeAt(x, y, z);

        if (isSolidBlock(blockType)) {
          if (isCollidingWithBlock(position, x, y, z)) {
            return {
              collides: true,
              blockType: blockType,
              blockPosition: { x, y, z },
            };
          }
        }
      }
    }
  }

  return { collides: false };
}

function getBlockTypeAt(x, y, z) {
  try {
    return GameState.getBlockType(x, y, z);
  } catch (e) {
    return 998;
  }
}

function isSolidBlock(blockType) {
  return blockType > 0 && blockType !== 8 && blockType !== 9;
}

function isCollidingWithBlock(npcPosition, blockX, blockY, blockZ) {
  const npcBox = {
    minX: npcPosition.x - NPC_PHYSICS.COLLISION_WIDTH / 2,
    maxX: npcPosition.x + NPC_PHYSICS.COLLISION_WIDTH / 2,
    minY: npcPosition.y - NPC_PHYSICS.COLLISION_HEIGHT / 2,
    maxY: npcPosition.y + NPC_PHYSICS.COLLISION_HEIGHT / 2,
    minZ: npcPosition.z - NPC_PHYSICS.COLLISION_WIDTH / 2,
    maxZ: npcPosition.z + NPC_PHYSICS.COLLISION_WIDTH / 2,
  };

  const blockBox = {
    minX: blockX,
    maxX: blockX + 1,
    minY: blockY,
    maxY: blockY + 1,
    minZ: blockZ,
    maxZ: blockZ + 1,
  };

  return (
    npcBox.minX < blockBox.maxX &&
    npcBox.maxX > blockBox.minX &&
    npcBox.minY < blockBox.maxY &&
    npcBox.maxY > blockBox.minY &&
    npcBox.minZ < blockBox.maxZ &&
    npcBox.maxZ > blockBox.minZ
  );
}

//--------------------------------------------------------------//
//                     Boundary System
//--------------------------------------------------------------//

export function enforceNPCBoundaries(npc) {
  if (!npc || !npc.position) return false;

  const worldConfig = GameState.worldConfig;
  if (!worldConfig || !worldConfig.SIZE) return false;

  const worldSize = worldConfig.SIZE;
  const buffer = 1.0;
  let wasContained = false;

  if (npc.position.x < buffer) {
    npc.position.x = buffer;
    if (npc.velocity) npc.velocity.x = 0;
    wasContained = true;
  } else if (npc.position.x > worldSize - buffer) {
    npc.position.x = worldSize - buffer;
    if (npc.velocity) npc.velocity.x = 0;
    wasContained = true;
  }

  if (npc.position.z < buffer) {
    npc.position.z = buffer;
    if (npc.velocity) npc.velocity.z = 0;
    wasContained = true;
  } else if (npc.position.z > worldSize - buffer) {
    npc.position.z = worldSize - buffer;
    if (npc.velocity) npc.velocity.z = 0;
    wasContained = true;
  }

  if (npc.position.y < 0) {
    npc.position.y = 1;
    if (npc.velocity) npc.velocity.y = 0;
    wasContained = true;
  } else if (npc.position.y > 100) {
    npc.position.y = 100;
    if (npc.velocity) npc.velocity.y = 0;
    wasContained = true;
  }

  return wasContained;
}

//--------------------------------------------------------------//
//                     Pitch System
//--------------------------------------------------------------//

export function calculatePitchToTarget(npc, targetPosition) {
  const dx = targetPosition.x - npc.position.x;
  const dy = targetPosition.y - npc.position.y;
  const dz = targetPosition.z - npc.position.z;

  const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
  return Math.atan2(dy, horizontalDistance);
}

export function updateNPCPitch(npc, targetPitch, rotationSpeed = 0.1) {
  if (!npc.pitch) npc.pitch = 0;

  targetPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetPitch));
  const diff = targetPitch - npc.pitch;

  if (Math.abs(diff) > rotationSpeed) {
    npc.pitch += Math.sign(diff) * rotationSpeed;
  } else {
    npc.pitch = targetPitch;
  }

  return npc.pitch;
}

//--------------------------------------------------------------//
//                     Utility Functions
//--------------------------------------------------------------//

export function resetNPCPhysics(npc) {
  if (!npc) return;
  npc.velocity = { x: 0, y: 0, z: 0 };
  npc.isOnGround = false;
  npc.pitch = 0;
}

export function canNPCMoveTo(npc, direction, distance = 1, scene) {
  if (!npc || !direction || !npc.position) return false;

  testPosition.copy(npc.position);
  testPosition.add(direction.clone().normalize().multiplyScalar(distance));

  return !checkNPCCollision(testPosition, scene).collides;
}

export function updateNPCPhysics(npc, scene, deltaTime) {
  if (!npc || !npc.visible || !npc.position) return;

  applyNPCGravity(npc, scene, deltaTime);
  enforceNPCBoundaries(npc);
}

export function checkLanding(npc) {
  return npc.isOnGround;
}

//--------------------------------------------------------------//
//                        Exports
//--------------------------------------------------------------//

export default {
  NPC_PHYSICS,
  applyNPCGravity,
  makeNPCJump,
  moveNPC,
  checkNPCCollision,
  resetNPCPhysics,
  enforceNPCBoundaries,
  canNPCMoveTo,
  updateNPCPhysics,
  calculatePitchToTarget,
  updateNPCPitch,
  checkLanding,
};
