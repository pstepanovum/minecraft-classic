//--------------------------------------------------------------//
//                              Imports
//--------------------------------------------------------------//
import { createPlayer, addPlayerControls} from './player/players.js';
import { createMiniMap } from './player/map.js';
import { WORLD_CONFIG_OFFLINE } from './world/config-offline.js';
import { ChunkManager } from './world/chunk_manager.js';
import { Texture, BlockType } from './world/textures.js';
import { initializeBlockInteractions } from './world/block_interactions.js';

//--------------------------------------------------------------//
//                              Constants
//--------------------------------------------------------------//
const CLIENT_WORLD_CONFIG = {
    CHUNK_SIZE: 16, 
    RENDER_DISTANCE: 3,
    MAX_REACH_DISTANCE: 5
};

const DEFAULT_PLAYER_DATA = {
    id: 'offline-player',
    position: { x: 0, y: 60, z: 0 },
    rotation: 0,
    isFlying: false,
    collisionsEnabled: true
};

const MAX_INSTANCES = CLIENT_WORLD_CONFIG.CHUNK_SIZE ** 3;

//--------------------------------------------------------------//
//                          Scene Elements
//--------------------------------------------------------------//
let scene, camera, cameraOffset, renderer;

//--------------------------------------------------------------//
//                       Player Management
//--------------------------------------------------------------//
let player;
let playerControls = null;
const otherPlayers = {};
let blockManager;

//--------------------------------------------------------------//
//                      Texture Management
//--------------------------------------------------------------//
const textureManager = new Texture(MAX_INSTANCES, CLIENT_WORLD_CONFIG.CHUNK_SIZE);

//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//
const CHUNK = new Map();
let chunkWorker;
let chunkManager;

//--------------------------------------------------------------//
//                       Server & Network
//--------------------------------------------------------------//
let socket;
let isOnline = false;
let worldConfig;
let client_world_config;

//--------------------------------------------------------------//
//                          UI Elements
//--------------------------------------------------------------//
let loadingScreen;
let statusBar;
let serverStatus;

//--------------------------------------------------------------//
//                        State Tracking
//--------------------------------------------------------------//
let isTexturesLoaded = false;
let isPlayerLoaded = false;

//--------------------------------------------------------------//
//                              Textures
//--------------------------------------------------------------//
function createChunkMesh(chunk, chunkX, chunkY, chunkZ) {
    return textureManager.createChunkMesh(chunk, chunkX, chunkY, chunkZ, scene);
}

//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//


function generateInitialChunk() {
    if (!chunkManager || !player) return;
    
    // Set initial player chunk position
    const playerChunkX = Math.floor(player.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    chunkManager.lastPlayerChunkPos = { x: playerChunkX, z: playerChunkZ };
    
    // Start chunk generation
    chunkManager.generateInitialChunk();
}

function initChunkManager() {
    const config = worldConfig || WORLD_CONFIG_OFFLINE;
    
    console.log('Initializing ChunkManager with config:', {
        worldConfig: config,
        clientConfig: CLIENT_WORLD_CONFIG
    });

    chunkManager = new ChunkManager(scene, config, {
        ...CLIENT_WORLD_CONFIG,
        MAX_PROCESSING_TIME: 30,
    });
    chunkManager.setMeshCreationFunction(createChunkMesh);
}

function updateChunk() {
    if (!chunkManager || !player) return;
    chunkManager.updateChunk(player.position);
}

function initWebWorker() {
    chunkWorker = new Worker('./src/web-worker/chunk-worker.js');
    chunkWorker.onmessage = function(e) {
        switch (e.data.type) {
            case 'chunkGenerated':
            case 'chunkUpdated':
                const { chunk, chunkX, chunkY, chunkZ } = e.data;
                // console.log(`Received chunk data for ${chunkX},${chunkY},${chunkZ}`);
                if (chunkManager) {
                    chunkManager.handleChunkData(chunk, chunkX, chunkY, chunkZ);
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
        server_config: worldConfig,
        client_config: CLIENT_WORLD_CONFIG,
        seed: worldConfig?.SEED || Date.now(),
        block_type: BlockType
    };

    console.log('Initializing worker with config:', workerConfig);
    chunkWorker.postMessage(workerConfig);

    if (chunkManager) {
        chunkManager.setChunkWorker(chunkWorker);
    }
}

// In your script.js
function handleWorldInfo(data) {
    // Clear existing state
    CHUNK.clear();
    if (chunkManager) {
        chunkManager.chunks.clear();
    }
    if (chunkWorker) {
        chunkWorker.terminate();
    }
    
    // Set new configuration
    worldConfig = data.config;
    client_world_config = data.client_config || CLIENT_WORLD_CONFIG;
    
    console.log('World configuration:', worldConfig);
    
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
            chunkWorker.postMessage({
                type: 'applyModifications',
                modifications: chunkModifications
            });
        }, 100);
    }
    
    if (player) {
        console.log('Generating initial chunks for player at:', player.position);
        generateInitialChunk();
    }
}

