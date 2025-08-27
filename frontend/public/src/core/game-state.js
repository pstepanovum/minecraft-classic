// src/core/game-state.js

//--------------------------------------------------------------//
//                           Configuration
//--------------------------------------------------------------//
export const CLIENT_WORLD_CONFIG = {
    CHUNK_SIZE: 16,
    RENDER_DISTANCE: 4,
};

export const DEFAULT_PLAYER_DATA = {
    id: 'offline-player',
    position: { x: 0, y: 60, z: 0 },
    rotation: 0,
    isFlying: false,
    collisionsEnabled: true
};

//--------------------------------------------------------------//
//                         Scene Elements
//--------------------------------------------------------------//
export let scene = null;
export let camera = null;
export let renderer = null;
export let cameraOffset = new THREE.Vector3(0, 3, 5);

//--------------------------------------------------------------//
//                       Player Management
//--------------------------------------------------------------//
export let player = null;
export let playerControls = null;
export let otherPlayers = {};
export let blockManager = null;

//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//
export let chunkManager = null;
export let chunkWorker = null;
export const CHUNK = new Map();

//--------------------------------------------------------------//
//                       Server & Network
//--------------------------------------------------------------//
export let socket = null;
export let isOnline = false;
export let worldConfig = null;
export let client_world_config = CLIENT_WORLD_CONFIG; // Initialize with default value

//--------------------------------------------------------------//
//                        State Tracking
//--------------------------------------------------------------//
export let isTexturesLoaded = false;
export let isPlayerLoaded = false;
export let areSchematicsLoaded = false;

// UI Elements
export let loadingScreen = null;
export let statusBar = null;
export let serverStatus = null;


//--------------------------------------------------------------//
//                       FPS Counter
//--------------------------------------------------------------//
export let fpsCounter = null;
export function setFPSCounter(counter) {
    fpsCounter = counter;
}


//--------------------------------------------------------------//
//                      Setter Functions
//--------------------------------------------------------------//
export function setScene(newScene) {
    scene = newScene;
}

export function setCamera(newCamera) {
    camera = newCamera;
}

export function setRenderer(newRenderer) {
    renderer = newRenderer;
}

export function setCameraOffset(newOffset) {
    cameraOffset = newOffset;
}

export function setPlayer(newPlayer) {
    player = newPlayer;
}

export function setPlayerControls(newControls) {
    playerControls = newControls;
}

export function addOtherPlayer(id, playerObject) {
    otherPlayers[id] = playerObject;
}

export function removeOtherPlayer(id) {
    if (otherPlayers[id]) {
        delete otherPlayers[id];
    }
}

export function setBlockManager(newBlockManager) {
    blockManager = newBlockManager;
}

export function setChunkManager(newChunkManager) {
    chunkManager = newChunkManager;
}

export function setChunkWorker(newChunkWorker) {
    chunkWorker = newChunkWorker;
}

export function setSocket(newSocket) {
    socket = newSocket;
}

export function setOnlineStatus(status) {
    isOnline = status;
}

export function setWorldConfig(config) {
    worldConfig = config;
}

export function setClientWorldConfig(config) {
    client_world_config = config;
}

export function setTexturesLoaded(status) {
    isTexturesLoaded = status;
}

export function setPlayerLoaded(status) {
    isPlayerLoaded = status;
}

export function setSchematicsLoaded(status) {
    areSchematicsLoaded = status;
}

//--------------------------------------------------------------//
//                      Helper Functions
//--------------------------------------------------------------//
export function updateChunkMap(chunkX, chunkY, chunkZ, chunkData) {
    const key = `${chunkX},${chunkY},${chunkZ}`;
    CHUNK.set(key, chunkData);
}

export function getChunkFromMap(chunkX, chunkY, chunkZ) {
    const key = `${chunkX},${chunkY},${chunkZ}`;
    return CHUNK.get(key);
}

