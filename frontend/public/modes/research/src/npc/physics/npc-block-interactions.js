// npc-block-interactions.js
// Dedicated block interaction system for NPCs

import * as GameState from '../../../../../src/core/game-state.js';
import { NPC_PHYSICS } from '../physics/npc-physics.js';

export class NPCBlockInteractions {
    constructor() {
        this.raycaster = null; // We're not using the raycaster anymore
        this.maxReachDistance = 20; // NPCs have shorter reach than players
        this.blockTypes = [1, 2, 3, 4]; // Available block types for NPCs to place
        
        // NPC block interaction behaviors
        this.behaviors = {
            IDLE: 0,        // Do nothing with blocks
            GATHERING: 1,   // Remove blocks
            BUILDING: 2,    // Place blocks
            MIMIC: 3        // Copy what player is doing
        };
        
        // Settings - UPDATED for more frequent and visible interactions
        this.settings = {
            blockInteractionChance: 1,    // Significantly increased chance (5% per update)
            blockRemovalChance: 1,         // Heavily favor block removal for testing (80%)
            maxBlocksPerSession: 100000,         // More blocks per session
            cooldownAfterSession: 1,      // Shorter cooldown (3 seconds)
            
            // New visual settings
            enableDebugVisuals: true,        // Enable visual debugging
            showBlockEffects: true,          // Show block removal/placement effects
            effectDuration: 1000              // How long effects stay visible (ms)
        };
        
        // Initialize debug stats
        this.stats = {
            totalBlocksRemoved: 0,
            totalBlocksPlaced: 0,
            failedRemovals: 0,
            failedPlacements: 0
        };
        
        console.log("Initialized NPCBlockInteractions with enhanced settings");
    }

    /**
     * Initialize an NPC with block interaction capabilities
     * @param {Object} npc - The NPC object to initialize
     */

    enableAggressiveBlockInteractions() {
        // Update settings to be even more aggressive
        this.settings.blockInteractionChance = 0.1;    // 10% chance per update
        this.settings.blockRemovalChance = 0.9;        // 90% chance to remove vs place
        this.settings.maxBlocksPerSession = 30;        // Allow more blocks per session
        this.settings.cooldownAfterSession = 1000;     // Very short cooldown
        
        // Force any NPCs in cooldown to start interacting again
        const now = Date.now();
        const npcs = GameState.npcSystem?.npcs || [];
        
        for (const npc of npcs) {
            if (npc.blockInteraction) {
                // Clear cooldown
                npc.blockInteraction.cooldownUntil = 0;
                
                // If not currently interacting, force into gathering mode
                if (!npc.blockInteraction.currentlyInteracting) {
                    this.startBlockInteraction(npc);
                    // Override with gathering behavior
                    npc.blockInteraction.behavior = this.behaviors.GATHERING;
                }
            }
        }
        
        console.log(`Enabled aggressive block interactions for ${npcs.length} NPCs`);
    }

    initializeNPC(npc) {
        // Add block interaction properties to NPC
        npc.blockInteraction = {
            behavior: this.behaviors.IDLE,
            currentlyInteracting: false,
            blockCount: 0,               // Blocks placed/removed in current session
            lastInteractionTime: 0,      // Time of last interaction
            cooldownUntil: 0,            // Time when NPC can interact again
            blockInventory: this.generateRandomInventory(),
            targetBlock: null,           // Current block target
            buildingPattern: null        // Optional building pattern
        };
        
        return npc;
    }
    
    /**
     * Generate a random inventory for NPCs
     */
    generateRandomInventory() {
        // Create a simple inventory with random blocks and counts
        const inventory = {};
        
        // Give NPCs 2-4 random block types
        const numBlockTypes = 2 + Math.floor(Math.random() * 3);
        
        for (let i = 0; i < numBlockTypes; i++) {
            const blockType = this.blockTypes[Math.floor(Math.random() * this.blockTypes.length)];
            const count = 5 + Math.floor(Math.random() * 20); // 5-24 blocks
            
            inventory[blockType] = (inventory[blockType] || 0) + count;
        }
        
        return inventory;
    }
    
