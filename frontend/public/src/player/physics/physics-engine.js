// physics-engine.js
import * as GameState from '../../core/game-state.js';

// Constants
export const PHYSICS_CONSTANTS = {
    JUMP_SPEED: 0.15,
    GRAVITY: 0.008,
    TERMINAL_VELOCITY: -3,
    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.6,
    WALK_SPEED: 0.0797,
    SPRINT_SPEED: 0.112,
    SNEAK_SPEED: 0.03,
    FLY_SPEED: 1.5,
};

// Reusable vectors and objects (used internally by the physics engine)
const moveVector = new THREE.Vector3();
const newPosition = new THREE.Vector3();
const groundCheck = new THREE.Vector3();
const playerBox = new THREE.Box3();
const blockBox = new THREE.Box3();
const blockPosition = new THREE.Vector3();

// Store entity-specific physics state
const entityPhysicsState = new Map();

// Initialize physics state for an entity
export function initializePhysicsState(entity) {
    entityPhysicsState.set(entity.uuid, {
        yVelocity: 0,
        isOnGround: false,
        lastPosition: entity.position.clone()
    });
    
    return entityPhysicsState.get(entity.uuid);
}

// Get physics state for an entity, initialize if not exists
export function getPhysicsState(entity) {
    if (!entityPhysicsState.has(entity.uuid)) {
        return initializePhysicsState(entity);
    }
    return entityPhysicsState.get(entity.uuid);
}

// Apply vertical physics (jumping and gravity)
export function applyVerticalPhysics(entity, controls, scene, deltaTime = 1) {
    const physicsState = getPhysicsState(entity);
    const { isOnGround } = physicsState;
    
    // Handle jumping
    if (controls.jump && isOnGround) {
        // Check for ceiling before jumping
        const headPosition = entity.position.clone();
        headPosition.y += PHYSICS_CONSTANTS.PLAYER_HEIGHT * 0.15; 
        
        // Calculate how much space we have above
        let clearSpace = 0;
        const maxJumpHeight = PHYSICS_CONSTANTS.JUMP_SPEED * 15;
        
        for (let h = 0.1; h <= maxJumpHeight; h += 0.1) {
            const checkPos = headPosition.clone();
            checkPos.y += h;
            
            if (checkCollision(checkPos, scene, entity).collides) {
                clearSpace = h;
                break;
            }
            
            if (h >= maxJumpHeight - 0.1) {
                clearSpace = maxJumpHeight;
            }
        }
        
        // Adjust jump velocity based on available space
        if (clearSpace < 0.2) {
            // Almost no space - prevent jump
            physicsState.yVelocity = 0;
        } else if (clearSpace < maxJumpHeight) {
            // Limited space - reduced jump
            physicsState.yVelocity = Math.min(
                PHYSICS_CONSTANTS.JUMP_SPEED,
                Math.sqrt(2 * PHYSICS_CONSTANTS.GRAVITY * clearSpace)
            );
        } else {
            // Plenty of space - normal jump
            physicsState.yVelocity = PHYSICS_CONSTANTS.JUMP_SPEED;
        }
        
        physicsState.isOnGround = false;
    }

    // Apply gravity with delta time
    const gravityForce = PHYSICS_CONSTANTS.GRAVITY * (deltaTime || 1);
    physicsState.yVelocity = Math.max(
        physicsState.yVelocity - gravityForce, 
        PHYSICS_CONSTANTS.TERMINAL_VELOCITY
    );
    
    // Apply vertical movement
    newPosition.copy(entity.position);
    newPosition.y += physicsState.yVelocity;

    // Check for collisions
    const collisionResult = checkCollision(newPosition, scene, entity);
    if (!collisionResult.collides || !entity.collisionsEnabled) {
        // No collision, move freely
        entity.position.y = newPosition.y;
    } else {
        if (physicsState.yVelocity < 0) {
            // Hit ground - stop falling
            physicsState.isOnGround = true;
        } else if (physicsState.yVelocity > 0) {
            // Hit ceiling - stop rising
            physicsState.yVelocity = 0;
        }
        physicsState.yVelocity = 0;
    }

    // Check if still on ground
    groundCheck.copy(entity.position);
    groundCheck.y -= 0.1;
    if (!checkCollision(groundCheck, scene, entity).collides) {
        physicsState.isOnGround = false;
    }
    
    return { isOnGround: physicsState.isOnGround };
}

