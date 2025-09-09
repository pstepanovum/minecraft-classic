// ==============================================================
// FILE: research/src/npc/physics/npc-physics.js
// ==============================================================

import * as GameState from '../../../../../src/core/game-state.js';
import { NPC_BEHAVIOR } from '../config-npc-behavior.js';

// Constants for NPC physics
export const NPC_PHYSICS = {
    GRAVITY: 0.008,
    TERMINAL_VELOCITY: -3,
    JUMP_SPEED: 0.15,
    COLLISION_WIDTH: 0.5,
    COLLISION_HEIGHT: 1.6,
    WALK_SPEED: 0.065,
    GROUND_CHECK_DISTANCE: 0.15
};

// Reusable vectors for calculations
const moveVector = new THREE.Vector3();
const newPosition = new THREE.Vector3();
const groundCheckPos = new THREE.Vector3();

/**
 * Apply gravity to an NPC and handle ground collisions
 */
export function applyNPCGravity(npc, scene, deltaTime = 1) {
    // Initialize velocity if not exists
    if (npc.velocity === undefined) {
        npc.velocity = { x: 0, y: 0, z: 0 };
        npc.isOnGround = false;
    }
    
    // Apply gravity with delta time
    npc.velocity.y = Math.max(
        npc.velocity.y - (NPC_PHYSICS.GRAVITY * deltaTime * 60), 
        NPC_PHYSICS.TERMINAL_VELOCITY
    );
    
    // Calculate new position
    newPosition.copy(npc.position);
    newPosition.y += npc.velocity.y;
    
    // Check for collision with ground/ceiling
    const collision = checkNPCCollision(newPosition, scene);
    
    if (!collision.collides) {
        // No collision, apply velocity
        npc.position.y = newPosition.y;
        npc.isOnGround = false;
    } else {
        // Hit something
        if (npc.velocity.y < 0) {
            // Hit ground - stop falling and set on ground
            npc.isOnGround = true;
        } else {
            // Hit ceiling - stop rising
            npc.isOnGround = false;
        }
        
        // Stop vertical movement
        npc.velocity.y = 0;
    }
    
    // Double-check ground status with ray cast
    groundCheckPos.copy(npc.position);
    groundCheckPos.y -= NPC_PHYSICS.GROUND_CHECK_DISTANCE;
    
    // If there's no collision with ground check, NPC is not on ground
    if (!checkNPCCollision(groundCheckPos, scene).collides) {
        npc.isOnGround = false;
    }
    
    return npc.isOnGround;
}

/**
 * Make the NPC jump
 */
export function makeNPCJump(npc) {
    if (npc.isOnGround) {
        npc.velocity.y = NPC_PHYSICS.JUMP_SPEED;
        npc.isOnGround = false;
        return true;
    }
    return false;
}

/**
 * Move NPC in the given direction, handling collisions
 */
export function moveNPC(npc, direction, speed, scene, deltaTime = 1) {
    // Calculate movement vector
    moveVector.copy(direction).normalize().multiplyScalar(speed * deltaTime * 60);
    
    // Ensure Y component is 0 for horizontal movement
    moveVector.y = 0;
    
    // Store original position
    const originalPosition = npc.position.clone();
    
    // Try X movement
    newPosition.copy(originalPosition);
    newPosition.x += moveVector.x;
    let xCollision = checkNPCCollision(newPosition, scene);
    
    // If no collision, apply X movement
    if (!xCollision.collides) {
        npc.position.x = newPosition.x;
    }
    
    // Try Z movement
    newPosition.copy(npc.position);
    newPosition.z += moveVector.z;
    let zCollision = checkNPCCollision(newPosition, scene);
    
    // If no collision, apply Z movement
    if (!zCollision.collides) {
        npc.position.z = newPosition.z;
    }
    
    // Calculate if there was any movement
    const hasMoved = !npc.position.equals(originalPosition);
    
    return {
        hasMoved,
        xBlocked: xCollision.collides,
        zBlocked: zCollision.collides
    };
}

/**
 * Check if the NPC's position would collide with any blocks
 */
export function checkNPCCollision(position, scene) {
    // Create a box for collision checking
    const npcBox = new THREE.Box3().setFromCenterAndSize(
        position,
        new THREE.Vector3(
            NPC_PHYSICS.COLLISION_WIDTH,
            NPC_PHYSICS.COLLISION_HEIGHT,
            NPC_PHYSICS.COLLISION_WIDTH
        )
    );
    
    // Get bounds to check
    const minX = Math.floor(npcBox.min.x);
    const maxX = Math.ceil(npcBox.max.x);
    const minY = Math.floor(npcBox.min.y);
    const maxY = Math.ceil(npcBox.max.y);
    const minZ = Math.floor(npcBox.min.z);
    const maxZ = Math.ceil(npcBox.max.z);
    
    // Check each block in bounds
    for (let x = minX; x < maxX; x++) {
        for (let y = minY; y < maxY; y++) {
            for (let z = minZ; z < maxZ; z++) {
                // Get block type at position
                let blockType;
                try {
                    blockType = GameState.getBlockType(x, y, z);
                } catch (e) {
                    // Block might be outside loaded chunks
                    continue;
                }
                
                // Skip non-solid blocks (air, water, etc.)
                if (blockType <= 0 || blockType === 8 || blockType === 9) {
                    continue;
                }
                
                // Create block box
                const blockBox = new THREE.Box3().setFromCenterAndSize(
                    new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
                    new THREE.Vector3(1, 1, 1)
                );
                
                // Check if NPC box intersects block box
                if (npcBox.intersectsBox(blockBox)) {
                    return {
                        collides: true,
                        blockType: blockType,
                        blockPosition: { x, y, z }
                    };
                }
            }
        }
    }
    
    // No collision
    return { collides: false };
}

/**
 * Reset NPC physics state (useful when repositioning NPCs)
 */
export function resetNPCPhysics(npc) {
    npc.velocity = { x: 0, y: 0, z: 0 };
    npc.isOnGround = false;
}

/**
 * Check if NPC is stuck (useful for recovery)
 */
export function isNPCStuck(npc) {
    return (
        !npc.isOnGround && 
        Math.abs(npc.velocity.y) < 0.001 &&
        (npc.position.y < 0 || npc.position.y > 100)
    );
}

// Export all functions
export default {
    NPC_PHYSICS,
    applyNPCGravity,
    makeNPCJump,
    moveNPC,
    checkNPCCollision,
    resetNPCPhysics,
    isNPCStuck
};