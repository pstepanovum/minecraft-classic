// npc-system-simplified.js
// A complete NPC system with block removal and placement integration

import { createPlayer } from '../../../../src/player/players.js';
import * as GameState from '../../../../src/core/game-state.js';
import { TRAINING_WORLD_CONFIG } from '../config-training-world.js';
import * as NPCPhysics from '../npc/physics/npc-physics.js';
import NPCBlockRemoval from './physics/npc-block-removal.js';
import NPCBlockPlacement from './physics/npc-block-placement.js';
import { NPC_BEHAVIOR } from './config-npc-behavior.js';

// Use constants from dedicated NPC physics
const { NPC_PHYSICS } = NPCPhysics;

class NPCSystem {
    constructor(scene) {
        this.scene = scene;
        this.npcs = [];
        this.npcCount = 0;
        this.active = false;

        // Core settings from central config
        this.settings = {
            moveSpeed: NPC_BEHAVIOR.PHYSICS.WALK_SPEED,
            maxNPCs: NPC_BEHAVIOR.MOVEMENT.maxNPCs,
            spawnDistance: { 
                min: NPC_BEHAVIOR.MOVEMENT.spawnDistanceMin, 
                max: NPC_BEHAVIOR.MOVEMENT.spawnDistanceMax 
            },
            directionChangeTime: { 
                min: NPC_BEHAVIOR.MOVEMENT.directionChangeTimeMin, 
                max: NPC_BEHAVIOR.MOVEMENT.directionChangeTimeMax 
            },
            jumpChance: NPC_BEHAVIOR.MOVEMENT.jumpChance || 0.02
        };

        // Available NPC skins
        this.skins = [
            '../../../assets/images/skins/1.png',
            '../../../assets/images/skins/2.png',
            '../../../assets/images/skins/4.png'
        ];

        // Animation and timing variables
        this.lastUpdate = Date.now();
        
        // Initialize block interaction systems
        this.blockRemovalSystem = new NPCBlockRemoval();
        this.blockPlacementSystem = new NPCBlockPlacement();

        console.log('Complete NPC System created with block removal and placement capabilities');
    }

    initialize() {
        console.log('Initializing NPC system...');
        console.log('NPC system initialized');
        return this;
    }

    generateNPCs(count = 1) {
        // Limit to maximum allowed
        const spawnCount = Math.min(count, this.settings.maxNPCs - this.npcs.length);
        console.log(`Generating ${spawnCount} NPCs...`);

        // Wait for player to be loaded before spawning
        if (!GameState.player) {
            console.warn('Player not loaded yet, delaying NPC generation');
            setTimeout(() => this.generateNPCs(count), 1000);
            return this.npcs;
        }

        for (let i = 0; i < spawnCount; i++) {
            this.spawnNPC();
        }

        if (!this.active && this.npcs.length > 0) {
            this.startNPCSystem();
        }

        return this.npcs;
    }

    spawnNPC() {
        // Find a valid spawn position
        const spawnPos = this.findValidSpawnPosition();
        if (!spawnPos) {
            console.warn('Could not find valid spawn position for NPC');
            return null;
        }

        // Generate unique ID
        const id = `npc-${++this.npcCount}`;

        // Random skin
        const skin = this.skins[Math.floor(Math.random() * this.skins.length)];

        // Create NPC player object
        const npc = createPlayer(this.scene, {
            id: id,
            position: spawnPos,
            rotation: Math.random() * Math.PI * 2,
            isFlying: false,
            collisionsEnabled: true
        }, skin, false);

        // Add NPC-specific properties
        npc.isNPC = true;
        npc.velocity = { x: 0, y: 0, z: 0 };
        npc.isOnGround = true;
        npc.moveTimer = Date.now() + Math.random() * this.settings.directionChangeTime.max;
        npc.moveDirection = new THREE.Vector3(
            Math.random() * 2 - 1,
            0,
            Math.random() * 2 - 1
        ).normalize();
        npc.isMoving = false;
        npc.jumpCooldown = 0;

        // Initialize block interaction capabilities
        // Each NPC has a random chance to be assigned block removal or placement capabilities
        if (Math.random() < NPC_BEHAVIOR.AI.blockInteractionProbability) {
            // Randomly choose between removal and placement (or potentially both)
            const canRemove = NPC_BEHAVIOR.BLOCK_REMOVAL.enabled && Math.random() < 0.7;
            const canPlace = NPC_BEHAVIOR.BLOCK_PLACEMENT.enabled && Math.random() < 0.5;
            
            if (canRemove) {
                this.blockRemovalSystem.initializeNPC(npc);
            }
            
            if (canPlace) {
                this.blockPlacementSystem.initializeNPC(npc);
            }
            
            // Log NPC capabilities
            console.log(`NPC ${id} can ${canRemove ? 'remove' : 'not remove'} blocks and ${canPlace ? 'place' : 'not place'} blocks`);
        }

        // Add to NPC list
        this.npcs.push(npc);

        return npc;
    }