// Check for collisions between entity and world
export function checkCollision(position, scene, entity) {
    if (!entity || !entity.collisionsEnabled) {
        return { collides: false, normal: new THREE.Vector3() };
    }

    // Use a slightly smaller collision box for better corner handling
    const collisionWidth = PHYSICS_CONSTANTS.PLAYER_WIDTH * 0.85;
    const collisionHeight = PHYSICS_CONSTANTS.PLAYER_HEIGHT * 0.95;
    
    playerBox.setFromCenterAndSize(
        position,
        new THREE.Vector3(collisionWidth, collisionHeight, collisionWidth)
    );

    // Calculate direction of movement
    const physicsState = getPhysicsState(entity);
    const movement = new THREE.Vector3().subVectors(position, physicsState.lastPosition);
    const movingPositiveX = movement.x >= 0;
    const movingPositiveY = movement.y >= 0;
    const movingPositiveZ = movement.z >= 0;
    
    // Get bounds
    const minX = Math.floor(playerBox.min.x);
    const maxX = Math.ceil(playerBox.max.x);
    const minY = Math.floor(playerBox.min.y);
    const maxY = Math.ceil(playerBox.max.y);
    const minZ = Math.floor(playerBox.min.z);
    const maxZ = Math.ceil(playerBox.max.z);
    
    // Optimize by only checking blocks in the direction of movement
    const xStart = movingPositiveX ? minX : maxX - 1;
    const xEnd = movingPositiveX ? maxX : minX - 1;
    const xStep = movingPositiveX ? 1 : -1;
    
    const yStart = movingPositiveY ? minY : maxY - 1;
    const yEnd = movingPositiveY ? maxY : minY - 1;
    const yStep = movingPositiveY ? 1 : -1;
    
    const zStart = movingPositiveZ ? minZ : maxZ - 1;
    const zEnd = movingPositiveZ ? maxZ : minZ - 1;
    const zStep = movingPositiveZ ? 1 : -1;

    // Cache block lookups
    const blockCache = {};
    const getBlockAtCached = (x, y, z) => {
        const key = `${x},${y},${z}`;
        if (blockCache[key] === undefined) {
            blockCache[key] = GameState.getBlockType(x, y, z);
        }
        return blockCache[key];
    };

    // Track closest collision
    let hasCollision = false;
    let minDistSq = Infinity;
    let closestNormal = new THREE.Vector3();
    let closestBlock = null;

    // Check for collisions
    for (let y = yStart; y !== yEnd + yStep; y += yStep) {
        for (let x = xStart; x !== xEnd + xStep; x += xStep) {
            for (let z = zStart; z !== zEnd + zStep; z += zStep) {
                const blockType = getBlockAtCached(x, y, z);
                
                // Skip non-solid blocks
                if (blockType <= 0) continue;
                
                blockBox.setFromCenterAndSize(
                    blockPosition.set(x + 0.5, y + 0.5, z + 0.5),
                    new THREE.Vector3(1, 1, 1)
                );

                if (playerBox.intersectsBox(blockBox)) {
                    hasCollision = true;
                    
                    // Find closest point to determine direction
                    const distSq = position.distanceToSquared(blockPosition);
                    
                    if (distSq < minDistSq) {
                        minDistSq = distSq;
                        closestBlock = { x, y, z };
                        
                        // Determine which face we hit
                        const dx = Math.abs(position.x - blockPosition.x);
                        const dy = Math.abs(position.y - blockPosition.y);
                        const dz = Math.abs(position.z - blockPosition.z);
                        
                        if (dx > dy && dx > dz) {
                            closestNormal.set(position.x > blockPosition.x ? 1 : -1, 0, 0);
                        } else if (dy > dx && dy > dz) {
                            closestNormal.set(0, position.y > blockPosition.y ? 1 : -1, 0);
                        } else {
                            closestNormal.set(0, 0, position.z > blockPosition.z ? 1 : -1);
                        }
                    }
                }
            }
        }
    }

    if (hasCollision) {
        return { 
            collides: true, 
            normal: closestNormal,
            collisionX: Math.abs(closestNormal.x) > 0.5,
            collisionY: Math.abs(closestNormal.y) > 0.5,
            collisionZ: Math.abs(closestNormal.z) > 0.5,
            collisionBlock: closestBlock
        };
    }

    return { collides: false, normal: new THREE.Vector3() };
}

