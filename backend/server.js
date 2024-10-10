const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Constants
const PORT = process.env.PORT || 3000;

const BASE_GROUND_LEVEL = 64;
const TERRAIN_HEIGHT_RANGE = 156;

const WORLD_CONFIG = {
    SEED: 1,
    SIZE: 10000,
    BASE_GROUND_LEVEL: BASE_GROUND_LEVEL,
    TERRAIN_HEIGHT_RANGE: TERRAIN_HEIGHT_RANGE,
    MAX_HEIGHT: 256,
    MAX_PLAYERS: 20,
    CAVE: {
        THRESHOLD: 0.3,
        SCALE: 0.05,
        LACUNARITY: 2.0,
        PERSISTENCE: 0.5,
        OCTAVES: 3,
        WORM_RADIUS: 0.05,
        MIN_HEIGHT: 5,
        MAX_HEIGHT: BASE_GROUND_LEVEL + 20
    },
    TERRAIN: {
        SCALE: 0.01,
        OCTAVES: 6,
        AMPLITUDE: 0.5,
        FREQUENCY: 1,
        FEATURES: {
            MOUNTAIN: { SCALE: 0.002, WEIGHT: 1.0 },
            HILL: { SCALE: 0.05, WEIGHT: 0.5 },
            PLAIN: { SCALE: 0.1, WEIGHT: 0.2 }
        }
    },
    BIOMES: {
        DESERT: { TEMPERATURE: 2, HUMIDITY: 0, TREE_DENSITY: 0.05 },
        PLAINS: { TEMPERATURE: 0.8, HUMIDITY: 0.4, TREE_DENSITY: 0.1 },
        FOREST: { TEMPERATURE: 0.7, HUMIDITY: 0.8, TREE_DENSITY: 0.6 },
        TAIGA: { TEMPERATURE: 0.25, HUMIDITY: 0.8, TREE_DENSITY: 0.4 },
        TUNDRA: { TEMPERATURE: 0.05, HUMIDITY: 0.5, TREE_DENSITY: 0.05 },
        SAVANNA: { TEMPERATURE: 1.2, HUMIDITY: 0.3, TREE_DENSITY: 0.2 },
        JUNGLE: { TEMPERATURE: 1.2, HUMIDITY: 0.9, TREE_DENSITY: 0.8 },
        MOUNTAINS: { TEMPERATURE: 0.2, HUMIDITY: 0.3, TREE_DENSITY: 0.2 },
    },
    TREES: {
        GLOBAL: {
            NOISE_SCALE: 0.05,
            THRESHOLD: 0.6,
            MIN_HEIGHT: 4,
            MAX_HEIGHT: 8
        },
        TYPES: {
            OAK: {
                BIOMES: ['PLAINS', 'FOREST'],
                FREQUENCY: 0.3,
                MIN_HEIGHT: 4,
                MAX_HEIGHT: 6,
                TRUNK_HEIGHT: { MIN: 3, MAX: 6 },
                CANOPY_RADIUS: { MIN: 2, MAX: 3 },
                LEAF_DENSITY: 0.7
            },
            BIRCH: {
                BIOMES: ['FOREST'],
                FREQUENCY: 0.2,
                MIN_HEIGHT: 5,
                MAX_HEIGHT: 7,
                TRUNK_HEIGHT: { MIN: 4, MAX: 7 },
                CANOPY_RADIUS: { MIN: 2, MAX: 3 },
                LEAF_DENSITY: 0.6
            },
            SPRUCE: {
                BIOMES: ['TAIGA'],
                FREQUENCY: 0.4,
                MIN_HEIGHT: 6,
                MAX_HEIGHT: 10,
                TRUNK_HEIGHT: { MIN: 5, MAX: 9 },
                CANOPY_RADIUS: { MIN: 2, MAX: 4 },
                LEAF_DENSITY: 0.8
            },
            JUNGLE: {
                BIOMES: ['JUNGLE'],
                FREQUENCY: 0.7,
                MIN_HEIGHT: 8,
                MAX_HEIGHT: 12,
                TRUNK_HEIGHT: { MIN: 7, MAX: 11 },
                CANOPY_RADIUS: { MIN: 3, MAX: 5 },
                LEAF_DENSITY: 0.9
            },
            ACACIA: {
                BIOMES: ['SAVANNA'],
                FREQUENCY: 0.2,
                MIN_HEIGHT: 4,
                MAX_HEIGHT: 6,
                TRUNK_HEIGHT: { MIN: 2, MAX: 4 },
                CANOPY_RADIUS: { MIN: 3, MAX: 5 },
                LEAF_DENSITY: 0.5
            },
            CACTUS: {
                BIOMES: ['DESERT'],
                FREQUENCY: 0.1,
                MIN_HEIGHT: 3,
                MAX_HEIGHT: 6,
                TRUNK_HEIGHT: { MIN: 3, MAX: 6 },
                CANOPY_RADIUS: { MIN: 0, MAX: 0 },
                LEAF_DENSITY: 0
            }
        }
    },
ORES: {
    COAL: {
        SCALE: 0.03,
        THRESHOLD: 0.6,
        MIN_HEIGHT: 5,
        MAX_HEIGHT: BASE_GROUND_LEVEL - 10,
        DEPTH_INFLUENCE: 0.2
    },
    IRON: {
        SCALE: 0.04,
        THRESHOLD: 0.65,
        MIN_HEIGHT: 5,
        MAX_HEIGHT: BASE_GROUND_LEVEL - 20,
        DEPTH_INFLUENCE: 0.15
    },
    GOLD: {
        SCALE: 0.05,
        THRESHOLD: 0.7,
        MIN_HEIGHT: 5,
        MAX_HEIGHT: Math.floor(BASE_GROUND_LEVEL / 2),
        DEPTH_INFLUENCE: 0.3
    },
    DIAMOND: {
        SCALE: 0.06,
        THRESHOLD: 0.75,
        MIN_HEIGHT: 5,
        MAX_HEIGHT: Math.floor(BASE_GROUND_LEVEL / 3),
        DEPTH_INFLUENCE: 0.4
    }
},
    WATER: {
        LEVEL: 62,
        OCEAN_DEPTH_SCALE: 0.001,
        OCEAN_DEPTH_THRESHOLD: -0.3,
        MAX_OCEAN_DEPTH: 30
    },
    OCEAN: {
        SCALE: 0.001,
        THRESHOLD: 0.6,
        BASE_DEPTH: 10,
        DEPTH_RANGE: 30
    },
    STRUCTURES: {
        VILLAGE: {
            FREQUENCY: 0.01,
            MIN_DISTANCE: 500,
            MAX_DISTANCE: 1000
        },
        TEMPLE: {
            FREQUENCY: 0.005,
            MIN_DISTANCE: 1000,
            MAX_DISTANCE: 2000
        }
    }
};

