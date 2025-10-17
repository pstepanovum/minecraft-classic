// FILE: research/src/npc/config-npc-behavior.js

export const NPC = {
  PHYSICS: {
    JUMP_SPEED: 8.4,
    GRAVITY: 32.0,
    TERMINAL_VELOCITY: -78.4,
    WALK_SPEED: 4.0,
    SPRINT_SPEED: 5.6,
    SNEAK_SPEED: 1.3,
    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.7,
    COLLISION_WIDTH: 0.5,
    COLLISION_HEIGHT: 1.7,
    GROUND_CHECK_DISTANCE: 0.12,
  },

  VISION: {
    visionRange: 32,
    visionAngle: Math.PI / 2.5,
    rayCount: 64,
    rayAngleTolerance: 0.996,
    debug: false,
  },

  BLOCK_REMOVAL: {
    maxReachDistance: 5,
    maxBlocksRemoved: 0,
  },

  BLOCK_PLACEMENT: {
    maxReachDistance: 5,
    availableBlockTypes: [1, 2, 3, 4, 5],
    maxBlocksPlaced: 0,
  },

  HIDE_AND_SEEK: {
    seekerCount: 1,
    hiderCount: 2,
    gameTimeLimit: 90000, // 90 seconds
    countdownTime: 5000, // 5 seconds prep time (seeker can't move)

    SEEKER: {
      detectionTime: 1000, // 1 second to catch - more forgiving
      visualIndicatorColor: 0xff4444,
    },

    HIDER: {
      visualIndicatorColor: 0x44ff44,
    },
  },

  GAME_STATES: {
    WAITING: "waiting",
    COUNTDOWN: "countdown",
    SEEKING: "seeking",
    FOUND: "found",
    HIDDEN: "hidden",
    FLEEING: "fleeing",
    GAME_OVER: "game_over",
  },

  VISUALS: {
    showNPCStatus: true,
    showVisionCones: false,
    showHidingSpots: false,
    effectDuration: 1000,
  },

  TRAINING: {
    enabled: true,
    debug: false,

    MODEL: {
      stateSize: 94,
    },
  },
};
