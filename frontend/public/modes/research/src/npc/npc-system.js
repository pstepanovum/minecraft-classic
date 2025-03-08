// npc-system-simplified.js
// A simplified system for NPCs with dedicated physics handling

import { createPlayer } from '../../../../src/player/players.js';
import * as GameState from '../../../../src/core/game-state.js';
import { TRAINING_WORLD_CONFIG } from '../config-training-world.js';
import * as NPCPhysics from '../npc/physics/npc-physics.js';
import NPCBlockInteractions from '../npc/physics/npc-block-interactions.js';

// Use constants from dedicated NPC physics
const { NPC_PHYSICS } = NPCPhysics;

class NPCSystem {
    constructor(scene) {
        this.scene = scene;
        this.npcs = [];
        this.npcCount = 0;
        this.active = false;

        // Settings
        this.settings = {
            moveSpeed: NPC_PHYSICS.WALK_SPEED,
            maxNPCs: 100,
            spawnDistance: { min: 5, max: 15 },
            jumpChance: 0.02,
            directionChangeTime: { min: 2000, max: 5000 },
            // New settings for block interactions
            enableBlockInteractions: true,
            blockInteractionProbability: 1  // 40% of NPCs will interact with blocks
        };

        // Available NPC skins
        this.skins = [
            '../../../assets/images/skins/1.png',
            '../../../assets/images/skins/2.png',
            '../../../assets/images/skins/4.png',
            '../../../assets/images/skins/4.png'
        ];

        // Animation and timing variables
        this.lastUpdate = Date.now();
        this.frameCount = 0;

        // Initialize the block interaction system
        this.blockInteractionSystem = new NPCBlockInteractions();

        console.log('NPC System created with simplified physics');
    }

    initialize() {
        console.log('Initializing simplified NPC system...');
        console.log('NPC system initialized');
        return this;
    }

    generateNPCs(count = 5) {
        // Limit to maximum allowed
        const spawnCount = Math.min(count, this.settings.maxNPCs - this.npcs.length);
        console.log(`Generating ${spawnCount} NPCs...`);

        // Wait for player to be loaded before spawning
        if (!GameState.player) {
            console.warn('Player not loaded yet, delaying NPC generation');
            setTimeout(() => this.generateNPCs(count), 1000);
            return this.npcs;
        }

        let successfulSpawns = 0;
        for (let i = 0; i < spawnCount; i++) {
            const npc = this.spawnNPC();
            if (npc) successfulSpawns++;
        }

        console.log(`Successfully spawned ${successfulSpawns} NPCs`);

        if (!this.active && this.npcs.length > 0) {
            this.startNPCSystem();
        }

        return this.npcs;
    }

    spawnNPC() {
        // Always spawn relative to player
        if (!GameState.player) {
            console.warn('Cannot spawn NPC: Player not loaded');
            return null;
        }
    
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
    
        console.log(`Spawning NPC at position:`, spawnPos);
    
        // Create NPC player object - explicitly disable flying and enable collisions
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
        npc.isOnGround = true;  // Start on ground
        npc.moveTimer = Date.now() + Math.random() * this.settings.directionChangeTime.max;
        npc.moveDirection = new THREE.Vector3(
            Math.random() * 2 - 1,
            0,
            Math.random() * 2 - 1
        ).normalize();
        npc.isMoving = false;
        npc.jumpCooldown = 0;
        
        // Determine if this NPC will interact with blocks
        if (this.settings.enableBlockInteractions && 
            Math.random() < this.settings.blockInteractionProbability) {
            this.blockInteractionSystem.initializeNPC(npc);
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

        // Fallback to spawning right next to player on same height
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

        // If ground not found, return -1
        return -1;
    }

    startNPCSystem() {
        if (this.active) return;

        this.active = true;
        console.log('Starting NPC system...');

        // Use requestAnimationFrame for smoother updates
        this.updateLoop();
    }

    updateLoop() {
        if (!this.active) return;

        // Calculate delta time for smooth animation
        const now = Date.now();
        const deltaTime = Math.min((now - this.lastUpdate) / 1000, 0.1); // cap to 100ms
        this.lastUpdate = now;
        this.frameCount++;

        // Update NPCs
        this.updateNPCs(deltaTime);

        // Schedule next update
        requestAnimationFrame(() => this.updateLoop());
    }

    stopNPCSystem() {
        if (!this.active) return;

        this.active = false;
        console.log('Stopping NPC system...');
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
    
                // Set next direction change in 2-5 seconds
                npc.moveTimer = now + this.settings.directionChangeTime.min +
                    Math.random() * (this.settings.directionChangeTime.max - this.settings.directionChangeTime.min);
    
                // Maybe jump when changing direction (if on ground)
                if (npc.isOnGround && npc.jumpCooldown <= 0 && Math.random() < 0.2) {
                    NPCPhysics.makeNPCJump(npc);
                    npc.jumpCooldown = 1.5; // 1.5 second cooldown between jumps
                }
            }
    
            // Apply gravity - must be done every frame
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
    
            // Check if NPC is stuck
            if (NPCPhysics.isNPCStuck(npc)) {
                // Find a new position
                const newPos = this.findValidSpawnPosition();
                if (newPos) {
                    npc.position.set(newPos.x, newPos.y, newPos.z);
                    NPCPhysics.resetNPCPhysics(npc);
                }
            }
            
            // Update block interactions if NPC has them
            if (npc.blockInteraction && this.settings.enableBlockInteractions) {
                this.blockInteractionSystem.update(npc, this.scene, deltaTime);
            }
    
            // Publish movement event for animation
            GameState.publish(GameState.EVENTS.PLAYER_MOVED, {
                id: npc.userData.id,
                position: npc.position,
                rotation: npc.yaw,
                isFlying: false, // Always false
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