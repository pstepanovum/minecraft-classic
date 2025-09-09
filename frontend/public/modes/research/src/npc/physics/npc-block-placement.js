// ==============================================================
// FILE: research/src/npc/physics/npc-block-placement.js
// ==============================================================

import * as GameState from '../../../../../src/core/game-state.js';
import { NPC_PHYSICS } from './npc-physics.js';
import { NPC_BEHAVIOR } from '../config-npc-behavior.js';

export class NPCBlockPlacement {
    constructor() {
        this.maxReachDistance = NPC_BEHAVIOR.BLOCK_PLACEMENT.maxReachDistance || 4;
        this.blockTypes = NPC_BEHAVIOR.BLOCK_PLACEMENT.availableBlockTypes || [1, 2, 3, 4];
        
        // Settings
        this.settings = {
            blockInteractionChance: NPC_BEHAVIOR.BLOCK_PLACEMENT.interactionChance,
            maxBlocksPerSession: NPC_BEHAVIOR.BLOCK_PLACEMENT.maxBlocksPerSession,
            cooldownAfterSession: NPC_BEHAVIOR.BLOCK_PLACEMENT.cooldownAfterSession,
            showBlockEffects: NPC_BEHAVIOR.VISUALS.showBlockEffects,
        };
        
        console.log("Initialized NPCBlockPlacement system with settings:", this.settings);
    }

    initializeNPC(npc) {
        // Add block placement properties to NPC
        npc.blockPlacement = {
            currentlyPlacing: false,
            blockCount: 0,                 // Blocks placed in current session
            lastInteractionTime: 0,        // Time of last interaction
            cooldownUntil: 0,              // Time when NPC can interact again
            targetPosition: null,          // Current placement target
            blockInventory: this.generateRandomInventory()
        };
        
        return npc;
    }
    
    generateRandomInventory() {
        // Create a simple inventory with random blocks and counts
        const inventory = {};
        
        // Give NPCs 2-3 random block types
        const numBlockTypes = 2 + Math.floor(Math.random() * 2);
        
        for (let i = 0; i < numBlockTypes; i++) {
            const blockType = this.blockTypes[Math.floor(Math.random() * this.blockTypes.length)];
            const count = 3 + Math.floor(Math.random() * 8); // 3-10 blocks
            
            inventory[blockType] = (inventory[blockType] || 0) + count;
        }
        
        return inventory;
    }
    
    update(npc, scene, deltaTime) {
        // Skip if NPC doesn't have block placement properties
        if (!npc.blockPlacement) {
            this.initializeNPC(npc);
            return;
        }
        
        // Skip if NPC is on cooldown
        const now = Date.now();
        if (now < npc.blockPlacement.cooldownUntil) {
            return;
        }
        
        // If NPC is not currently placing blocks, check if it should start
        if (!npc.blockPlacement.currentlyPlacing) {
            // Random chance to start placing blocks
            if (Math.random() < this.settings.blockInteractionChance * deltaTime) {
                this.startBlockPlacement(npc);
            }
            return;
        }
        
        // If NPC has reached max blocks for this session, stop
        if (npc.blockPlacement.blockCount >= this.settings.maxBlocksPerSession) {
            this.stopBlockPlacement(npc);
            return;
        }
        
        // Find a place to put a block if no target
        if (!npc.blockPlacement.targetPosition) {
            this.findPlaceToBuild(npc, scene);
            return;
        }
        
        // Look at target position (gradually rotate NPC)
        if (npc.blockPlacement.targetPosition) {
            this.lookAtTarget(npc, npc.blockPlacement.targetPosition);
        }
        
        // Check if NPC is facing target and in range
        if (npc.blockPlacement.targetPosition && this.isTargetInReachAndView(npc, npc.blockPlacement.targetPosition)) {
            // Place a block at the target position
            let success = false;
            try {
                success = this.placeBlock(npc, npc.blockPlacement.targetPosition);
            } catch (e) {
                console.error(`Error during block placement:`, e);
            }
            
            // Clear target after interaction
            npc.blockPlacement.targetPosition = null;
            if (success) {
                npc.blockPlacement.blockCount++;
                npc.blockPlacement.lastInteractionTime = now;
            }
        }
    }
    
    startBlockPlacement(npc) {
        npc.blockPlacement.currentlyPlacing = true;
        npc.blockPlacement.blockCount = 0;
        npc.blockPlacement.targetPosition = null;
        
        console.log(`NPC ${npc.userData.id} started looking for places to build`);
    }
    
    stopBlockPlacement(npc) {
        npc.blockPlacement.currentlyPlacing = false;
        npc.blockPlacement.targetPosition = null;
        
        // Set cooldown until next session
        npc.blockPlacement.cooldownUntil = Date.now() + this.settings.cooldownAfterSession;
        
        console.log(`NPC ${npc.userData.id} stopped building (placed ${npc.blockPlacement.blockCount} blocks)`);
    }
    