export function clearChunkMap() {
    CHUNK.clear();
}

// Utility function to get block type
export function getBlockType(x, y, z) {
    if (!chunkManager) return 0;

    const size = client_world_config.CHUNK_SIZE;
    const chunkX = Math.floor(x / size);
    const chunkY = Math.floor(y / size);
    const chunkZ = Math.floor(z / size);
    const localX = ((x % size) + size) % size;
    const localY = ((y % size) + size) % size;
    const localZ = ((z % size) + size) % size;

    return chunkManager.getBlockType(chunkX, chunkY, chunkZ, localX, localY, localZ);
}

// Generic state checker function
export function isGameReady() {
    return isTexturesLoaded && isPlayerLoaded && areSchematicsLoaded;
}

// Add the spawn function that was previously exported from script.js
export function spawn(x, z) {
    if (!worldConfig) return { x: 0, y: 60, z: 0 };

    // Calculate spawn position based on world size
    const worldSize = worldConfig.SIZE || 512;

    // Default spawn position at the center of the world
    const defaultSpawnX = worldSize / 2;
    const defaultSpawnZ = worldSize / 2;
    const groundLevel = Math.ceil(80) + 0.5; // Base ground level aligned with blocks

    // If specific coordinates are provided, use them instead
    const spawnX = x || defaultSpawnX;
    const spawnZ = z || defaultSpawnZ;

    return {
        x: spawnX,
        y: groundLevel,
        z: spawnZ
    };
}

//--------------------------------------------------------------//
//                   Scene Management Functions
//--------------------------------------------------------------//

// Setup the Three.js scene
export function setupScene(worldSize) {
    const scene = new THREE.Scene();
    setScene(scene);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    setCamera(camera);

    // Add fog to the scene
    const fogColor = 0x87CEEB; // Sky blue color
    const fogNear = 50;
    const fogFar = 500;
    scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    // Alternatively, for exponential fog:
    scene.fog = new THREE.FogExp2(fogColor, 0.002);

    // Calculate total world dimension in units
    const worldDimension = worldSize;

    // Set camera to view the positive quadrant
    camera.position.set(500, 800, 1300);
    camera.lookAt(worldDimension / 2, 0, worldDimension / 2);

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.setClearColor(fogColor); // Match the fog color
    document.body.appendChild(renderer.domElement);
    setRenderer(renderer);

    // Create main grid for the whole world
    const worldGridHelper = new THREE.GridHelper(
        worldSize, // Total size of the grid
        worldSize, // Number of divisions (1 unit per block)
        0x888888, // Main grid lines
        0xCCCCCC  // Secondary grid lines
    );

    // Set opacity for the grid lines
    worldGridHelper.material.opacity = 0.1;
    worldGridHelper.material.transparent = true;

    // Position the grid to extend in positive quadrant
    worldGridHelper.position.set(worldDimension / 2, 0, worldDimension / 2);
    scene.add(worldGridHelper);

    return { scene, camera, renderer };
}

// Setup lighting for the scene
export function setupLighting() {
    if (!scene) {
        console.error("Cannot setup lighting: Scene is not initialized");
        return;
    }

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

// Handle window resize
export function handleWindowResize() {
    if (!camera || !renderer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update camera position based on player position
export function updateCamera(playerPosition) {
    if (!camera) return;
    camera.position.copy(playerPosition).add(cameraOffset);
    camera.lookAt(playerPosition);
}

//--------------------------------------------------------------//
//                   UI Management Functions
//--------------------------------------------------------------//

// Create loading screen
export function createLoadingScreen() {
    loadingScreen = document.createElement('div');
    loadingScreen.id = 'loading-screen';
    loadingScreen.innerHTML = `
        <div id="loading-content">
            <div id="loading-spinner"></div>
            <p id="loading-message">Checking server connection...</p>
        </div>
    `;
    document.body.appendChild(loadingScreen);
    return loadingScreen;
}

// Update loading message
export function updateLoadingMessage(message) {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
}

// Remove loading screen
export function removeLoadingScreen() {
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.remove();
        }, 500); // Matches the transition duration in CSS
    }
}

