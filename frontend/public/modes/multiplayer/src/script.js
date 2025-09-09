// ==============================================================
// FILE: frontend/public/modes/multiplayer/src/script.js
// ==============================================================

//--------------------------------------------------------------//
//                              Imports
//--------------------------------------------------------------//
import { createPlayer, addPlayerControls } from '../../../src/player/players.js';
import { createMiniMap } from '../../../src/player/map.js';
import { WORLD_CONFIG_OFFLINE } from '../../../src/world/config-offline.js';
import { ChunkManager } from '../../../src/world/chunk_manager.js';
import { Texture, BlockType } from '../../../src/world/textures.js';
import { initializeBlockInteractions } from '../../../src/world/block_interactions.js';

// Import the game state module for centralized state management
import * as GameState from '../../../src/core/game-state.js';


import { getFPSCounter } from '../../../src/core/utils/fps-counter.js';

//--------------------------------------------------------------//
//                       Configuration
//--------------------------------------------------------------//
// Use GameState's CLIENT_WORLD_CONFIG
const CLIENT_WORLD_CONFIG = GameState.CLIENT_WORLD_CONFIG;

// Use GameState's DEFAULT_PLAYER_DATA
const DEFAULT_PLAYER_DATA = GameState.DEFAULT_PLAYER_DATA;

const MAX_INSTANCES = (CLIENT_WORLD_CONFIG.CHUNK_SIZE) ** 3;

//--------------------------------------------------------------//
//                      Texture Management
//--------------------------------------------------------------//
const textureManager = new Texture(MAX_INSTANCES, CLIENT_WORLD_CONFIG.CHUNK_SIZE);

//--------------------------------------------------------------//
//                              Textures
//--------------------------------------------------------------//
function createChunkMesh(chunk, chunkX, chunkY, chunkZ) {
    return textureManager.createChunkMesh(chunk, chunkX, chunkY, chunkZ, GameState.scene);
}