    findPlaceToBuild(npc, scene) {
        console.log(`NPC ${npc.userData.id} looking for a place to build...`);
        
        // Check areas around NPC
        const searchRadius = 3; // Blocks
        const npcPosX = Math.floor(npc.position.x);
        const npcPosY = Math.floor(npc.position.y);
        const npcPosZ = Math.floor(npc.position.z);
        
        // Check for empty spaces next to solid blocks
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -1; dy <= 2; dy++) { // From feet to above head
                for (let dz = -searchRadius; dz <= searchRadius; dz++) {
                    const x = npcPosX + dx;
                    const y = npcPosY + dy;
                    const z = npcPosZ + dz;
                    
                    try {
                        // Check if this position is air
                        const blockType = GameState.getBlockType(x, y, z);
                        if (blockType !== 0) continue; // Skip if not air
                        
                        // Check if there's at least one solid block adjacent to this position
                        // This ensures we're building against something
                        const hasAdjacentBlock = this.checkForAdjacentBlocks(x, y, z);
                        
                        if (hasAdjacentBlock) {
                            // Make sure the position is valid for placement
                            if (this.isValidPlacementPosition({x, y, z}, npc, scene)) {
                                // Get a block type to place
                                const blockTypeToPlace = this.getBlockTypeToPlace(npc);
                                
                                if (blockTypeToPlace) {
                                    // Set target position with block type
                                    npc.blockPlacement.targetPosition = {
                                        x, y, z,
                                        blockType: blockTypeToPlace
                                    };
                                    
                                    console.log(`NPC ${npc.userData.id} found build location at ${x}, ${y}, ${z}`);
                                    return true;
                                }
                            }
                        }
                    } catch (e) {
                        // Skip if block is outside loaded chunks
                        continue;
                    }
                }
            }
        }
        
        console.log(`NPC ${npc.userData.id} found no suitable place to build`);
        return false;
    }

    checkForAdjacentBlocks(x, y, z) {
        // Check all 6 adjacent positions
        const positions = [
            {x: x+1, y: y, z: z},
            {x: x-1, y: y, z: z},
            {x: x, y: y+1, z: z},
            {x: x, y: y-1, z: z},
            {x: x, y: y, z: z+1},
            {x: x, y: y, z: z-1}
        ];
        
        for (const pos of positions) {
            try {
                const blockType = GameState.getBlockType(pos.x, pos.y, pos.z);
                if (blockType > 0) {
                    return true; // Found adjacent block
                }
            } catch (e) {
                // Skip if block is outside loaded chunks
                continue;
            }
        }
        
        return false;
    }
    
    isValidPlacementPosition(position, npc, scene) {
        // Check if position is empty (air block)
        let blockType;
        try {
            blockType = GameState.getBlockType(
                Math.floor(position.x),
                Math.floor(position.y),
                Math.floor(position.z)
            );
        } catch (e) {
            // Block might be outside loaded chunks
            return false;
        }
        
        // Position must contain air (block type 0)
        if (blockType !== 0) {
            return false;
        }
        
        // Check if block would intersect with the NPC
        const blockBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(
                Math.floor(position.x) + 0.5,
                Math.floor(position.y) + 0.5,
                Math.floor(position.z) + 0.5
            ),
            new THREE.Vector3(1, 1, 1)
        );
        
        const npcBox = new THREE.Box3().setFromCenterAndSize(
            npc.position,
            new THREE.Vector3(
                NPC_PHYSICS.COLLISION_WIDTH,
                NPC_PHYSICS.COLLISION_HEIGHT,
                NPC_PHYSICS.COLLISION_WIDTH
            )
        );
        
        // Make sure block doesn't intersect with NPC
        if (npcBox.intersectsBox(blockBox)) {
            return false;
        }
        
        return true;
    }
    
    getBlockTypeToPlace(npc) {
        // Get available block types with count > 0
        const availableTypes = Object.entries(npc.blockPlacement.blockInventory)
            .filter(([type, count]) => count > 0)
            .map(([type]) => parseInt(type));
        
        if (availableTypes.length === 0) {
            return null;
        }
        
        // Choose a random available block type
        return availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }
    
    isTargetInReachAndView(npc, target) {
        if (!target) return false;
        
        // Calculate distance to target
        const distanceX = target.x - npc.position.x;
        const distanceY = target.y - npc.position.y;
        const distanceZ = target.z - npc.position.z;
        const distance = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
        
        // Check if target is too far away
        if (distance > this.maxReachDistance) {
            return false;
        }
        
        // Calculate angle between NPC direction and target
        const targetDirection = new THREE.Vector3(
            distanceX,
            0,
            distanceZ
        ).normalize();
        
        const npcDirection = new THREE.Vector3(
            -Math.sin(npc.yaw),
            0,
            -Math.cos(npc.yaw)
        ).normalize();
        
        const dotProduct = npcDirection.dot(targetDirection);
        
        // Check if target is in front of NPC (within ~60 degree cone)
        return dotProduct > 0.5;
    }
    
    lookAtTarget(npc, target) {
        if (!target) return;
        
        // Calculate direction to target
        const dx = target.x - npc.position.x;
        const dz = target.z - npc.position.z;
        
        // Calculate target rotation
        const targetYaw = Math.atan2(-dx, -dz);
        
        // Get current rotation
        let currentYaw = npc.yaw;
        
        // Normalize angles
        while (currentYaw < -Math.PI) currentYaw += Math.PI * 2;
        while (currentYaw > Math.PI) currentYaw -= Math.PI * 2;
        
        // Calculate difference
        let diff = targetYaw - currentYaw;
        
        // Normalize difference
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        // Gradually rotate towards target (limit rotation speed)
        const rotationSpeed = 0.1;
        if (Math.abs(diff) > rotationSpeed) {
            npc.yaw += Math.sign(diff) * rotationSpeed;
        } else {
            npc.yaw = targetYaw;
        }
    }
    
    placeBlock(npc, target) {
        if (!target || !target.blockType) return false;
        
        // Get block position
        const x = Math.floor(target.x);
        const y = Math.floor(target.y);
        const z = Math.floor(target.z);
        
        console.log(`NPC ${npc.userData.id} attempting to place block at: ${x}, ${y}, ${z}`);
        
        // Check if the position is still empty
        let currentBlockType;
        try {
            currentBlockType = GameState.getBlockType(x, y, z);
        } catch (e) {
            console.warn(`Block might be outside loaded chunks: ${e.message}`);
            return false;
        }
        
        // If position is empty (air)
        if (currentBlockType === 0) {
            // Check if NPC has this block type
            if (npc.blockPlacement.blockInventory[target.blockType] > 0) {
                // Remove from inventory
                npc.blockPlacement.blockInventory[target.blockType]--;
                
                // Place the block
                try {
                    this.updateBlock({x, y, z}, target.blockType);
                    
                    // Add visual effect if enabled
                    if (this.settings.showBlockEffects) {
                        this.addBlockEffect({x, y, z}, target.blockType);
                    }
                    
                    console.log(`NPC ${npc.userData.id} successfully placed block type ${target.blockType} at ${x}, ${y}, ${z}`);
                    return true;
                } catch (e) {
                    console.error(`Error placing block: ${e.message}`);
                    return false;
                }
            } else {
                console.log(`NPC ${npc.userData.id} doesn't have block type ${target.blockType} in inventory`);
            }
        } else {
            console.log(`Position ${x}, ${y}, ${z} already contains block type ${currentBlockType}`);
        }
        
        return false;
    }
    
    updateBlock(position, blockType) {
        const x = Math.floor(position.x);
        const y = Math.floor(position.y);
        const z = Math.floor(position.z);

        // Update local chunk
        GameState.chunkManager?.updateBlock(x, y, z, blockType);

        // Notify server if online
        if (GameState.isOnline && GameState.socket?.connected) {
            GameState.socket.emit('blockUpdate', {
                position: { x, y, z },
                type: blockType
            });
        }
    }
    
    addBlockEffect(position, blockType) {
        // Create position vector
        const effectPosition = new THREE.Vector3(
            position.x + 0.5,
            position.y + 0.5,
            position.z + 0.5
        );
        
        // If the game has a particle system, use it
        if (GameState.particleSystem) {
            // Use place block effect if available, otherwise use generic effect
            if (GameState.particleSystem.addBlockPlaceEffect) {
                GameState.particleSystem.addBlockPlaceEffect(
                    effectPosition,
                    blockType
                );
            }
        }
        
        // Add simple visual indicator
        if (GameState.scene) {
            // Create temporary visual effect
            const geometry = new THREE.SphereGeometry(0.5, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0x00FF00, // Green for placing
                transparent: true,
                opacity: 0.7
            });
            
            const effectMesh = new THREE.Mesh(geometry, material);
            effectMesh.position.copy(effectPosition);
            GameState.scene.add(effectMesh);
            
            // Remove after animation
            setTimeout(() => {
                GameState.scene.remove(effectMesh);
                effectMesh.geometry.dispose();
                effectMesh.material.dispose();
            }, NPC_BEHAVIOR.VISUALS.effectDuration || 500);
        }
        
        console.log(`Block placed at ${position.x}, ${position.y}, ${position.z} of type ${blockType}`);
    }
}

export default NPCBlockPlacement;