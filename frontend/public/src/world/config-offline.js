//-------------------------------------------------------------
//                  World configuration (local)
//-------------------------------------------------------------
export const WORLD_CONFIG_OFFLINE  = {
    SEED: 1,
    SIZE: 1000,
    BASE_GROUND_LEVEL: 32,
    TERRAIN_HEIGHT_RANGE: 35,
    MAX_HEIGHT: 150,
    WATER_LEVEL: 40,
    BIOME_SCALE: 0.05,
    TEMPERATURE_SCALE: 0.003,
    ELEVATION_SCALE: 0.004,

    BIOMES: {
        SCALE: 0.003,
        TYPES: {
            FOREST: {
                TREE_DENSITY: 0.6,
                DIRT_DEPTH: 4,
                TREE_TYPE: 'FOREST'       // References TREES.BIOMES.FOREST
            },
            PLAINS: {
                TREE_DENSITY: 0.1,
                DIRT_DEPTH: 3,
                TREE_TYPE: 'PLAINS'       // References TREES.BIOMES.PLAINS
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
                NOISE_THRESHOLD: 0.075,    // More trees (normalizedNoise > 0.75)
                TRUNK_HEIGHT: {
                    MIN: 6,
                    MAX: 10,
                },
                LEAF_CONFIG: {
                    MAX_RADIUS: 2,
                    LAYERS: [
                        { height: 0, radius: 1, full: true },   // Top layer
                        { height: 1, radius: 2, full: true },   // Middle layers
                        { height: 2, radius: 2, full: true },
                        { height: 3, radius: 2, full: false },  // Bottom layer
                    ]
                }
            },
            PLAINS: {
                NOISE_THRESHOLD: 0.92,    // Fewer trees (normalizedNoise > 0.92)
                TRUNK_HEIGHT: {
                    MIN: 4,
                    MAX: 7,
                },
                LEAF_CONFIG: {
                    MAX_RADIUS: 2,
                    LAYERS: [
                        { height: 0, radius: 1, full: true },
                        { height: 1, radius: 2, full: true },
                        { height: 2, radius: 2, full: false }  // Fixed: added 'full:' before false
                    ]
                }
            }
        },

        // Advanced configuration
        PLACEMENT: {
            MAX_HEIGHT_DIFFERENCE: 3,     // Maximum height difference for tree placement
            REQUIRED_FLAT_RADIUS: 1,      // Radius of flat ground required
        }
    },

    TERRAIN: {
        AMPLITUDE: 1.0,
        FREQUENCY: 1.0,
        OCTAVES: 4,
        SCALE: 0.01,
        AMPLITUDE: 1.0,
    },

    OCEAN: {
        SCALE: 0.1,
        SEAGRASS_CHANCE: 0.05,
        SAND_DEPTH: 3,
        SAND_NOISE_THRESHOLD: 0.7,
        GRAVEL_DEPTH_THRESHOLD: 0.8,
        GRAVEL_NOISE_THRESHOLD: 0.6,
        ICE_CHANCE: 0.01,
    },

    ORES: {
        COAL: {
            SCALE: 0.03,
            THRESHOLD: 0.6,
            MIN_HEIGHT: 5,
            MAX_HEIGHT: 60,
        },
        IRON: {
            SCALE: 0.04,
            THRESHOLD: 0.65,
            MIN_HEIGHT: 5,
            MAX_HEIGHT: 40,
        },
    },

    CAVES: {
        MIN_HEIGHT: 2,
        MAX_HEIGHT: 40,  // Reduced maximum height for more Minecraft-like caves
        
        CHEESE: {
            SCALE: 0.01,       // Increased scale for smaller caves
            THRESHOLD: 0.73,    // Increased threshold for fewer caves
            AMPLITUDE: 0.5      // Reduced amplitude for less variation
        },
    
        TUNNEL: {
            SCALE: 0.018,              // Slightly reduced for longer tunnels
            THRESHOLD: 0.68,           // Lower threshold for more tunnels
            AMPLITUDE: 1.2,            // Increased for more dramatic tunnels
            MIN_RADIUS: 1,
            MAX_RADIUS: 2,            // Slightly larger maximum radius
            VERTICAL_SCALE: 0.6,      // Makes tunnels more horizontal
            PREFERRED_HEIGHT: 30,     // Preferred tunnel height
            HEIGHT_VARIATION: 15,     // How much tunnels can vary in height
            VARIATION_AMPLITUDE: 0.3, // How much tunnels vary in shape
            CONNECTION_SCALE: 0.03,   // Scale of tunnel connections
            CONNECTION_STRENGTH: 0.4  // Strength of tunnel connections
        },
    
        SPAGHETTI: {
            SCALE: 0.025,             // Adjusted for better tunnel size
            THRESHOLD: 0.71,          // Slightly lower threshold
            AMPLITUDE: 1.3,           // Increased variation
            WIDTH: 0.2,              // Slightly wider tunnels
            VERTICAL_SQUEEZE: 0.7,    // Makes tunnels more horizontal
            WINDING_STRENGTH: 0.3,    // How much tunnels wind around
            BRANCH_SCALE: 0.04,       // Scale of tunnel branching
            BRANCH_STRENGTH: 0.5,     // Strength of branches
            BRANCH_THRESHOLD: 0.7     // How often branches occur
        },

        RAVINE: {
            SCALE: 0.012,          // Adjusted for shorter ravines
            AMPLITUDE: 1.2,         // Reduced amplitude
            THRESHOLD: 0.78,        // Increased threshold for rarer ravines
            MEAN_HEIGHT: 35,        // Lower average height
            HEIGHT_RANGE: 23,       // Reduced vertical range
            DEPTH_SCALE: 0.04,      // Slightly reduced depth variations
            DEPTH_AMPLITUDE: 0.3,    // Reduced depth amplitude
            WIDTH_SCALE: 0.015,     // Adjusted width variations
            WIDTH_VARIATION: 0.2,    // Reduced width variation
            MIN_WIDTH: 1,           // Same minimum width
            MAX_WIDTH: 2            // Reduced maximum width
        }
    }   
};