//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//
function generateInitialChunk() {
    if (!GameState.chunkManager || !GameState.player) return;
    
    // Set initial player chunk position
    const playerChunkX = Math.floor(GameState.player.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const playerChunkZ = Math.floor(GameState.player.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    GameState.chunkManager.lastPlayerChunkPos = { x: playerChunkX, z: playerChunkZ };
    
    // Start chunk generation
    GameState.chunkManager.generateInitialChunk();
}

function initChunkManager() {
    const config = GameState.worldConfig || WORLD_CONFIG_OFFLINE;
    
    console.log('Initializing ChunkManager with config:', {
        worldConfig: config,
        clientConfig: CLIENT_WORLD_CONFIG
    });

    const chunkManager = new ChunkManager(GameState.scene, config, {
        ...CLIENT_WORLD_CONFIG,
        MAX_PROCESSING_TIME: 30,
    });
    chunkManager.setMeshCreationFunction(createChunkMesh);
    GameState.setChunkManager(chunkManager);
}

function updateChunk() {
    if (!GameState.chunkManager || !GameState.player) return;
    GameState.chunkManager.updateChunk(GameState.player.position);
}

function initWebWorker() {
    const chunkWorker = new Worker('../../../src/web-worker/chunk-worker.js');
    chunkWorker.onmessage = function(e) {
        switch (e.data.type) {
            case 'chunkGenerated':
            case 'chunkUpdated':
                const { chunk, chunkX, chunkY, chunkZ } = e.data;
                if (GameState.chunkManager) {
                    GameState.chunkManager.handleChunkData(chunk, chunkX, chunkY, chunkZ);
                    
                    // Publish event for chunk loaded
                    GameState.publish(GameState.EVENTS.CHUNK_LOADED, { 
                        chunk, chunkX, chunkY, chunkZ 
                    });
                } else {
                    console.warn('ChunkManager not initialized when receiving chunk data');
                }
                break;
            case 'error':
                console.error('Chunk generation error:', e.data.error);
                break;
        }
    };

    // Initialize worker with complete configuration
    const workerConfig = {
        type: 'init', 
        server_config: GameState.worldConfig,
        client_config: CLIENT_WORLD_CONFIG,
        seed: GameState.worldConfig?.SEED || Date.now(),
        block_type: BlockType,
    };

    console.log('Initializing worker with config:', workerConfig);
    chunkWorker.postMessage(workerConfig);

    if (GameState.chunkManager) {
        GameState.chunkManager.setChunkWorker(chunkWorker);
    }
    GameState.setChunkWorker(chunkWorker);
}

function handleWorldInfo(data) {
    // Clear existing state
    GameState.clearChunkMap();
    if (GameState.chunkManager) {
        GameState.chunkManager.chunks.clear();
    }
    if (GameState.chunkWorker) {
        GameState.chunkWorker.terminate();
    }
    
    // Set new configuration
    GameState.setWorldConfig(data.config);
    GameState.setClientWorldConfig(data.client_config || CLIENT_WORLD_CONFIG);
    
    console.log('World configuration:', data.config);
    
    // Initialize systems
    initChunkManager();
    initWebWorker();
    
    // Make sure to wait for worker initialization before sending modifications
    if (data.modifications && data.modifications.length > 0) {
        console.log(`Received ${data.modifications.length} modifications from server`);
        
        // Convert server modifications to chunk format
        const chunkModifications = data.modifications.map(mod => ({
            chunkX: Math.floor(mod.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
            chunkY: Math.floor(mod.position.y / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
            chunkZ: Math.floor(mod.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
            localX: ((mod.position.x % CLIENT_WORLD_CONFIG.CHUNK_SIZE) + CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE,
            localY: ((mod.position.y % CLIENT_WORLD_CONFIG.CHUNK_SIZE) + CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE,
            localZ: ((mod.position.z % CLIENT_WORLD_CONFIG.CHUNK_SIZE) + CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE,
            blockType: mod.blockType
        }));

        // Send to worker after a short delay to ensure it's initialized
        setTimeout(() => {
            GameState.chunkWorker.postMessage({
                type: 'applyModifications',
                modifications: chunkModifications
            });
        }, 100);
    }
    
    if (GameState.player) {
        console.log('Generating initial chunks for player at:', GameState.player.position);
        generateInitialChunk();
    }
}

function startGameIfReady() {
    if (GameState.isGameReady()) {
        console.log('Starting game...');
        try {
            if (!GameState.chunkManager) {
                console.log('Initializing chunk manager...');
                initChunkManager();
            }
            console.log('Generating initial chunks...');
            generateInitialChunk();
            
            // Initialize block interaction after chunk system is ready
            const blockManager = initializeBlockInteractions(GameState.player);
            GameState.setBlockManager(blockManager);
            
            // Publish game ready event
            GameState.publish(GameState.EVENTS.GAME_READY, true);
            
            animate();
        } catch (error) {
            console.error('Error starting game:', error);
        }
    }
}

//--------------------------------------------------------------//
//                       Initialization
//--------------------------------------------------------------//
async function init() {
    const updateFPS = getFPSCounter();
    GameState.setFPSCounter(updateFPS);

    try {
        // Create UI elements using GameState functions
        GameState.createLoadingScreen();
        GameState.createStatusBar();
        
        GameState.updateLoadingMessage('Setting up the scene...');
        // Use centralized scene setup
        GameState.setupScene(WORLD_CONFIG_OFFLINE.SIZE);
        
        GameState.updateLoadingMessage('Configuring lighting...');
        // Use centralized lighting setup
        GameState.setupLighting();
        
        GameState.updateLoadingMessage('Setting up event listeners...');
        setupEventListeners();
        
        // Add CSS to disable text selection
        const style = document.createElement('style');
        style.innerHTML = `
            * {
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
            }
        `;
        document.head.appendChild(style);
    
        GameState.updateLoadingMessage('Loading textures...');
        try {
            // In your script where textureManager is loading the texture
            await textureManager.loadTextureAtlas('../../../assets/images/texture-pack/texture-atlas.png');
            console.log('Textures loaded successfully');
            GameState.setTexturesLoaded(true);
        } catch (error) {
            console.error('Failed to load textures:', error);
        }
    
        GameState.updateLoadingMessage('Checking server connection...');
        const serverAvailable = await GameState.checkServerStatus(CONFIG.SERVER_URL);
        
        if (serverAvailable) {
            GameState.updateLoadingMessage('Connecting to server...');
            await setupSocketConnection();
            await requestWorldInfo();
        } else {
            console.log("Server unavailable. Starting in offline mode...");
            GameState.updateLoadingMessage('Starting in offline mode...');
            startOfflineMode();
        }
    
        // Initialize web worker first
        GameState.updateLoadingMessage('Initializing world generator...');
        initWebWorker();
    
        // Wait a moment for worker to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        GameState.setSchematicsLoaded(true);
    
        GameState.updateLoadingMessage('Preparing the world...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        GameState.removeLoadingScreen();
        
        startGameIfReady();
        setTimeout(GameState.showIntroPopup, 1000);
    }
    catch (error) {
        console.error('Initialization failed:', error);
        GameState.updateLoadingMessage('Failed to initialize game');
    }
}

function startOfflineMode() {
    // Initialize world with offline config
    handleWorldInfo({ 
        config: WORLD_CONFIG_OFFLINE, 
        client_config: CLIENT_WORLD_CONFIG 
    });
    
    // Initialize offline player with default data
    handlePlayerInfo(DEFAULT_PLAYER_DATA);
    
    // Set offline status
    GameState.updateServerStatus(false);
}

//--------------------------------------------------------------//
//                       Player Management
//--------------------------------------------------------------//
function handlePlayerInfo(playerData) {
    const position = new THREE.Vector3(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
    );

    // Create player with provided or default position
    const player = createPlayer(GameState.scene, {
        ...playerData,
        position
    }, '../../../assets/images/skins/4.png', true);

    GameState.setPlayer(player);
    GameState.setPlayerLoaded(true);
    
    // Initialize camera position based on player position
    GameState.updateCamera(position);
    
    // Try to start game if other conditions are met
    startGameIfReady();
}

//--------------------------------------------------------------//
//                       Game Loop
//--------------------------------------------------------------//
function animate() {
    if (!GameState.playerControls) {
        const controls = addPlayerControls(
            GameState.player, 
            GameState.camera, 
            GameState.scene, 
            GameState.renderer.domElement
        );
        GameState.setPlayerControls(controls);
    }
    
    const updateMiniMap = createMiniMap(GameState.scene, GameState.player);
    let sceneChanged = true; // Flag to track if the scene has changed
    let updateCounter = 0; // Counter to throttle updates

    GameState.renderer.setAnimationLoop(() => {
        // Update FPS counter - MOVED INSIDE the animation loop
        if (GameState.fpsCounter) {
            GameState.fpsCounter();
        }
        
        // Modified condition to allow controls in offline mode
        if (GameState.playerControls && GameState.player) {
            // Check if online mode with socket or offline mode
            if (!GameState.isOnline || (GameState.isOnline && GameState.player.userData.id === GameState.socket?.id)) {
                GameState.playerControls();
                sceneChanged = true; // Mark scene as changed
            }
        }
        
        // Update block manager
        if (GameState.blockManager) {
            GameState.blockManager.update();
            sceneChanged = true; // Mark scene as changed
        }
        
        // Throttle updates to every 5 frames
        if (updateCounter % 5 === 0) {
            updateMiniMap();
            updateChunk();
            sceneChanged = true; // Mark scene as changed
        }
        updateCounter++;

        const playerLight = GameState.scene.getObjectByProperty('type', 'PointLight');
        if (playerLight && GameState.player) {
            playerLight.position.copy(GameState.player.position).add(new THREE.Vector3(0, 10, 0));
            sceneChanged = true; // Mark scene as changed
        }
        
        const directionalLight = GameState.scene.getObjectByProperty('type', 'DirectionalLight');
        if (directionalLight && GameState.player) {
            directionalLight.position.set(
                GameState.player.position.x + 50,
                GameState.player.position.y + 100,
                GameState.player.position.z + 50
            );
            directionalLight.target.position.copy(GameState.player.position);
            directionalLight.target.updateMatrixWorld();
            directionalLight.shadow.camera.updateProjectionMatrix();
            sceneChanged = true; // Mark scene as changed
        }

        // Only emit position if online
        if (GameState.isOnline && GameState.socket && GameState.player && GameState.player.userData.id === GameState.socket.id) {
            GameState.socket.emit('playerMove', {
                position: GameState.player.position,
                rotation: GameState.player.yaw,
                isFlying: GameState.player.isFlying,
                collisionsEnabled: GameState.player.collisionsEnabled
            });
        }

        // Only render if the scene has changed
        if (sceneChanged) {
            GameState.renderer.render(GameState.scene, GameState.camera);
            sceneChanged = false; // Reset the flag
        }
    });
}

//--------------------------------------------------------------//
//                       Socket Connection
//--------------------------------------------------------------//
function setupSocketConnection() {
    const serverUrl = CONFIG.SERVER_URL;
    
    const socket = io(serverUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });

    // Basic connection events
    socket.on('connect', async () => {
        console.log('Connected to server with ID:', socket.id);
        GameState.updateServerStatus(true);
        
        // Request fresh world info including modifications
        await requestWorldInfo();
        
        // Inform the server about our player joining
        socket.emit('playerJoin', {
            id: socket.id,
            position: GameState.player ? GameState.player.position : GameState.spawn(),
            rotation: GameState.player ? GameState.player.yaw : 0,
            isFlying: GameState.player ? GameState.player.isFlying : false,
            collisionsEnabled: GameState.player ? GameState.player.collisionsEnabled : true
        });
        
        // Request current players list
        socket.emit('requestPlayers');
    });

    socket.on('reconnect', async (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        GameState.updateServerStatus(true);
        
        // Request fresh world info including modifications
        await requestWorldInfo();
        
        // Inform the server about our player rejoining
        if (GameState.player) {
            socket.emit('playerJoin', {
                id: socket.id,
                position: GameState.player.position,
                rotation: GameState.player.yaw,
                isFlying: GameState.player.isFlying,
                collisionsEnabled: GameState.player.collisionsEnabled
            });
        }
        
        // Request current players list
        socket.emit('requestPlayers');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        GameState.updateServerStatus(false);
        
        // Clear other players when disconnected
        Object.keys(GameState.otherPlayers).forEach(playerId => {
            GameState.scene.remove(GameState.otherPlayers[playerId]);
            GameState.removeOtherPlayer(playerId);
        });
    });

    // World and block events
    socket.on('worldInfo', handleWorldInfo);
    
    socket.on('blockUpdate', (data) => {
        if (GameState.chunkManager && GameState.chunkWorker) {
            const { position, type, playerId } = data;
            
            // Skip if this is our own modification
            if (playerId === socket.id) return;
            
            // Use queueBlockUpdate instead of direct update for better performance
            if (typeof GameState.chunkManager.queueBlockUpdate === 'function') {
                // Use the queue system if available (using the fixed ChunkManager)
                GameState.chunkManager.queueBlockUpdate(
                    position.x,
                    position.y,
                    position.z,
                    type === 'remove' ? 0 : type,
                    true // fromNetwork flag
                );
            } else {
                // Fallback to direct update if needed (for compatibility)
                GameState.chunkManager.updateBlock(
                    position.x,
                    position.y,
                    position.z,
                    type === 'remove' ? 0 : type
                );
            }
            
            // Publish block updated event
            GameState.publish(GameState.EVENTS.BLOCK_UPDATED, {
                position,
                type,
                playerId
            });
        }
    });

    socket.on('bulkBlockUpdate', (modifications) => {
        if (GameState.chunkManager) {
            GameState.chunkManager.applyNetworkModifications(modifications);
        }
    });

    // Player events
    socket.on('playerInfo', handlePlayerInfo);
    
    socket.on('newPlayer', (playerData) => {
        console.log('New player joined:', playerData.id);
        if (playerData.id !== socket.id) {
            const skinPath = '../../../assets/images/skins/4.png';  // Default skin
            const newPlayer = createPlayer(GameState.scene, playerData, skinPath, false);
            GameState.addOtherPlayer(playerData.id, newPlayer);
            
            // Publish player connected event
            GameState.publish(GameState.EVENTS.PLAYER_CONNECTED, playerData);
        }
    });
    
    socket.on('playerMove', (playerData) => {
        if (playerData.id === socket.id) {
            // For own player, just sync server position if needed
            if (GameState.player) {
                // Only update if significant difference to avoid jitter
                const posDiff = new THREE.Vector3(
                    playerData.position.x - GameState.player.position.x,
                    playerData.position.y - GameState.player.position.y,
                    playerData.position.z - GameState.player.position.z
                );
                
                if (posDiff.lengthSq() > 1) {
                    // Server correction is large, apply it
                    GameState.player.position.set(
                        playerData.position.x,
                        playerData.position.y,
                        playerData.position.z
                    );
                }
                
                GameState.player.isFlying = playerData.isFlying;
                GameState.player.collisionsEnabled = playerData.collisionsEnabled;
                
                // Update camera position
                GameState.updateCamera(GameState.player.position);
            }
        } else {
            // For other players, update their position and animation
            const otherPlayer = GameState.otherPlayers[playerData.id];
            if (otherPlayer) {
                otherPlayer.position.set(
                    playerData.position.x,
                    playerData.position.y,
                    playerData.position.z
                );
                
                // Update player model rotation
                otherPlayer.yaw = playerData.rotation;
                if (otherPlayer.children[0]) {
                    otherPlayer.children[0].rotation.y = playerData.rotation;
                }
                
                // Set state
                otherPlayer.isFlying = playerData.isFlying;
                otherPlayer.collisionsEnabled = playerData.collisionsEnabled;
                
                // Determine if player is moving for animation
                if (!otherPlayer.lastPosition) {
                    otherPlayer.lastPosition = new THREE.Vector3();
                }
                
                const posDiff = new THREE.Vector3(
                    playerData.position.x - otherPlayer.lastPosition.x,
                    playerData.position.y - otherPlayer.lastPosition.y,
                    playerData.position.z - otherPlayer.lastPosition.z
                );
                
                const isMoving = posDiff.lengthSq() > 0.0001;
                otherPlayer.isMoving = isMoving;
                
                // Save position for next comparison
                otherPlayer.lastPosition.copy(otherPlayer.position);
            }
        }
    });
    
    socket.on('playerDisconnected', (playerId) => {
        console.log('Player disconnected:', playerId);
        if (GameState.otherPlayers[playerId]) {
            GameState.scene.remove(GameState.otherPlayers[playerId]);
            GameState.removeOtherPlayer(playerId);
            
            // Publish player disconnected event
            GameState.publish(GameState.EVENTS.PLAYER_DISCONNECTED, playerId);
        }
    });
    
    socket.on('currentPlayers', (players) => {
        console.log(`Received ${players.length} current players`);
        
        // Clear existing other players first
        Object.keys(GameState.otherPlayers).forEach(playerId => {
            if (playerId !== socket.id) {
                GameState.scene.remove(GameState.otherPlayers[playerId]);
                GameState.removeOtherPlayer(playerId);
            }
        });
        
        // Add all current players
        players.forEach(playerData => {
            if (playerData.id !== socket.id) {
                const skinPath = '../../../assets/images/skins/4.png';  // Default skin
                const newPlayer = createPlayer(GameState.scene, playerData, skinPath, false);
                GameState.addOtherPlayer(playerData.id, newPlayer);
            }
        });
        
        // Update the player count display
        GameState.updatePlayerCount();
    });

    // Store socket in GameState
    GameState.setSocket(socket);
    GameState.setOnlineStatus(true);
    
    return socket;
}

async function requestWorldInfo() {
    return new Promise((resolve) => {
        if (!GameState.socket) {
            console.warn('Cannot request world info: Socket not available');
            resolve(null);
            return;
        }
        
        GameState.socket.emit('requestWorldInfo');
        GameState.socket.once('worldInfo', (data) => {
            handleWorldInfo(data);
            resolve(data);
        });
    });
}

function initializeMultiplayer() {
    // Subscribe to player events
    GameState.subscribe(GameState.EVENTS.PLAYER_CONNECTED, (playerData) => {
        console.log(`Player connected: ${playerData.id}`);
        GameState.updatePlayerCount();
        
        // Show notification
        GameState.showNotification(`Player ${playerData.id} joined`);
    });
    
    GameState.subscribe(GameState.EVENTS.PLAYER_DISCONNECTED, (playerId) => {
        console.log(`Player disconnected: ${playerId}`);
        GameState.updatePlayerCount();
        
        // Show notification
        GameState.showNotification(`Player ${playerId} left`);
    });
    
    // Set up periodic player count updates
    setInterval(GameState.updatePlayerCount, 5000);
    
    // Add styles for multiplayer UI elements
    addMultiplayerStyles();
}

// Add CSS for the multiplayer features
function addMultiplayerStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #notifications {
            pointer-events: none;
        }
        
        .player-label {
            font-family: sans-serif;
            font-size: 12px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
            user-select: none;
        }
        
        #player-count {
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            margin-top: 5px;
        }
        
        #player-list {
            position: absolute;
            top: 60px;
            right: 10px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px;
            border-radius: 5px;
            display: none;
            font-family: sans-serif;
            z-index: 1000;
        }
        
        #player-list.visible {
            display: block;
        }
        
        #player-list h3 {
            margin-top: 0;
            margin-bottom: 5px;
        }
        
        #player-list ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        
        #player-list li {
            padding: 3px 0;
        }
        
        #view-toggle {
            position: absolute;
            bottom: 150px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            z-index: 1000;
        }
    `;
    document.head.appendChild(style);
}


//--------------------------------------------------------------//
//                       Event Listeners
//--------------------------------------------------------------//
function setupEventListeners() {
    window.addEventListener('resize', GameState.handleWindowResize);
    
    // Call initializeMultiplayer to set up multiplayer event handlers
    initializeMultiplayer();

}

document.addEventListener('DOMContentLoaded', () => {
    const closeButton = document.getElementById('close-popup');
    const introPopup = document.getElementById('intro-popup');

    if (closeButton && introPopup) {
        closeButton.addEventListener('click', () => {
            introPopup.style.display = 'none';
        });

        closeButton.addEventListener('touchstart', (event) => {
            introPopup.style.display = 'none';
            event.preventDefault(); // Prevent default behavior
        });
    }
});

window.addEventListener('load', () => {
    init();

    const canvas = document.querySelector('canvas'); 
    if (!canvas) return;

    function requestFullscreen() {
        if (canvas.requestFullscreen) {
            canvas.requestFullscreen();
        } else if (canvas.mozRequestFullScreen) { // Firefox
            canvas.mozRequestFullScreen();
        } else if (canvas.webkitRequestFullscreen) { // Chrome, Safari and Opera
            canvas.webkitRequestFullscreen();
        } else if (canvas.msRequestFullscreen) { // IE/Edge
            canvas.msRequestFullscreen();
        }
    }

    function onWindowResize() {
        if (document.fullscreenElement) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        } else {
            canvas.style.width = '';
            canvas.style.height = '';
        }
    }

    // Automatically request fullscreen on load
    requestFullscreen();

    // Adjust canvas size when entering or exiting fullscreen
    document.addEventListener('fullscreenchange', onWindowResize);
    document.addEventListener('mozfullscreenchange', onWindowResize);
    document.addEventListener('webkitfullscreenchange', onWindowResize);
    document.addEventListener('msfullscreenchange', onWindowResize);

    // Prevent zoom on double-tap
    document.addEventListener('touchstart', function(event) {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    // Prevent zoom on double-click
    document.addEventListener('dblclick', function(event) {
        event.preventDefault();
    }, { passive: false });

    // Hide the address bar on mobile devices
    window.scrollTo(0, 1);
    window.addEventListener('resize', () => {
        setTimeout(() => {
            window.scrollTo(0, 1);
        }, 0);
    });
});

// Export via GameState module instead of direct exports
export { CLIENT_WORLD_CONFIG };