// Create status bar
export function createStatusBar() {
    statusBar = document.createElement('div');
    statusBar.id = 'status-bar';
    statusBar.style.opacity = '0';
    statusBar.style.transition = 'opacity 0.5s ease-in-out';

    serverStatus = document.createElement('span');
    serverStatus.id = 'server-status';

    statusBar.appendChild(document.createTextNode('Server Status: '));
    statusBar.appendChild(serverStatus);

    const playerCount = document.createElement('span');
    playerCount.id = 'player-count';
    playerCount.textContent = '1 player online';

    statusBar.appendChild(document.createElement('br'));
    statusBar.appendChild(playerCount);

    document.body.appendChild(statusBar);
    return statusBar;
}

// Update server status
export function updateServerStatus(online) {
    setOnlineStatus(online);
    if (serverStatus) {
        serverStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
        serverStatus.className = online ? 'online' : 'offline';
        statusBar.style.opacity = '1';
    }
}

// Check server status
export async function checkServerStatus(serverUrl) {
    try {
        const socket = io(serverUrl, {
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

// Update player count
export function updatePlayerCount() {
    const playerCount = document.getElementById('player-count');
    if (playerCount) {
        const count = Object.keys(otherPlayers).length + 1; // +1 for local player
        playerCount.textContent = `${count} player${count !== 1 ? 's' : ''} online`;
    }
}

// Show intro popup
export function showIntroPopup() {
    const popup = document.getElementById('intro-popup');
    if (!popup) return;

    popup.style.display = 'block';

    const closeButton = document.getElementById('close-popup');
    closeButton.addEventListener('click', hideIntroPopup);

    window.addEventListener('click', function (event) {
        if (event.target === popup) {
            hideIntroPopup();
        }
    });
}

// Hide intro popup
export function hideIntroPopup() {
    const popup = document.getElementById('intro-popup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// Show notification
export function showNotification(message, duration = 3000) {
    // Create notification element if it doesn't exist
    let notifications = document.getElementById('notifications');

    if (!notifications) {
        notifications = document.createElement('div');
        notifications.id = 'notifications';
        notifications.style.position = 'absolute';
        notifications.style.top = '10px';
        notifications.style.left = '10px';
        notifications.style.zIndex = '1000';
        document.body.appendChild(notifications);
    }

    // Create new notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    notification.style.color = 'white';
    notification.style.padding = '8px 12px';
    notification.style.marginBottom = '5px';
    notification.style.borderRadius = '5px';
    notification.style.fontFamily = 'sans-serif';
    notification.style.fontSize = '14px';
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';

    // Add to container
    notifications.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);

    // Remove after duration
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

//--------------------------------------------------------------//
//                   Subscribe/Publish System
//--------------------------------------------------------------//
// Optional: Add an event system to notify components of state changes
const subscribers = {};

export function subscribe(event, callback) {
    if (!subscribers[event]) {
        subscribers[event] = [];
    }
    subscribers[event].push(callback);

    // Return unsubscribe function
    return () => {
        subscribers[event] = subscribers[event].filter(cb => cb !== callback);
    };
}

export function publish(event, data) {
    if (subscribers[event]) {
        subscribers[event].forEach(callback => callback(data));
    }
}

// Available events
export const EVENTS = {
    PLAYER_MOVED: 'playerMoved',
    BLOCK_UPDATED: 'blockUpdated',
    CHUNK_LOADED: 'chunkLoaded',
    GAME_READY: 'gameReady',
    PLAYER_CONNECTED: 'playerConnected',
    PLAYER_DISCONNECTED: 'playerDisconnected',
    SERVER_STATUS_CHANGED: 'serverStatusChanged'
};