const app = express();
const server = http.createServer(app);

const FRONTEND_URL = process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || "https://minecraft-classic-theta.vercel.app"
    : "http://localhost:8080";

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

//-------------------------- Player --------------------------//
const players = {};

const handleConnection = (socket) => {
    if (Object.keys(players).length >= WORLD_CONFIG.MAX_PLAYERS) {
        socket.emit('serverFull');
        socket.disconnect(true);
        return;
    }
    console.log(`User connected: ${socket.id} (${Object.keys(players).length + 1} players)`);

    // Create a new player
    players[socket.id] = {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },

    };

    // Send world info and player info to the new player
    socket.emit('worldInfo', { config: WORLD_CONFIG });
    socket.emit('playerInfo', players[socket.id]);

    // Send the new player info to all other players
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Send all existing players to the new player
    Object.values(players).forEach(player => {
        if (player.id !== socket.id) {
            socket.emit('newPlayer', player);
        }
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            socket.broadcast.emit('playerMove', players[socket.id]);
        }
    });

    socket.on('disconnect', () => handleDisconnect(socket));
};

const handleDisconnect = (socket) => {
    console.log(`User disconnected: ${socket.id}`);
    if (players[socket.id]) {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    }
};

//-------------------------- End of Player --------------------------//

io.on('connection', handleConnection);

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});