const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createNoise2D } = require('simplex-noise');
const alea = require('alea');
const ChunkManager = require('./server/ChunkManager.js');

// Constants
const PORT = process.env.PORT || 3000;
const SEED = '1';
const DAY_CYCLE_SPEED = 0.001;
const UPDATE_INTERVAL = 1000 / 60; // ~60 FPS

// Server setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Game state
const players = {};
const prng = alea(SEED);
const noise2D = createNoise2D(prng);
const chunkManager = new ChunkManager(noise2D, 15, 0, 0.5);
let dayCycleTime = 0;
const MAX_PLAYERS = 5;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Lighting utilities
const updateLighting = () => {
    dayCycleTime = (dayCycleTime + DAY_CYCLE_SPEED) % 1;

    const ambientLightIntensity = Math.sin(dayCycleTime * Math.PI) * 0.5;
    const directionalLightIntensity = Math.max(0, Math.sin((dayCycleTime - 0.25) * Math.PI * 2));

    const dayColor = { r: 255, g: 193, b: 7 };
    const nightColor = { r: 92, g: 92, b: 92 };

    const lightColor = {
        r: Math.round(dayColor.r * (1 - dayCycleTime) + nightColor.r * dayCycleTime),
        g: Math.round(dayColor.g * (1 - dayCycleTime) + nightColor.g * dayCycleTime),
        b: Math.round(dayColor.b * (1 - dayCycleTime) + nightColor.b * dayCycleTime),
    };

    const lightingData = {
        ambientLightIntensity,
        directionalLightIntensity,
        directionalLightColor: `#${((1 << 24) + (lightColor.r << 16) + (lightColor.g << 8) + lightColor.b).toString(16).slice(1)}`
    };

    io.emit('updateLighting', lightingData);
};

// Player utilities
const updateChunksForPlayer = (socket, position) => {
    const chunksToUpdate = chunkManager.getChunksAroundPlayer(position.x, position.z);
    socket.emit('updateChunks', chunksToUpdate);
};

// Socket event handlers
const handleConnection = (socket) => {
    if (Object.keys(players).length >= MAX_PLAYERS) {
        socket.emit('serverFull');
        socket.disconnect(true);
        return;
    }
    console.log(`User connected: ${socket.id}`);

    players[socket.id] = { x: 0, y: 10, z: 0 };

    socket.emit('initialChunks', chunkManager.getChunksAroundPlayer(0, 0));
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, position: players[socket.id] });

    socket.on('disconnect', () => handleDisconnect(socket));
    socket.on('playerMoved', (position) => handlePlayerMove(socket, position));
    socket.on('removeBlock', (blockPosition) => handleRemoveBlock(socket, blockPosition));
    socket.on('getInitialState', (playerPosition) => handleGetInitialState(socket, playerPosition));
    socket.on('updateLighting', (lightingData) => handleUpdateLighting(socket, lightingData));
};

const handleDisconnect = (socket) => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
};

const handlePlayerMove = (socket, position) => {
    if (!position) return;

    players[socket.id] = position;
    socket.broadcast.emit('updatePlayer', { id: socket.id, position });
    updateChunksForPlayer(socket, position);
};

const handleRemoveBlock = (socket, blockPosition) => {
    if (!blockPosition) return;

    const removed = chunkManager.removeBlock(blockPosition);
    if (removed) {
        io.emit('blockRemoved', blockPosition);
    }
};

const handleGetInitialState = (socket, playerPosition) => {
    const chunks = chunkManager.getChunksAroundPlayer(playerPosition.x, playerPosition.z);
    const removedBlocks = chunkManager.getRemovedBlocks();
    socket.emit('initialState', { chunks, removedBlocks });
};

const handleUpdateLighting = (socket, lightingData) => {
    // This function seems to be client-side. Consider removing or implementing server-side logic if needed.
    console.log('Received lighting update:', lightingData);
};

// Set up Socket.IO connection handler
io.on('connection', handleConnection);

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Start the lighting update loop
setInterval(updateLighting, UPDATE_INTERVAL);