    /**
     * Update NPC block interactions
     * @param {Object} npc - The NPC object
     * @param {Object} scene - The scene object
     * @param {Number} deltaTime - Time since last update
     */
    update(npc, scene, deltaTime) {
        // Skip if NPC doesn't have block interaction properties
        if (!npc.blockInteraction) {
            this.initializeNPC(npc);
            return;
        }
        
        // Skip if NPC is on cooldown
        const now = Date.now();
        if (now < npc.blockInteraction.cooldownUntil) {
            return;
        }
        
        // If NPC is not currently interacting, check if it should start
        if (!npc.blockInteraction.currentlyInteracting) {
            // Random chance to start interacting with blocks
            if (Math.random() < this.settings.blockInteractionChance * deltaTime) {
                this.startBlockInteraction(npc);
            }
            return;
        }
        
        // If NPC has reached max blocks for this session, stop
        if (npc.blockInteraction.blockCount >= this.settings.maxBlocksPerSession) {
            this.stopBlockInteraction(npc);
            return;
        }
        
        // Find a block to interact with if no target
        if (!npc.blockInteraction.targetBlock) {
            this.findTargetBlock(npc, scene);
            return;
        }
        
        // SAFELY Look at target block (gradually rotate NPC)
        if (npc.blockInteraction.targetBlock) {
            this.lookAtTarget(npc, npc.blockInteraction.targetBlock);
        }
        
        // Check if NPC is facing target and in range
        if (npc.blockInteraction.targetBlock && this.isTargetInReachAndView(npc, npc.blockInteraction.targetBlock)) {
            // Interact with the target block
            let success = false;
            try {
                if (npc.blockInteraction.behavior === this.behaviors.GATHERING) {
                    success = this.removeBlock(npc, npc.blockInteraction.targetBlock);
                } else if (npc.blockInteraction.behavior === this.behaviors.BUILDING) {
                    success = this.placeBlock(npc, npc.blockInteraction.targetBlock);
                }
            } catch (e) {
                console.error(`Error during block interaction:`, e);
            }
            
            // Clear target after interaction
            npc.blockInteraction.targetBlock = null;
            if (success) {
                npc.blockInteraction.blockCount++;
                npc.blockInteraction.lastInteractionTime = now;
            }
        }
    }
    
    /**
     * Start a block interaction session for an NPC
     * @param {Object} npc - The NPC object
     */
    startBlockInteraction(npc) {
        // Determine behavior: building or gathering
        if (Math.random() < this.settings.blockRemovalChance) {
            npc.blockInteraction.behavior = this.behaviors.GATHERING;
        } else {
            npc.blockInteraction.behavior = this.behaviors.BUILDING;
        }
        
        npc.blockInteraction.currentlyInteracting = true;
        npc.blockInteraction.blockCount = 0;
        npc.blockInteraction.targetBlock = null;
        
        
        console.log(`NPC ${npc.userData.id} started ${npc.blockInteraction.behavior === this.behaviors.GATHERING ? 'gathering' : 'building'}`);
    }
    
    /**
     * Stop a block interaction session for an NPC
     * @param {Object} npc - The NPC object
     */
    stopBlockInteraction(npc) {
        npc.blockInteraction.currentlyInteracting = false;
        npc.blockInteraction.targetBlock = null;
        
        // Set cooldown until next session
        npc.blockInteraction.cooldownUntil = Date.now() + this.settings.cooldownAfterSession;
        
        // Restore normal movement speed
        npc.moveSpeed = npc.savedMoveSpeed || NPC_PHYSICS.WALK_SPEED;
        
        console.log(`NPC ${npc.userData.id} stopped block interaction (placed/removed ${npc.blockInteraction.blockCount} blocks)`);
    }
    
    /**
     * Find a suitable target block for the NPC to interact with
     * @param {Object} npc - The NPC object
     * @param {Object} scene - The scene object
     */
    findTargetBlock(npc, scene) {
        // For gathering, look for blocks to remove
        if (npc.blockInteraction.behavior === this.behaviors.GATHERING) {
            this.findBlockToRemove(npc, scene);
        } 
        // For building, find a place to add blocks
        else if (npc.blockInteraction.behavior === this.behaviors.BUILDING) {
            this.findPlaceToBuild(npc, scene);
        }
    }
    
