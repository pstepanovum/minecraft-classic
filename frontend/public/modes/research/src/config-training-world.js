// ==============================================================
// FILE: research/src/config-training-world.js
// ==============================================================

export const TRAINING_WORLD_CONFIG = {
  SEED: 6232,
  SIZE: 64,
  BASE_GROUND_LEVEL: 35,
  TERRAIN_HEIGHT_RANGE: 45, 
  MAX_HEIGHT: 100,
  WATER_LEVEL: 40, 
  BIOME_SCALE: 0.2,
  TEMPERATURE_SCALE: 0.006,
  ELEVATION_SCALE: 0.01,

  BIOMES: {
    SCALE: 0.01, // Increased for smaller biomes
    TYPES: {
      FOREST: {
        TREE_DENSITY: 0.8, // Reduced tree density for easier navigation
        DIRT_DEPTH: 3,
        TREE_TYPE: "FOREST",
      },
      PLAINS: {
        TREE_DENSITY: 0.5, // Very few trees in plains for open spaces
        DIRT_DEPTH: 2,
        TREE_TYPE: "PLAINS",
      },
    },
  },

  TREES: {
    MIN_HEIGHT: 6,
    MAX_HEIGHT: 10,
    MIN_SPACING: 4,
    INFLUENCE_RADIUS: 5,
    NOISE_SCALE: 1,
    BEACH_BUFFER: 4,

    // Biome-specific tree settings
    BIOMES: {
      FOREST: {
        NOISE_THRESHOLD: 0.075, // More trees (normalizedNoise > 0.75)
        TRUNK_HEIGHT: {
          MIN: 6,
          MAX: 10,
        },
        LEAF_CONFIG: {
          MAX_RADIUS: 2,
          LAYERS: [
            { height: 0, radius: 1, full: true }, // Top layer
            { height: 1, radius: 2, full: true }, // Middle layers
            { height: 2, radius: 2, full: true },
            { height: 3, radius: 2, full: false }, // Bottom layer
          ],
        },
      },
      PLAINS: {
        NOISE_THRESHOLD: 0.92, // Fewer trees (normalizedNoise > 0.92)
        TRUNK_HEIGHT: {
          MIN: 4,
          MAX: 7,
        },
        LEAF_CONFIG: {
          MAX_RADIUS: 2,
          LAYERS: [
            { height: 0, radius: 1, full: true },
            { height: 1, radius: 2, full: true },
            { height: 2, radius: 2, full: false }, // Fixed: added 'full:' before false
          ],
        },
      },
    },

    // Advanced configuration
    PLACEMENT: {
      MAX_HEIGHT_DIFFERENCE: 3, // Maximum height difference for tree placement
      REQUIRED_FLAT_RADIUS: 1, // Radius of flat ground required
    },
  },

  TERRAIN: {
    AMPLITUDE: 0.7, // Reduced for more gentle terrain
    FREQUENCY: 0.8, // Adjusted for smaller world
    OCTAVES: 3, // Fewer octaves for smoother terrain
    SCALE: 0.018, // Adjusted for smaller world
  },

  OCEAN: {
    SCALE: 0.15,
    SEAGRASS_CHANCE: 0.03, // Less seagrass
    SAND_DEPTH: 2,
    SAND_NOISE_THRESHOLD: 0.7,
    GRAVEL_DEPTH_THRESHOLD: 0.8,
    GRAVEL_NOISE_THRESHOLD: 0.6,
    ICE_CHANCE: 0, // No ice for simplicity
  },

  ORES: {
    COAL: {
      SCALE: 0.03,
      THRESHOLD: 0.6,
      MIN_HEIGHT: 5,
      MAX_HEIGHT: 30, // Lower max height in smaller world
    },
    IRON: {
      SCALE: 0.04,
      THRESHOLD: 0.65,
      MIN_HEIGHT: 5,
      MAX_HEIGHT: 25, // Lower max height in smaller world
    },
  },

  CAVES: {
    MIN_HEIGHT: 1,
    MAX_HEIGHT: 1, // Lower max height for caves

    CHEESE: {
      SCALE: 0.0015, // Adjusted scale for smaller world
      THRESHOLD: 0.75, // Higher threshold for fewer caves
      AMPLITUDE: 0.4, // Lower amplitude for less variation
    },

    TUNNEL: {
      SCALE: 0.02, // Adjusted for smaller world
      THRESHOLD: 0.72, // Higher threshold for fewer tunnels
      AMPLITUDE: 1.0, // Reduced amplitude for less dramatic tunnels
      MIN_RADIUS: 1,
      MAX_RADIUS: 2,
      VERTICAL_SCALE: 0.7, // Makes tunnels more horizontal
      PREFERRED_HEIGHT: 15, // Lower preferred height
      HEIGHT_VARIATION: 8, // Less height variation
      VARIATION_AMPLITUDE: 0.2,
      CONNECTION_SCALE: 0.035,
      CONNECTION_STRENGTH: 0.3,
    },

    SPAGHETTI: {
      SCALE: 0.03,
      THRESHOLD: 0.75, // Higher threshold for fewer tunnels
      AMPLITUDE: 1.0,
      WIDTH: 0.2,
      VERTICAL_SQUEEZE: 0.8, // Makes tunnels more horizontal
      WINDING_STRENGTH: 0.2, // Less winding for easier navigation
      BRANCH_SCALE: 0.05,
      BRANCH_STRENGTH: 0.4,
      BRANCH_THRESHOLD: 0.75, // Fewer branches
    },

    RAVINE: {
      SCALE: 0.015,
      AMPLITUDE: 0.8, // Reduced amplitude for less dramatic ravines
      THRESHOLD: 0.85, // Higher threshold for fewer ravines
      MEAN_HEIGHT: 15, // Lower average height
      HEIGHT_RANGE: 10, // Reduced height range
      DEPTH_SCALE: 0.04,
      DEPTH_AMPLITUDE: 0.2, // Reduced depth
      WIDTH_SCALE: 0.015,
      WIDTH_VARIATION: 0.15, // Less width variation
      MIN_WIDTH: 1,
      MAX_WIDTH: 2, // Narrower maximum width
    },
  },
};