function startGameIfReady() {
    if (isTexturesLoaded && isPlayerLoaded) {
        console.log('Starting game...');
        try {
            if (!chunkManager) {
                console.log('Initializing chunk manager...');
                initChunkManager();
            }
            console.log('Generating initial chunks...');
            generateInitialChunk();
            
            // Initialize block interaction after chunk system is ready
            blockManager = initializeBlockInteractions(player);
            
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
    createLoadingScreen();
    createStatusBar();
    
    updateLoadingMessage('Setting up the scene...');
    setupScene();
    
    updateLoadingMessage('Configuring lighting...');
    setupLighting();
    
    updateLoadingMessage('Setting up event listeners...');
    setupEventListeners();

    updateLoadingMessage('Loading textures...');
    try {
        await textureManager.loadTextureAtlas('./images/texture-pack/texture-atlas.png');
        console.log('Textures loaded successfully');
        isTexturesLoaded = true;
    } catch (error) {
        console.error('Failed to load textures:', error);
    }

    updateLoadingMessage('Checking server connection...');
    const serverAvailable = await checkServerStatus();
    
    if (serverAvailable) {
        updateLoadingMessage('Connecting to server...');
        await setupSocketConnection();
        await requestWorldInfo();
    } else {
        console.log("Server unavailable. Starting in offline mode...");
        updateLoadingMessage('Starting in offline mode...');
        startOfflineMode();
    }

    updateLoadingMessage('Preparing the world...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    removeLoadingScreen();
    
    startGameIfReady();

    setTimeout(showIntroPopup, 1000);
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
    isOnline = false;
    updateServerStatus(false);
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
    player = createPlayer(scene, {
        ...playerData,
        position
    }, './images/skins/4.png', true);
    
    // Initialize camera position based on player position
    updateCamera(position);

    // Set player state
    isPlayerLoaded = true;
    
    // Try to start game if other conditions are met
    startGameIfReady();
}

function handleNewPlayer(playerData) {
    if (playerData.id !== socket.id) {
        const newPlayer = createPlayer(scene, playerData, './images/skins/4.png', false);
        otherPlayers[playerData.id] = newPlayer;
    }
}

function handlePlayerMove(playerData) {
    if (playerData.id === socket.id) {
        if (player) {
            player.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
            if (player.children[0]) {
                player.children[0].rotation.y = playerData.rotation; // Update model rotation
            }
            player.isFlying = playerData.isFlying;
            player.collisionsEnabled = playerData.collisionsEnabled;
            updateCamera(player.position);
        }
    } else if (otherPlayers[playerData.id]) {
        const otherPlayer = otherPlayers[playerData.id];
        otherPlayer.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        if (otherPlayer.children[0]) {
            otherPlayer.children[0].rotation.y = playerData.rotation; // Update other player model rotation
        }
        otherPlayer.isFlying = playerData.isFlying;
        otherPlayer.collisionsEnabled = playerData.collisionsEnabled;
    }
}

function handlePlayerDisconnected(playerId) {
    if (otherPlayers[playerId]) {
        scene.remove(otherPlayers[playerId]);
        delete otherPlayers[playerId];
    }
}

export function spawn(x, z) {
    return 60;
}

//--------------------------------------------------------------//
//                       Game Loop
//--------------------------------------------------------------//
function animate() {
    if (!playerControls) {
        playerControls = addPlayerControls(player, camera, scene, renderer.domElement);
    }
    
    const updateMiniMap = createMiniMap(scene, player);
    
    renderer.setAnimationLoop(() => {
        // Modified condition to allow controls in offline mode
        if (playerControls && player) {
            // Check if online mode with socket or offline mode
            if (!isOnline || (isOnline && player.userData.id === socket?.id)) {
                playerControls();
            }
        }
        
        // Update block manager
        if (blockManager) {
            blockManager.update();
        }
        
        updateMiniMap();
        updateChunk();
        
        const playerLight = scene.getObjectByProperty('type', 'PointLight');
        if (playerLight && player) {
            playerLight.position.copy(player.position).add(new THREE.Vector3(0, 10, 0));
        }
        
        const directionalLight = scene.getObjectByProperty('type', 'DirectionalLight');
        if (directionalLight && player) {
            directionalLight.position.set(
                player.position.x + 50,
                player.position.y + 100,
                player.position.z + 50
            );
            directionalLight.target.position.copy(player.position);
            directionalLight.target.updateMatrixWorld();
            directionalLight.shadow.camera.updateProjectionMatrix();
        }

        // Only emit position if online
        if (isOnline && socket && player && player.userData.id === socket.id) {
            socket.emit('playerMove', {
                position: player.position,
                rotation: player.yaw,
                isFlying: player.isFlying,
                collisionsEnabled: player.collisionsEnabled
            });
        }

        renderer.render(scene, camera);
    });
}


//--------------------------------------------------------------//
//                       Socket Connection
//--------------------------------------------------------------//
function setupSocketConnection() {
    const serverUrl = CONFIG.SERVER_URL;
    
    socket = io(serverUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });

    socket.on('worldInfo', handleWorldInfo);
    socket.on('playerInfo', handlePlayerInfo);
    socket.on('newPlayer', handleNewPlayer);
    socket.on('playerMove', handlePlayerMove);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('blockUpdate', (data) => {
        if (chunkManager && chunkWorker) {
            const { position, type, playerId } = data;
            
            // Skip if this is our own modification
            if (playerId === socket.id) return;
            
            // Convert absolute position to chunk coordinates
            const chunkX = Math.floor(position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
            const chunkY = Math.floor(position.y / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
            const chunkZ = Math.floor(position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
            
            const localX = ((position.x % CLIENT_WORLD_CONFIG.CHUNK_SIZE) + CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE;
            const localY = ((position.y % CLIENT_WORLD_CONFIG.CHUNK_SIZE) + CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE;
            const localZ = ((position.z % CLIENT_WORLD_CONFIG.CHUNK_SIZE) + CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE;
    
            chunkWorker.postMessage({
                type: 'updateBlock',
                chunkX,
                chunkY,
                chunkZ,
                localX,
                localY,
                localZ,
                blockType: type === 'remove' ? 0 : type
            });
        }
    });

    socket.on('bulkBlockUpdate', (modifications) => {
        if (blockManager) {
            blockManager.applyModifications(modifications);
        }
    });

    socket.on('connect', async () => {
        console.log('Connected to server');
        updateServerStatus(true);
        
        // Request fresh world info including modifications
        await requestWorldInfo();
    });

    socket.on('reconnect', async (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        updateServerStatus(true);
        
        // Request fresh world info including modifications
        await requestWorldInfo();
    });
    

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateServerStatus(false);
    });
}

async function requestWorldInfo() {
    return new Promise((resolve) => {
        socket.emit('requestWorldInfo');
        socket.once('worldInfo', (data) => {
            handleWorldInfo(data);
            resolve();
        });
    });
}


//--------------------------------------------------------------//
//                       Server Status
//--------------------------------------------------------------//
function createLoadingScreen() {
    loadingScreen = document.createElement('div');
    loadingScreen.id = 'loading-screen';
    loadingScreen.innerHTML = `
        <div id="loading-content">
            <div id="loading-spinner"></div>
            <p id="loading-message">Checking server connection...</p>
        </div>
    `;
    document.body.appendChild(loadingScreen);
}

function updateLoadingMessage(message) {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
}

function removeLoadingScreen() {
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.remove();
        }, 500); // Matches the transition duration in CSS
    }
}

function createStatusBar() {
    statusBar = document.createElement('div');
    statusBar.id = 'status-bar';
    statusBar.style.opacity = '0';
    statusBar.style.transition = 'opacity 0.5s ease-in-out';

    serverStatus = document.createElement('span');
    serverStatus.id = 'server-status';

    statusBar.appendChild(document.createTextNode('Server Status: '));
    statusBar.appendChild(serverStatus);

    document.body.appendChild(statusBar);
}

function updateServerStatus(online) {
    isOnline = online;
    serverStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
    serverStatus.className = online ? 'online' : 'offline';
    statusBar.style.opacity = '1';
}

async function checkServerStatus() {
    try {
        const socket = io(CONFIG.SERVER_URL, {
            timeout: 5000,
            autoConnect: false
        });

        return new Promise((resolve) => {
            socket.on('connect', () => {
                socket.disconnect();
                updateServerStatus(true);
                resolve(true);
            });

            socket.on('connect_error', () => {
                socket.disconnect();
                updateServerStatus(false);
                resolve(false);
            });

            socket.connect();
        });
    } catch (error) {
        console.error('Error checking server status:', error);
        updateServerStatus(false);
        return false;
    }
}

function showIntroPopup() {
    const popup = document.getElementById('intro-popup');
    popup.style.display = 'block';

    const closeButton = document.getElementById('close-popup');
    closeButton.addEventListener('click', hideIntroPopup);

    window.addEventListener('click', function(event) {
        if (event.target === popup) {
            hideIntroPopup();
        }
    });
}

function hideIntroPopup() {
    const popup = document.getElementById('intro-popup');
    popup.style.display = 'none';
}


//--------------------------------------------------------------//
//                       Scene Setup
//--------------------------------------------------------------//
function setupScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    cameraOffset = new THREE.Vector3(0, 3, 5);
    camera.position.set(0, 20, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.setClearColor(0xFFFFFF);
    document.body.appendChild(renderer.domElement);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Directional light: Increased intensity, refined shadow settings
    const directionalLight = new THREE.DirectionalLight(0xfff5e5, 1.0);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;

    // Improve shadow quality and performance
    directionalLight.shadow.mapSize.width = 4096; // Higher resolution for sharper shadows
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -150;
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    directionalLight.shadow.bias = -0.0001; // Minimal shadow acne correction
    directionalLight.shadow.normalBias = 0.05;
    directionalLight.shadow.radius = 2; // Soft shadow edges
    
    scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x545454, 0.4);
    scene.add(hemisphereLight);

    const playerLight = new THREE.PointLight(0xffffff, 0.7, 20);
    playerLight.position.set(0, 2, 0);
    scene.add(playerLight);
}

function updateCamera(playerPosition) {
    camera.position.copy(playerPosition).add(cameraOffset);
    camera.lookAt(playerPosition);
}

//--------------------------------------------------------------//
//                       Event Listeners
//--------------------------------------------------------------//
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);

}

window.addEventListener('load', init);

export {
    CLIENT_WORLD_CONFIG,

    // Core scene elements
    scene,
    camera,
    renderer,
    
    // World management
    chunkManager,
    chunkWorker,
    
    // Player and multiplayer
    player,
    socket,
    isOnline
};