    /**
     * Find a block for the NPC to remove
     * @param {Object} npc - The NPC object
     * @param {Object} scene - The scene object
     */
    findBlockToRemove(npc, scene) {
        console.log(`NPC ${npc.userData.id} looking for blocks to remove...`);
        
        // SKIP ALL RAYCASTING - directly check blocks around NPC
        const searchRadius = 3; // Blocks
        const npcPosX = Math.floor(npc.position.x);
        const npcPosY = Math.floor(npc.position.y);
        const npcPosZ = Math.floor(npc.position.z);
        
        // Search nearby blocks in 3D space
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -1; dy <= 3; dy++) { // More limited vertical range, focused around NPC's height
                for (let dz = -searchRadius; dz <= searchRadius; dz++) {
                    const x = npcPosX + dx;
                    const y = npcPosY + dy;
                    const z = npcPosZ + dz;
                    
                    try {
                        const blockType = GameState.getBlockType(x, y, z);
                        
                        // If we found a non-air block
                        if (blockType > 0) {
                            console.log(`NPC ${npc.userData.id} found block nearby:`, {x, y, z, type: blockType});
                            
                            // Calculate direction to this block
                            const dirX = x - npc.position.x;
                            const dirY = y - npc.position.y;
                            const dirZ = z - npc.position.z;
                            const length = Math.sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ);
                            
                            // Create a target object
                            npc.blockInteraction.targetBlock = {
                                position: new THREE.Vector3(x, y, z),
                                normal: new THREE.Vector3(dirX/length, dirY/length, dirZ/length).negate(),
                                blockType: blockType
                            };
                            return true;
                        }
                    } catch (e) {
                        // Skip if block is outside loaded chunks
                        continue;
                    }
                }
            }
        }
        
        console.log(`NPC ${npc.userData.id} found no blocks to remove.`);
        return false;
    }
    
    /**
     * Find a place for the NPC to build
     * @param {Object} npc - The NPC object
     * @param {Object} scene - The scene object
     */
    findPlaceToBuild(npc, scene) {
        console.log(`NPC ${npc.userData.id} looking for a place to build...`);
        
        // Skip raycasting entirely - directly check for valid places to build
        const searchRadius = 3; // Blocks
        const npcPosX = Math.floor(npc.position.x);
        const npcPosY = Math.floor(npc.position.y);
        const npcPosZ = Math.floor(npc.position.z);
        
        // Check for empty spaces next to solid blocks
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -1; dy <= 3; dy++) { // From feet to slightly above head
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
                            if (this.isValidPlacementPosition(new THREE.Vector3(x, y, z), npc, scene)) {
                                // Get a block type to place
                                const blockTypeToPlace = this.getBlockTypeToPlace(npc);
                                
                                if (blockTypeToPlace) {
                                    // Create normal direction based on adjacent block
                                    const normal = new THREE.Vector3(0, -1, 0); // Default to bottom face
                                    
                                    npc.blockInteraction.targetBlock = {
                                        position: new THREE.Vector3(x, y, z),
                                        normal: normal,
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
    
    /**
     * Cast a ray from NPC in their current facing direction
     * @param {Object} npc - The NPC object
     * @param {Object} scene - The scene object
     */
    castNPCRay(npc, scene) {
        // Try using GameState's raycaster if available - SAFER OPTION
        if (GameState.blockManager && GameState.blockManager.castRay) {
            try {
                // Save the original camera
                const originalCamera = GameState.camera;
                
                // Temporarily set camera to NPC position/direction
                const tempCamera = {
                    position: new THREE.Vector3(
                        npc.position.x,
                        npc.position.y + 1.6, // Eye level
                        npc.position.z
                    ),
                    getWorldDirection: function(target) {
                        target.set(
                            -Math.sin(npc.yaw),
                            0,
                            -Math.cos(npc.yaw)
                        );
                        return target;
                    }
                };
                
                // Temporarily replace camera
                GameState.camera = tempCamera;
                
                // Use the block manager's ray casting which should be safer
                const result = GameState.blockManager.castRay();
                
                // Restore original camera
                GameState.camera = originalCamera;
                
                return result;
            } catch (e) {
                console.warn(`Error in safe NPC raycast:`, e);
            }
        }
        
        // Don't fall back to Three.js raycaster as it's causing errors
        return null;
    }

    /**
     * Check if a position has any adjacent solid blocks
     * @param {Number} x - X coordinate
     * @param {Number} y - Y coordinate
     * @param {Number} z - Z coordinate
     * @returns {Boolean} - Whether there are adjacent blocks
     */
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
    
    /**
     * Check if a position is valid for block placement
     * @param {THREE.Vector3} position - The position to check
     * @param {Object} npc - The NPC object
     * @param {Object} scene - The scene object
     */
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
    
    /**
     * Get a block type from NPC's inventory to place
     * @param {Object} npc - The NPC object
     */
    getBlockTypeToPlace(npc) {
        // Get available block types with count > 0
        const availableTypes = Object.entries(npc.blockInteraction.blockInventory)
            .filter(([type, count]) => count > 0)
            .map(([type]) => parseInt(type));
        
        if (availableTypes.length === 0) {
            return null;
        }
        
        // Choose a random available block type
        return availableTypes[Math.floor(Math.random() * availableTypes.length)];
    }
    
    /**
     * Check if target is in reach and within view angle of NPC
     * @param {Object} npc - The NPC object
     * @param {Object} target - The target block
     */
    isTargetInReachAndView(npc, target) {
        if (!target) return false;
        
        // Calculate distance to target
        const distanceX = target.position.x - npc.position.x;
        const distanceY = target.position.y - npc.position.y;
        const distanceZ = target.position.z - npc.position.z;
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
    
    /**
     * Gradually rotate NPC to look at target
     * @param {Object} npc - The NPC object
     * @param {Object} target - The target block
     */
    lookAtTarget(npc, target) {
        if (!target) return;
        
        // Calculate direction to target
        const dx = target.position.x - npc.position.x;
        const dz = target.position.z - npc.position.z;
        
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
    
    /**
     * Remove a block from the world
     * @param {Object} npc - The NPC object
     * @param {Object} target - The target block
     */
    removeBlock(npc, target) {
        if (!target) return false;
        
        // Get block position
        const x = Math.floor(target.position.x);
        const y = Math.floor(target.position.y);
        const z = Math.floor(target.position.z);
        
        console.log(`NPC ${npc.userData.id} attempting to remove block at: ${x}, ${y}, ${z}`);
        
        // Check if the block is still there
        let blockType;
        try {
            blockType = GameState.getBlockType(x, y, z);
            console.log(`Block type at ${x}, ${y}, ${z}: ${blockType}`);
        } catch (e) {
            console.warn(`Block might be outside loaded chunks: ${e.message}`);
            return false;
        }
        
        // If block exists and is not air
        if (blockType && blockType > 0) {
            // Add block to NPC inventory
            npc.blockInteraction.blockInventory[blockType] = 
                (npc.blockInteraction.blockInventory[blockType] || 0) + 1;
            
            console.log(`NPC ${npc.userData.id} removing block type ${blockType} at ${x}, ${y}, ${z}`);
            
            // Remove the block from the world
            try {
                this.updateBlock({x, y, z}, 0, true);
                
                // Enhanced effect for visibility
                this.addBlockEffect('remove', {x, y, z}, blockType);
                
                // Update inventory display
                console.log(`NPC ${npc.userData.id} inventory:`, npc.blockInteraction.blockInventory);
                
                return true;
            } catch (e) {
                console.error(`Error removing block: ${e.message}`);
                return false;
            }
        } else {
            console.log(`No valid block at ${x}, ${y}, ${z} (blockType: ${blockType})`);
            return false;
        }
    }
    
    /**
     * Place a block in the world
     * @param {Object} npc - The NPC object
     * @param {Object} target - The target position
     */
    placeBlock(npc, target) {
        if (!target || !target.blockType) return false;
        
        // Get block position
        const x = Math.floor(target.position.x);
        const y = Math.floor(target.position.y);
        const z = Math.floor(target.position.z);
        
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
            if (npc.blockInteraction.blockInventory[target.blockType] > 0) {
                // Remove from inventory
                npc.blockInteraction.blockInventory[target.blockType]--;
                
                // Place the block with clearer visuals
                try {
                    this.updateBlock({x, y, z}, target.blockType);
                    
                    // Enhanced effect for visibility
                    this.addBlockEffect('place', {x, y, z}, target.blockType);
                    
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
    
    /**
     * Update a block in the world (similar to BlockInteractionManager.updateBlock)
     * @param {Object} position - The position of the block
     * @param {Number} blockType - The new block type
     * @param {Boolean} isRemoval - Whether this is a removal operation
     */
    updateBlock(position, blockType, isRemoval = false) {
        const x = Math.floor(position.x);
        const y = Math.floor(position.y);
        const z = Math.floor(position.z);

        // Update local chunk
        GameState.chunkManager?.updateBlock(x, y, z, blockType);

        // Notify server if online
        if (GameState.isOnline && GameState.socket?.connected) {
            GameState.socket.emit('blockUpdate', {
                position: { x, y, z },
                type: isRemoval ? 'remove' : blockType
            });
        }
    }
    
    /**
     * Add visual effects for block interaction
     * @param {String} action - 'place' or 'remove'
     * @param {Object} position - The position
     * @param {Number} blockType - The block type
     */
    addBlockEffect(action, position, blockType) {
        // Create position vector
        const effectPosition = new THREE.Vector3(
            position.x + 0.5,
            position.y + 0.5,
            position.z + 0.5
        );
        
        // If the game has a particle system, use it
        if (GameState.particleSystem) {
            if (action === 'remove') {
                // Create break particles
                GameState.particleSystem.addBlockBreakEffect(
                    effectPosition,
                    blockType
                );
            }
        }
        
        // Add custom debugging effect
        if (GameState.scene) {
            // Create temporary visual effect
            const geometry = new THREE.SphereGeometry(0.5, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: action === 'remove' ? 0xFF0000 : 0x00FF00,
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
            }, 500);
        }
        
        // Display log message
        console.log(`Block ${action} at ${position.x}, ${position.y}, ${position.z} of type ${blockType}`);
    }
    

    // Add a helper function to increase success chances
    /**
     * Force all NPCs to remove blocks around player
     * Call this with a keyboard shortcut like 'R'
     */
    forceAllNPCsToRemoveBlocks() {
        const npcs = GameState.npcSystem.npcs;
        console.log(`Forcing ${npcs.length} NPCs to remove blocks`);
        
        for (const npc of npcs) {
            // Initialize if needed
            if (!npc.blockInteraction) {
                this.initializeNPC(npc);
            }
            
            // Set to gathering mode
            npc.blockInteraction.behavior = this.behaviors.GATHERING;
            npc.blockInteraction.currentlyInteracting = true;
            npc.blockInteraction.blockCount = 0;
            npc.blockInteraction.targetBlock = null;
            npc.blockInteraction.cooldownUntil = 0;
            
            // Slow down the NPC while gathering
            npc.savedMoveSpeed = npc.moveSpeed;
            npc.moveSpeed = NPC_PHYSICS.WALK_SPEED * 0.5;
        }
    }

    // Add a direct utility function that skips all the normal checks
    // and just removes a block at specified coordinates
    /**
     * Utility to directly remove a block
     * @param {Number} x - Block X coordinate
     * @param {Number} y - Block Y coordinate
     * @param {Number} z - Block Z coordinate
     * @returns {Boolean} - Whether removal was successful
     */
    removeBlockAtPosition(x, y, z) {
        try {
            // Check if there's a block to remove
            const blockType = GameState.getBlockType(x, y, z);
            
            if (blockType > 0) {
                console.log(`Directly removing block at ${x}, ${y}, ${z} of type ${blockType}`);
                
                // Remove the block
                this.updateBlock({x, y, z}, 0, true);
                
                // Add effect
                this.addBlockEffect('remove', {x, y, z}, blockType);
                
                return true;
            } else {
                console.log(`No block to remove at ${x}, ${y}, ${z} (type: ${blockType})`);
                return false;
            }
        } catch (e) {
            console.error(`Error removing block at ${x}, ${y}, ${z}:`, e);
            return false;
        }
    }
}

export default NPCBlockInteractions;