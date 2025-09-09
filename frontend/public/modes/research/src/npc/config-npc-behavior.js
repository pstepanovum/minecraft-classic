// ==============================================================
// FILE: research/src/npc/config-npc-behavior.js
// ==============================================================

export const NPC_BEHAVIOR = {
    // Physics constants
    PHYSICS: {
        JUMP_SPEED: 0.15,
        GRAVITY: 0.008,
        TERMINAL_VELOCITY: -3,
        PLAYER_WIDTH: 0.6,
        PLAYER_HEIGHT: 1.6,
        WALK_SPEED: 0.065,
        SPRINT_SPEED: 0.112,
        SNEAK_SPEED: 0.03,
        FLY_SPEED: 1.5,
        COLLISION_WIDTH: 0.5,
        COLLISION_HEIGHT: 1.6,
        GROUND_CHECK_DISTANCE: 0.15
    },
    
    // General movement behavior
    MOVEMENT: {
        directionChangeTimeMin: 2000,    // Minimum time before changing direction (ms)
        directionChangeTimeMax: 5000,    // Maximum time before changing direction (ms)
        spawnDistanceMin: 5,             // Minimum spawn distance from player
        spawnDistanceMax: 15,            // Maximum spawn distance from player
        maxNPCs: 1000                     // Maximum number of NPCs allowed
    },
    
    // Block removal behavior
    BLOCK_REMOVAL: {
        enabled: true,                   // Whether NPCs can remove blocks
        interactionChance: 0.9,         // Chance per update to start removing blocks
        maxBlocksPerSession: 999,         // Maximum blocks to remove per session
        cooldownAfterSession: 10,      // Cooldown after a removal session (ms)
        maxReachDistance: 5              // How far NPCs can reach to remove blocks
    },
    
    // Block placement behavior
    BLOCK_PLACEMENT: {
        enabled: true,                   // Whether NPCs can place blocks
        interactionChance: 0.9,         // Chance per update to start placing blocks
        maxBlocksPerSession: 999,          // Maximum blocks to place per session
        cooldownAfterSession: 10,      // Cooldown after a placement session (ms)
        maxReachDistance: 4,             // How far NPCs can reach to place blocks
        availableBlockTypes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] // Block types NPCs can place
    },
    
    // Visual effects
    VISUALS: {
        showBlockEffects: true,          // Show effects for block interactions
        effectDuration: 500              // Duration of visual effects (ms)
    },
    
    // AI behavior probabilities
    AI: {
        blockInteractionProbability: 0.4, // Percentage of NPCs that will interact with blocks
        followPlayerChance: 0.1,         // Chance that an NPC will follow the player
        groupWithOtherNPCsChance: 0.15   // Chance that NPCs will form groups
    }
};

export default NPC_BEHAVIOR;