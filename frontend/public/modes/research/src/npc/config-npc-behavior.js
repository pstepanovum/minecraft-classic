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
    visionRange: 32,          // Reduced from 64 - more realistic
    visionAngle: Math.PI / 2.5,   // ~72° - narrower, more realistic
    rayCount: 64,              // Increased from 32 - better perception
    rayPrecisionAngle: 0.2,
    debug: true,
  },

  BLOCK_REMOVAL: {
    maxReachDistance: 5,
  },

  BLOCK_PLACEMENT: {
    maxReachDistance: 5,
    availableBlockTypes: [1, 2, 3, 4, 5],
  },

  HIDE_AND_SEEK: {
    seekerCount: 1,
    hiderCount: 2,
    gameTimeLimit: 45000,         // 45 seconds - shorter for faster episodes
    countdownTime: 5000,          // 5 seconds prep time - enough to hide

    SEEKER: {
      detectionTime: 1000,        // 1 second to catch - more forgiving
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

    MODEL: {
      hiddenLayers: [128, 64, 32],
      learningRate: 0.001,        // Increased from 0.0005 - faster initial learning
      gamma: 0.95,                // Reduced from 0.99 - focus on immediate rewards
      epsilon: 1.0,
      epsilonDecay: 0.995,        // Faster decay from 0.999 - exploit sooner
      epsilonMin: 0.1,            // Higher min from 0.05 - maintain some exploration
      stateSize: 139,
      actionSize: 14,
      batchSize: 64,              // Increased from 32 - more stable updates
      memorySize: 20000,          // Increased from 10000 - more diverse experiences

      ACTION_GROUPS: {
        movement: 3,
        jump: 2,
        rotation: 3,
        look: 3,
        block: 3,
      },

      actionDistribution: 216,

      rewardClipMin: -2.0,        // Allow larger penalties
      rewardClipMax: 2.0,         // Allow larger rewards
    },

    TRAINING: {
      episodes: 500,              // Realistic goal for class project
      maxStepsPerEpisode: 3000, // 3000 steps per episode
      updateFrequency: 4,         // Train more often (every 4 steps vs 15)
      targetUpdateFrequency: 500, // More frequent updates (from 1500)
      saveFrequency: 25,          // Save every 25 episodes
      validationFrequency: 10,
    },

    REWARDS: {
      HIDER: {
        survivalPerSecond: 0.02,
        detectedBySeeker: -0.5,
        increasedDistance: 0.05,
        brokeLineOfSight: 0.1,
        stayedStationary: -0.01,
        successfullyHidden: 0.05,
        revisitedPosition: -0.005,
        caughtPenalty: -10.0,
        boundaryCollision: -0.05,
        successfulJump: 0.05,
        failedJump: -0.02,
        episodeSurvivalBonus: 15.0,
      },
      SEEKER: {
        foundHider: 2.0,
        approachedTarget: 0.5,
        decreasedDistance: 0.2,
        investigatedSound: 0.1,
        successfulJump: 0.1,
        failedJump: -0.02,
        exploredNewArea: 0.2,
        rotationWhenSearching: 0.01,
        movementBonus: 0.02,
        stationaryPenalty: -0.02,
        timeoutPenalty: -15.0,
        boundaryCollision: -0.1,
        episodeCatchBonus: 20.0,
        quickCatchBonus: 10.0,
      },
    },
  },
};