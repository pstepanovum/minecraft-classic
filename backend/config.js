const WORLD_CONFIG = {
    SEED: '1',
    SIZE: 100,
    MAX_HEIGHT: 100,
    MAX_PLAYERS: 5,
    CAVE: {
      THRESHOLD: 0.6,
      SCALE: 0.05
    },
    TERRAIN: {
      SCALE: 0.01,
      OCTAVES: 6,
      AMPLITUDE: 1,
      FREQUENCY: 1,
      FEATURES: {
        MOUNTAIN: { SCALE: 0.004, WEIGHT: 0.3 },
        HILL: { SCALE: 0.015, WEIGHT: 0.1 },
        PLAIN: { SCALE: 0.025, WEIGHT: 0.05 }
      }
    }
};

const PLAYER_CONFIG = {
  HEIGHT: 1.7,
  WIDTH: 0.9,
  MOVEMENT: {
    JUMP_SPEED: 0.15,
    GRAVITY: 0.008,
    TERMINAL_VELOCITY: -3,
    WALK_SPEED: 0.0697,
    SPRINT_SPEED: 0.112,
    SNEAK_SPEED: 0.03,
    SWIM_SPEED: 0.05,
    FLY_SPEED: 0.612,
    EPSILON: 0.001
  },
  STATUS: {
    isFlying: false,
    isSprinting: false,
    isSneaking: false,
    isSwimming: false,
    soulSpeedLevel: 0,
    depthStriderLevel: 0,
    isOnSlowTerrain: false,
    isInLiquid: false,
    isJumping: false,
    yVelocity: 0
  }
};
