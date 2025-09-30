// ==============================================================
// FILE: research/src/npc/config-npc-behavior.js
// ==============================================================

export const NPC_BEHAVIOR = {
  //--------------------------------------------------------------//
  //                    Core Physics System
  //--------------------------------------------------------------//
  PHYSICS: {
    JUMP_SPEED: 0.16,
    GRAVITY: 0.012,
    TERMINAL_VELOCITY: -3.0,
    WALK_SPEED: 0.065,
    SPRINT_SPEED: 0.105,
    SNEAK_SPEED: 0.032,

    // Collision detection
    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.7,
    COLLISION_WIDTH: 0.5,
    COLLISION_HEIGHT: 1.7,
    GROUND_CHECK_DISTANCE: 0.12,
  },

  BLOCK_INTERACTION: {
    enabled: true, // Global toggle
    allowRemoval: true, // Allow NPCs to break blocks
    allowPlacement: true, // Allow NPCs to place blocks
  },

  BLOCK_REMOVAL: {
    maxReachDistance: 4,
    interactionChance: 0.05, // 5% chance per second
    maxBlocksPerSession: 3,
    cooldownAfterSession: 10000, // 10 seconds
  },

  BLOCK_PLACEMENT: {
    maxReachDistance: 4,
    interactionChance: 0.03, // 3% chance per second
    maxBlocksPerSession: 5,
    cooldownAfterSession: 15000, // 15 seconds
    availableBlockTypes: [1, 2, 3, 4, 5], // Block IDs
  },

  //--------------------------------------------------------------//
  //                   Basic Movement System
  //--------------------------------------------------------------//
  MOVEMENT: {
    directionChangeTimeMin: 2000,
    directionChangeTimeMax: 5000,
    spawnDistanceMin: 15,
    spawnDistanceMax: 25,
    maxNPCs: 12,
    jumpChance: 0.1,
    stuckDetectionTime: 3000,
  },

  //--------------------------------------------------------------//
  //                 Hide and Seek Game
  //--------------------------------------------------------------//
  HIDE_AND_SEEK: {
    // Game setup
    seekerCount: 1,
    hiderCount: 2,
    gameTimeLimit: 180000, // 3 minutes
    countdownTime: 10000, // 10 seconds prep time

    // Seeker behavior
    SEEKER: {
      visionRange: 12,
      visionAngle: Math.PI / 2.5, // ~72° vision cone
      detectionTime: 2000, // 2 seconds to catch
      moveSpeed: 0.075,
      memoryTime: 8000, // Remember last seen position
      giveUpTime: 12000, // Give up searching after 12s
      visualIndicatorColor: 0xff4444,
    },

    // Hider behavior
    HIDER: {
      hideRange: 30, // Search area for hiding spots
      fleeDistance: 10, // Distance to start fleeing
      stealthMoveSpeed: 0.04, // Slow when hiding
      panicMoveSpeed: 0.09, // Fast when fleeing
      hidingTime: 8000, // Stay in hiding spot
      visualIndicatorColor: 0x44ff44,
    },
  },

  //--------------------------------------------------------------//
  //                      Game States
  //--------------------------------------------------------------//
  GAME_STATES: {
    WAITING: "waiting",
    COUNTDOWN: "countdown",
    SEEKING: "seeking",
    FOUND: "found",
    HIDDEN: "hidden",
    FLEEING: "fleeing",
    GAME_OVER: "game_over",
  },

  //--------------------------------------------------------------//
  //                      Visual System
  //--------------------------------------------------------------//
  VISUALS: {
    showNPCStatus: true, // Show seeker/hider indicators
    showVisionCones: false, // Debug: vision cones
    showHidingSpots: false, // Debug: hiding spots
    effectDuration: 1000,
  },
};