    findValidSpawnPosition() {
        const playerPos = GameState.player.position;
        const { min, max } = this.settings.spawnDistance;

        // Try multiple positions to find a valid one
        for (let attempts = 0; attempts < 10; attempts++) {
            const distance = min + Math.random() * (max - min);
            const angle = Math.random() * Math.PI * 2;

            const x = playerPos.x + Math.cos(angle) * distance;
            const z = playerPos.z + Math.sin(angle) * distance;

            // Find the ground level at this position
            const y = this.findGroundLevel(x, z);

            // Check if we found a valid ground level
            if (y > 0) {
                return { x, y, z };
            }
        }

        // Fallback to spawning near player
        return {
            x: playerPos.x + (Math.random() * 4 - 2),
            y: playerPos.y,
            z: playerPos.z + (Math.random() * 4 - 2)
        };
    }

    findGroundLevel(x, z) {
        // Start from slightly above player height and scan down
        const playerY = GameState.player ? GameState.player.position.y : TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL;
        const startY = Math.max(Math.floor(playerY) + 5, TRAINING_WORLD_CONFIG.BASE_GROUND_LEVEL + 10);

        // Position for collision check
        const position = new THREE.Vector3(x, startY, z);

        // Scan down to find the ground
        for (let y = startY; y > 0; y--) {
            position.y = y;

            // Check if this position is air
            const currentCollision = NPCPhysics.checkNPCCollision(position, this.scene);

            // Check if block below is solid
            position.y = y - 1;
            const belowCollision = NPCPhysics.checkNPCCollision(position, this.scene);

            if (!currentCollision.collides && belowCollision.collides) {
                return y; // Found valid ground position
            }
        }

        return -1; // Ground not found
    }

    startNPCSystem() {
        if (this.active) return;

        this.active = true;
        console.log('Starting NPC system...');

        // Start update loop
        this.updateLoop();
    }

    updateLoop() {
        if (!this.active) return;

        // Calculate delta time
        const now = Date.now();
        const deltaTime = Math.min((now - this.lastUpdate) / 1000, 0.1); // cap to 100ms
        this.lastUpdate = now;

        // Update NPCs
        this.updateNPCs(deltaTime);

        // Schedule next update
        requestAnimationFrame(() => this.updateLoop());
    }

    updateNPCs(deltaTime) {
        const now = Date.now();

        for (const npc of this.npcs) {
            // Skip if NPC is not active
            if (!npc.visible || !npc.parent) continue;

            // Change movement direction occasionally
            if (now > npc.moveTimer) {
                npc.moveDirection = new THREE.Vector3(
                    Math.random() * 2 - 1,
                    0,
                    Math.random() * 2 - 1
                ).normalize();

                // Set next direction change
                npc.moveTimer = now + this.settings.directionChangeTime.min +
                    Math.random() * (this.settings.directionChangeTime.max - this.settings.directionChangeTime.min);
                
                // Maybe jump when changing direction (if on ground)
                if (npc.isOnGround && npc.jumpCooldown <= 0 && Math.random() < 0.2) {
                    NPCPhysics.makeNPCJump(npc);
                    npc.jumpCooldown = 1.5; // 1.5 second cooldown between jumps
                }
            }

            // Apply physics
            NPCPhysics.applyNPCGravity(npc, this.scene, deltaTime);

            // Decrease jump cooldown
            if (npc.jumpCooldown > 0) {
                npc.jumpCooldown -= deltaTime;
            }

            // Move the NPC
            const movementResult = NPCPhysics.moveNPC(
                npc,
                npc.moveDirection,
                this.settings.moveSpeed,
                this.scene,
                deltaTime
            );

            // Update rotation based on movement direction
            npc.yaw = Math.atan2(-npc.moveDirection.x, -npc.moveDirection.z);

            // Set moving status for animation
            npc.isMoving = movementResult.hasMoved;

            // Try to jump if blocked and on ground
            if ((movementResult.xBlocked || movementResult.zBlocked) &&
                npc.isOnGround &&
                npc.jumpCooldown <= 0 &&
                Math.random() < this.settings.jumpChance) {
                NPCPhysics.makeNPCJump(npc);
                npc.jumpCooldown = 1.5; // 1.5 second cooldown
            }

            // Handle stuck NPCs
            if (NPCPhysics.isNPCStuck(npc)) {
                const newPos = this.findValidSpawnPosition();
                if (newPos) {
                    npc.position.set(newPos.x, newPos.y, newPos.z);
                    NPCPhysics.resetNPCPhysics(npc);
                }
            }

            // Update block interaction behaviors
            // Only update one behavior at a time to avoid conflicts
            if (npc.blockInteraction && !npc.blockPlacement?.currentlyPlacing) {
                this.blockRemovalSystem.update(npc, this.scene, deltaTime);
            } else if (npc.blockPlacement && !npc.blockInteraction?.currentlyInteracting) {
                this.blockPlacementSystem.update(npc, this.scene, deltaTime);
            }

            // Publish movement event for animation
            GameState.publish(GameState.EVENTS.PLAYER_MOVED, {
                id: npc.userData.id,
                position: npc.position,
                rotation: npc.yaw,
                isFlying: false,
                isMoving: npc.isMoving
            });
        }
    }

    removeAllNPCs() {
        console.log(`Removing ${this.npcs.length} NPCs...`);

        for (const npc of this.npcs) {
            this.scene.remove(npc);
        }

        this.npcs = [];
        this.npcCount = 0;
    }
}

export default NPCSystem;