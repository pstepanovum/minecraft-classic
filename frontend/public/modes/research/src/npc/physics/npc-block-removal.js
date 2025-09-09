// ==============================================================
// FILE: research/src/npc/physics/npc-block-removal.js
// ==============================================================

import * as GameState from '../../../../../src/core/game-state.js';
import { NPC_BEHAVIOR } from '../config-npc-behavior.js';

export class NPCBlockRemoval {
    constructor() {
        this.maxReachDistance = NPC_BEHAVIOR.BLOCK_REMOVAL.maxReachDistance || 4; 

        // Settings
        this.settings = {
            blockInteractionChance: NPC_BEHAVIOR.BLOCK_REMOVAL.interactionChance,
            maxBlocksPerSession: NPC_BEHAVIOR.BLOCK_REMOVAL.maxBlocksPerSession,
            cooldownAfterSession: NPC_BEHAVIOR.BLOCK_REMOVAL.cooldownAfterSession,
            showBlockEffects: NPC_BEHAVIOR.VISUALS.showBlockEffects,
        };

        console.log("Initialized NPCBlockRemoval system with settings:", this.settings);
    }

    initializeNPC(npc) {
        // Add block interaction properties to NPC
        npc.blockInteraction = {
            currentlyInteracting: false,
            blockCount: 0,               // Blocks removed in current session
            lastInteractionTime: 0,      // Time of last interaction
            cooldownUntil: 0,            // Time when NPC can interact again
            targetBlock: null,           // Current block target
        };

        return npc;
    }

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
            this.findBlockToRemove(npc, scene);
            return;
        }

        // Look at target block (gradually rotate NPC)
        if (npc.blockInteraction.targetBlock) {
            this.lookAtTarget(npc, npc.blockInteraction.targetBlock);
        }

        // Check if NPC is facing target and in range
        if (npc.blockInteraction.targetBlock && this.isTargetInReachAndView(npc, npc.blockInteraction.targetBlock)) {
            // Remove the target block
            let success = false;
            try {
                success = this.removeBlock(npc, npc.blockInteraction.targetBlock);
            } catch (e) {
                console.error(`Error during block removal:`, e);
            }

            // Clear target after interaction
            npc.blockInteraction.targetBlock = null;
            if (success) {
                npc.blockInteraction.blockCount++;
                npc.blockInteraction.lastInteractionTime = now;
            }
        }
    }

    startBlockInteraction(npc) {
        npc.blockInteraction.currentlyInteracting = true;
        npc.blockInteraction.blockCount = 0;
        npc.blockInteraction.targetBlock = null;

        console.log(`NPC ${npc.userData.id} started looking for blocks to remove`);
    }

    stopBlockInteraction(npc) {
        npc.blockInteraction.currentlyInteracting = false;
        npc.blockInteraction.targetBlock = null;

        // Set cooldown until next session
        npc.blockInteraction.cooldownUntil = Date.now() + this.settings.cooldownAfterSession;

        console.log(`NPC ${npc.userData.id} stopped block interaction (removed ${npc.blockInteraction.blockCount} blocks)`);
    }

    findBlockToRemove(npc, scene) {
        console.log(`NPC ${npc.userData.id} looking for blocks to remove...`);

        // Check blocks around NPC
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
                            console.log(`NPC ${npc.userData.id} found block nearby:`, { x, y, z, type: blockType });

                            // Calculate direction to this block
                            const dirX = x - npc.position.x;
                            const dirY = y - npc.position.y;
                            const dirZ = z - npc.position.z;
                            const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

                            // Create a target object
                            npc.blockInteraction.targetBlock = {
                                position: new THREE.Vector3(x, y, z),
                                normal: new THREE.Vector3(dirX / length, dirY / length, dirZ / length).negate()
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
            console.log(`NPC ${npc.userData.id} removing block type ${blockType} at ${x}, ${y}, ${z}`);

            // Remove the block from the world
            try {
                this.updateBlock({ x, y, z }, 0, true);

                // Add visual effect if enabled
                if (this.settings.showBlockEffects) {
                    this.addBlockEffect({ x, y, z }, blockType);
                }

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

    addBlockEffect(position, blockType) {
        // Create position vector
        const effectPosition = new THREE.Vector3(
            position.x + 0.5,
            position.y + 0.5,
            position.z + 0.5
        );

        // If the game has a particle system, use it
        if (GameState.particleSystem) {
            GameState.particleSystem.addBlockBreakEffect(
                effectPosition,
                blockType
            );
        }

        // Add simple visual indicator
        if (GameState.scene) {
            // Create temporary visual effect
            const geometry = new THREE.SphereGeometry(0.5, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: 0xFF0000,
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

        console.log(`Block removed at ${position.x}, ${position.y}, ${position.z} of type ${blockType}`);
    }
}

export default NPCBlockRemoval;