// Handle horizontal movement with collision detection
export function handleMovement(entity, moveVector, scene) {
    const physicsState = getPhysicsState(entity);
    
    // Store last position
    physicsState.lastPosition.copy(entity.position);
    
    // Try direct movement first
    const originalPosition = entity.position.clone();
    newPosition.copy(originalPosition).add(moveVector);
    const directCollision = checkCollision(newPosition, scene, entity);
    
    // If no collision, move directly
    if (!directCollision.collides || !entity.collisionsEnabled) {
        entity.position.copy(newPosition);
        return { xBlocked: false, yBlocked: false, zBlocked: false };
    }
    
    // Try movement along each axis separately
    let newX = originalPosition.x + moveVector.x;
    let newY = originalPosition.y + moveVector.y;
    let newZ = originalPosition.z + moveVector.z;
    
    // Test X-axis
    newPosition.set(newX, originalPosition.y, originalPosition.z);
    const xCollision = checkCollision(newPosition, scene, entity);
    const xBlocked = xCollision.collides && entity.collisionsEnabled;
    if (xBlocked) {
        newX = originalPosition.x;
    }
    
    // Test Z-axis
    newPosition.set(originalPosition.x, originalPosition.y, newZ);
    const zCollision = checkCollision(newPosition, scene, entity);
    const zBlocked = zCollision.collides && entity.collisionsEnabled;
    if (zBlocked) {
        newZ = originalPosition.z;
    }
    
    // Test Y-axis
    newPosition.set(originalPosition.x, newY, originalPosition.z);
    const yCollision = checkCollision(newPosition, scene, entity);
    const yBlocked = yCollision.collides && entity.collisionsEnabled;
    if (yBlocked) {
        newY = originalPosition.y;
    }
    
    // Check if combined separated axes still cause a collision
    newPosition.set(newX, newY, newZ);
    const finalCollision = checkCollision(newPosition, scene, entity);
    
    if (finalCollision.collides && entity.collisionsEnabled) {
        // Corner case handling - prioritize horizontal movement
        if (!xBlocked && zBlocked) {
            newPosition.set(newX, newY, originalPosition.z);
            if (!checkCollision(newPosition, scene, entity).collides) {
                entity.position.copy(newPosition);
                return { xBlocked: false, yBlocked: yBlocked, zBlocked: true };
            }
        }
        
        if (xBlocked && !zBlocked) {
            newPosition.set(originalPosition.x, newY, newZ);
            if (!checkCollision(newPosition, scene, entity).collides) {
                entity.position.copy(newPosition);
                return { xBlocked: true, yBlocked: yBlocked, zBlocked: false };
            }
        }
        
        // If both are blocked, try prioritizing the one with more movement
        if (xBlocked && zBlocked) {
            if (Math.abs(moveVector.x) > Math.abs(moveVector.z)) {
                newPosition.set(newX, newY, originalPosition.z);
                if (!checkCollision(newPosition, scene, entity).collides) {
                    entity.position.copy(newPosition);
                    return { xBlocked: false, yBlocked: yBlocked, zBlocked: true };
                }
            } else {
                newPosition.set(originalPosition.x, newY, newZ);
                if (!checkCollision(newPosition, scene, entity).collides) {
                    entity.position.copy(newPosition);
                    return { xBlocked: true, yBlocked: yBlocked, zBlocked: false };
                }
            }
        }
        
        // Corner avoidance - nudge away from block center
        if (finalCollision.collisionBlock) {
            const blockCenter = new THREE.Vector3(
                finalCollision.collisionBlock.x + 0.5,
                finalCollision.collisionBlock.y + 0.5, 
                finalCollision.collisionBlock.z + 0.5
            );
            
            const awayVector = new THREE.Vector3(
                newPosition.x - blockCenter.x,
                0,
                newPosition.z - blockCenter.z
            ).normalize().multiplyScalar(0.1); // Small nudge
            
            newPosition.set(newX + awayVector.x, newY, newZ + awayVector.z);
            if (!checkCollision(newPosition, scene, entity).collides) {
                entity.position.copy(newPosition);
                return { xBlocked: false, yBlocked: yBlocked, zBlocked: false };
            }
        }
        
        // Last resort - use separated axes
        entity.position.set(newX, newY, newZ);
    } else {
        // No collision after separation
        entity.position.copy(newPosition);
    }
    
    return {
        xBlocked: xBlocked,
        yBlocked: yBlocked,
        zBlocked: zBlocked
    };
}

// Cleanup function to remove physics state when entity is removed
export function removePhysics(entity) {
    if (entity && entity.uuid && entityPhysicsState.has(entity.uuid)) {
        entityPhysicsState.delete(entity.uuid);
    }
}