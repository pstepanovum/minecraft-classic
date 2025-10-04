// ==============================================================
// FILE: research/src/npc/config-npc-behavior.js (ADJUSTED)
// ==============================================================

export const NPC_BEHAVIOR = {
  //--------------------------------------------------------------//
  //                    Core Physics System
  //--------------------------------------------------------------//
  PHYSICS: {
    JUMP_SPEED: 0.25,
    GRAVITY: 0.015,
    TERMINAL_VELOCITY: -3.0,
    WALK_SPEED: 0.075,
    SPRINT_SPEED: 0.12,
    SNEAK_SPEED: 0.04,

    // Collision detection
    PLAYER_WIDTH: 0.6,
    PLAYER_HEIGHT: 1.7,
    COLLISION_WIDTH: 0.5,
    COLLISION_HEIGHT: 1.7,
    GROUND_CHECK_DISTANCE: 0.12,
  },

  BLOCK_REMOVAL: {
    maxReachDistance: 4,
    interactionChance: 0.05,
    maxBlocksPerSession: 3,
    cooldownAfterSession: 10000,
  },

  BLOCK_PLACEMENT: {
    maxReachDistance: 4,
    interactionChance: 0.03,
    maxBlocksPerSession: 5,
    cooldownAfterSession: 15000,
    availableBlockTypes: [1, 2, 3, 4, 5],
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
  },

  //--------------------------------------------------------------//
  //                 Hide and Seek Game
  //--------------------------------------------------------------//
  HIDE_AND_SEEK: {
    seekerCount: 1,
    hiderCount: 2,
    gameTimeLimit: 60000,
    countdownTime: 1000,

    // Seeker behavior
    SEEKER: {
      visionRange: 25,
      visionAngle: Math.PI / 2,
      detectionTime: 400,
      moveSpeed: 0.15,
      memoryTime: 8000,
      giveUpTime: 12000,
      visualIndicatorColor: 0xff4444,
    },

    // Hider behavior
    HIDER: {
      hideRange: 30,
      fleeDistance: 10,
      stealthMoveSpeed: 0.1,
      panicMoveSpeed: 0.2,
      hidingTime: 8000,
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
  ML_TRAINING: {
    enabled: true,

    // Model configuration
    MODEL: {
      hiddenLayers: [128, 64, 32],
      learningRate: 0.0005,
      gamma: 0.99,
      epsilon: 1.0,
      epsilonDecay: 0.999,
      epsilonMin: 0.05,
      batchSize: 64,
      memorySize: 100000,
    },

    // Training parameters
    TRAINING: {
      episodes: 2000,
      maxStepsPerEpisode: 3000,
      updateFrequency: 2,
      targetUpdateFrequency: 100,
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
