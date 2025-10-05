// ==============================================================
// FILE: research/src/npc/config-npc-behavior.js (ADJUSTED)
// ==============================================================

export const NPC = {
  //--------------------------------------------------------------//
  //                    Core Physics System
  //--------------------------------------------------------------//
  PHYSICS: {
    // Vertical physics (per second values)
    JUMP_SPEED: 8.4, // blocks/second (matching player)
    GRAVITY: 32.0, // blocks/second²
    TERMINAL_VELOCITY: -78.4, // blocks/second

    // Horizontal movement (per second values)
    WALK_SPEED: 4.0, // blocks/second (slightly slower than player)
    SPRINT_SPEED: 5.6, // blocks/second (matching player sprint)
    SNEAK_SPEED: 1.3, // blocks/second (matching player sneak)

    // Collision detection (unchanged - these are sizes, not velocities)
    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.7,
    COLLISION_WIDTH: 0.5,
    COLLISION_HEIGHT: 1.7,
    GROUND_CHECK_DISTANCE: 0.12,
  },

  VISION: {
    visionRange: 25,
    visionAngle: Math.PI / 2,
    rayCount: 64,
    rayPrecisionAngle: 0.2,
    debug: false,
  },

  BLOCK_REMOVAL: {
    maxReachDistance: 5,
  },

  BLOCK_PLACEMENT: {
    maxReachDistance: 5,
    availableBlockTypes: [1, 2, 3, 4, 5],
  },

  //--------------------------------------------------------------//
  //                 Hide and Seek Game
  //--------------------------------------------------------------//
  HIDE_AND_SEEK: {
    seekerCount: 1,
    hiderCount: 2,
    gameTimeLimit: 30000, // 30 seconds
    countdownTime: 100, // 1 second

    // Seeker behavior
    SEEKER: {
      detectionTime: 400,
      visualIndicatorColor: 0xff4444,
    },

    // Hider behavior
    HIDER: {
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
    showNPCStatus: true,
    showVisionCones: false,
    showHidingSpots: false,
    effectDuration: 1000,
  },

  //--------------------------------------------------------------//
  //              TRAINING CONFIGURATION
  //--------------------------------------------------------------//
  TRAINING: {
    enabled: true,

    // Model configuration
    MODEL: {
      hiddenLayers: [128, 64, 32],
      learningRate: 0.0005,
      gamma: 0.99,
      epsilon: 1.0,
      epsilonDecay: 0.999,
      epsilonMin: 0.05,
      stateSize: 141,
      batchSize: 32,
      memorySize: 10000,

      // Change action size if you modify actions
      actionSize: 11,

      rewardClipMin: -1,
      rewardClipMax: 1,
    },

    // Training parameters
    TRAINING: {
      episodes: 2000,
      maxStepsPerEpisode: 900,
      updateFrequency: 15,
      targetUpdateFrequency: 1500,
      saveFrequency: 50,
      validationFrequency: 10,
    },

    REWARDS: {
      // Hider rewards
      HIDER: {
        survivalPerSecond: 0.02, // Small per-step survival
        detectedBySeeker: -0.5, // Scaled danger penalty
        increasedDistance: 0.05, // Small escape bonus
        brokeLineOfSight: 0.1, // Breaking vision bonus
        stayedStationary: -0.01, // Small stuck penalty
        successfullyHidden: 0.05, // Safety bonus
        revisitedPosition: -0.005, // Tiny revisit penalty
        caughtPenalty: -10.0, // Big penalty for being caught
        boundaryCollision: -0.05, // Small boundary penalty
        successfulJump: 0.05, // Jump bonus
        failedJump: -0.02, // Small jump penalty
        episodeSurvivalBonus: 15.0, // Big bonus for surviving full game
      },
      // Seeker rewards
      SEEKER: {
        foundHider: 2.0, // Big reward for seeing hider
        approachedTarget: 0.5, // Getting closer bonus
        decreasedDistance: 0.2, // Distance reduction
        investigatedSound: 0.1, // Sound investigation
        successfulJump: 0.1, // Smart jump bonus
        failedJump: -0.02, // Unnecessary jump penalty
        exploredNewArea: 0.2, // Exploration bonus
        rotationWhenSearching: 0.01, // Small scan bonus
        movementBonus: 0.02, // Small movement reward
        stationaryPenalty: -0.02, // Stuck penalty
        timeoutPenalty: -15.0, // Big penalty for not finding anyone
        boundaryCollision: -0.1, // Boundary penalty
        episodeCatchBonus: 20.0, // Big bonus for winning
        quickCatchBonus: 10.0, // Extra for fast catches
      },
    },
  },
};
