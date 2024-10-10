//----------------- Imports -----------------//
import { createPlayer, addPlayerControls} from './players.js';
import { createMiniMap } from './map.js';
import { WORLD_CONFIG_OFFLINE } from './config-offline.js';



//----------------- Constants -----------------//
const otherPlayers = {};
//----------------- Configuration -----------------//

let scene, camera, cameraOffset, renderer, player;
let isOnline = false;
let socket;

const CLIENT_WORLD_CONFIG = {
    CHUNK_SIZE: 25,
    RENDER_DISTANCE: 1
};


const MAX_INSTANCES = CLIENT_WORLD_CONFIG.CHUNK_SIZE ** 3;





//----------------- Server Status -----------------//

let loadingScreen, statusBar, serverStatus;

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







//----------------- Textures -----------------//
const playerData = {
    id: 'player1',
    position: { x: 0, y: 0, z: 0 },
    skinUrl: 'https://www.minecraftskins.com/uploads/skins/2024/10/09/herobrian-22811917.png?v694'
};



const textureLoader = new THREE.TextureLoader();
let textureAtlas;
let blockTextures;
let blockMaterials;

function loadTextures() {
    return new Promise((resolve, reject) => {
        textureLoader.load('./texture-pack/texture-atlas.png', 
            (loadedTexture) => {
                textureAtlas = loadedTexture;
                initializeTextures();
                initializeMaterials();
                isTexturesLoaded = true;  // Make sure to set this flag
                resolve();
            },
            undefined, // onProgress callback is not needed here
            (error) => {
                console.error('An error occurred while loading textures:', error);
                reject(error);
            }
        );
    });
}

const createTextureFromAtlas = (x, y, width, height) => {
    const texture = textureAtlas.clone();
    const padding = 0.5; // Small padding to prevent edge bleeding
    texture.repeat.set((width - 2*padding) / textureAtlas.image.width, (height - 2*padding) / textureAtlas.image.height);
    texture.offset.set((x + padding) / textureAtlas.image.width, 1 - (y + height - padding) / textureAtlas.image.height);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter; 
    // Disable mipmapping for pixelated look (optional)
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping; 
    texture.wrapT = THREE.ClampToEdgeWrapping; 
    texture.needsUpdate = true;
    return texture;
};

function initializeTextures() {
    blockTextures = {
        grass: {
            top: createTextureFromAtlas(32, 64, 16, 16),
            side: createTextureFromAtlas(64, 64, 16, 16),
            bottom: createTextureFromAtlas(32, 0, 16, 16)
        },
        dirt: createTextureFromAtlas(32, 0, 16, 16),
        stone: createTextureFromAtlas(16, 0, 16, 16),
        sand: createTextureFromAtlas(32, 16, 16, 16),
        snow: createTextureFromAtlas(32, 64, 16, 16),
        water: createTextureFromAtlas(240, 208, 16, 16),
        
        coal_ore: createTextureFromAtlas(32, 32, 16, 16),

        iron_ore: createTextureFromAtlas(16, 32, 16, 16),

        gold_ore: createTextureFromAtlas(0, 32, 16, 16),

        diamond_ore: createTextureFromAtlas(48, 32, 16, 16),

        emerald_ore: createTextureFromAtlas(64, 32, 16, 16),

        redstone_ore: createTextureFromAtlas(80, 32, 16, 16),
        
        lapis_ore: createTextureFromAtlas(96, 32, 16, 16),

        podzol: createTextureFromAtlas(160, 352, 16, 16),
    };
}

function initializeMaterials() {
    blockMaterials = {
        grass: [
            new THREE.MeshLambertMaterial({ map: blockTextures.grass.side }),
            new THREE.MeshLambertMaterial({ map: blockTextures.grass.side }),
            new THREE.MeshLambertMaterial({ map: blockTextures.grass.top }),
            new THREE.MeshLambertMaterial({ map: blockTextures.grass.bottom }),
            new THREE.MeshLambertMaterial({ map: blockTextures.grass.side }),
            new THREE.MeshLambertMaterial({ map: blockTextures.grass.side })
        ],
        dirt: new THREE.MeshLambertMaterial({ map: blockTextures.dirt }),
        stone: new THREE.MeshLambertMaterial({ map: blockTextures.stone }),
        sand: new THREE.MeshLambertMaterial({ map: blockTextures.sand }),
        snow: new THREE.MeshLambertMaterial({ map: blockTextures.snow }),
        water: new THREE.MeshLambertMaterial({ map: blockTextures.water }),
        coal_ore: new THREE.MeshLambertMaterial({ map: blockTextures.coal_ore }),
        iron_ore: new THREE.MeshLambertMaterial({ map: blockTextures.iron_ore }),
        gold_ore: new THREE.MeshLambertMaterial({ map: blockTextures.gold_ore }),
        diamond_ore: new THREE.MeshLambertMaterial({ map: blockTextures.diamond_ore }),
        emerald_ore: new THREE.MeshLambertMaterial({ map: blockTextures.emerald_ore }),
        redstone_ore: new THREE.MeshLambertMaterial({ map: blockTextures.redstone_ore }),
        lapis_ore: new THREE.MeshLambertMaterial({ map: blockTextures.lapis_ore }),
        podzol: new THREE.MeshLambertMaterial({ map: blockTextures.podzol }),
    };
}


function createChunkMesh(chunk, chunkX, chunkY, chunkZ) {
    const chunkGroup = new THREE.Group();
    chunkGroup.name = `${chunkX},${chunkY},${chunkZ}`;

    const instances = {
        [BlockType.GRASS]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.grass, MAX_INSTANCES),
        [BlockType.SAND]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.sand, MAX_INSTANCES),
        [BlockType.STONE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.stone, MAX_INSTANCES),
        [BlockType.SNOW]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.snow, MAX_INSTANCES),
        [BlockType.DIRT]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.dirt, MAX_INSTANCES),
        [BlockType.COAL_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.coal_ore, MAX_INSTANCES),
        [BlockType.IRON_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.iron_ore, MAX_INSTANCES),
        [BlockType.GOLD_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.gold_ore, MAX_INSTANCES),
        [BlockType.DIAMOND_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.diamond_ore, MAX_INSTANCES),
        [BlockType.WATER]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.water, MAX_INSTANCES),
        [BlockType.EMERALD_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.emerald_ore, MAX_INSTANCES),
        [BlockType.REDSTONE_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.redstone_ore, MAX_INSTANCES),
        [BlockType.LAPIS_ORE]: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), blockMaterials.lapis_ore, MAX_INSTANCES),
    };

    const matrix = new THREE.Matrix4();
    const instanceCounts = {};

    for (let i = 0; i < chunk.length; i++) {
        const blockType = chunk[i];
        if (blockType !== BlockType.AIR && instances[blockType]) { // Add this check
            const x = i % CLIENT_WORLD_CONFIG.CHUNK_SIZE;
            const y = Math.floor(i / CLIENT_WORLD_CONFIG.CHUNK_SIZE) % CLIENT_WORLD_CONFIG.CHUNK_SIZE;
            const z = Math.floor(i / (CLIENT_WORLD_CONFIG.CHUNK_SIZE * CLIENT_WORLD_CONFIG.CHUNK_SIZE));
            const worldX = chunkX * CLIENT_WORLD_CONFIG.CHUNK_SIZE + x;
            const worldY = chunkY * CLIENT_WORLD_CONFIG.CHUNK_SIZE + y;
            const worldZ = chunkZ * CLIENT_WORLD_CONFIG.CHUNK_SIZE + z;

            // Check visible faces
            const visibleFaces = checkVisibleFaces(chunk, x, y, z);

            if (visibleFaces.some(face => face)) {
                matrix.setPosition(worldX, worldY, worldZ);
                instances[blockType].setMatrixAt(instanceCounts[blockType] || 0, matrix);
                instanceCounts[blockType] = (instanceCounts[blockType] || 0) + 1;
            }
        } else if (blockType !== BlockType.AIR) {
            console.warn(`Unknown block type encountered: ${blockType}`);
        }
    }

    for (const [blockType, mesh] of Object.entries(instances)) {
        mesh.count = instanceCounts[blockType] || 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        chunkGroup.add(mesh);
    }

    scene.add(chunkGroup);
    CHUNK.set(`${chunkX},${chunkY},${chunkZ}`, chunkGroup);
}

function checkVisibleFaces(chunk, x, y, z) {
    // Use a constant array to hold direction offsets
    const DIRECTIONS = [
        { x: 1, y: 0, z: 0 }, // +X
        { x: -1, y: 0, z: 0 }, // -X
        { x: 0, y: 1, z: 0 }, // +Y
        { x: 0, y: -1, z: 0 }, // -Y
        { x: 0, y: 0, z: 1 }, // +Z
        { x: 0, y: 0, z: -1 }  // -Z
    ];
    const CHUNK_SIZE = CLIENT_WORLD_CONFIG.CHUNK_SIZE;

    const visibleFaces = [true, true, true, true, true, true];

    for (let i = 0; i < DIRECTIONS.length; i++) {
        const { x: dx, y: dy, z: dz } = DIRECTIONS[i];
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;

        if (nx >= 0 && nx < CHUNK_SIZE && ny >= 0 && ny < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
            const neighborIndex = nx + ny * CHUNK_SIZE + nz * CHUNK_SIZE * CHUNK_SIZE;
            if (chunk[neighborIndex] !== BlockType.AIR) {
                visibleFaces[i] = false;
            }
        }
    }

    return visibleFaces;
}


const BlockType = {
    AIR: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    SAND: 4,
    SNOW: 5,
    WATER: 6,
    COAL_ORE: 7,
    IRON_ORE: 8,
    GOLD_ORE: 9,
    DIAMOND_ORE: 10,
    EMERALD_ORE: 11,
    REDSTONE_ORE: 12,
    LAPIS_ORE: 13,
    PODZOL: 14,
    MUD: 15,
    RED_SAND: 16,
    GRAVEL: 17,
    CLAY: 18,
    JUNGLE_GRASS: 19,
    SAVANNA_GRASS: 20,
    SNOW_GRASS: 21,
};

//----------------- World -----------------//
function handleWorldInfo(data) {
    worldConfig = data.config || WORLD_CONFIG;
    client_world_config = data.client_config || CLIENT_WORLD_CONFIG;
    if (chunkWorker) {
        chunkWorker.terminate();
    }
    initChunkWorker();
    if (player) {
        generateInitialChunk();
    }

    console.log("World configuration loaded:", worldConfig);
}











//----------------- Initialization -----------------//
async function init() {
    createLoadingScreen();
    createStatusBar();
    
    updateLoadingMessage('Setting up the scene...');
    setupScene();
    
    updateLoadingMessage('Configuring lighting...');
    setupLighting();
    
    updateLoadingMessage('Setting up event listeners...');
    setupEventListeners();

    updateLoadingMessage('Checking server connection...');
    const serverAvailable = await checkServerStatus();
    
    if (serverAvailable) {
        updateLoadingMessage('Connecting to server...');
        await setupSocketConnection();
        await requestWorldInfo();
    } else {
        console.log("Server unavailable. Starting in offline mode.");
        updateLoadingMessage('Starting in offline mode...');
        startOfflineMode();
    }

    updateLoadingMessage('Loading textures...');
    try {
        await loadTextures();
        console.log('Textures loaded successfully');
    } catch (error) {
        console.error('Failed to load textures:', error);
        // Handle the error appropriately, maybe use default textures or show an error message
    }

    updateLoadingMessage('Preparing the world...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give a moment for any final setup

    removeLoadingScreen();
    startGameIfReady();

    // Show the intro popup after a short delay
    setTimeout(showIntroPopup, 1000);
}

function startOfflineMode() {
    handleWorldInfo({ config: WORLD_CONFIG_OFFLINE, client_config: CLIENT_WORLD_CONFIG });
    handlePlayerInfo(playerData);
}
//----------------------------------------------------------------//


function showIntroPopup() {
    const popup = document.getElementById('intro-popup');
    popup.style.display = 'block';

    const closeButton = document.getElementById('close-popup');
    closeButton.addEventListener('click', hideIntroPopup);

    // Close popup when clicking outside
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
    // Ambient light for overall scene brightness
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Main directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    
    // Optimize shadow map
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 50;
    directionalLight.shadow.camera.far = 150;
    directionalLight.shadow.camera.left = -150;
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    directionalLight.shadow.bias = -0.0005;
    directionalLight.shadow.normalBias = 0.02;
    directionalLight.shadow.radius = 4; // Reduced for sharper shadows
    
    scene.add(directionalLight);

    // Hemisphere light for sky-ground color variation
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x545454, 0.4);
    scene.add(hemisphereLight);

    // Player light for local illumination
    const playerLight = new THREE.PointLight(0xffffff, 0.7, 20);
    playerLight.position.set(0, 2, 0); // This should be updated to follow the player
    scene.add(playerLight);
}

function updateCamera(playerPosition) {
    camera.position.copy(playerPosition).add(cameraOffset);
    camera.lookAt(playerPosition);
}

//----------------- Player -----------------//

function handlePlayerInfo(playerData) {
    player = createPlayer(scene, playerData, true);
    updateCamera(player.position);
    isPlayerLoaded = true;
    startGameIfReady();
}

function handleNewPlayer(playerData) {
    if (playerData.id !== socket.id) {
        const newPlayer = createPlayer(scene, playerData, false);
        otherPlayers[playerData.id] = newPlayer;
    }
}

function handlePlayerMove(playerData) {
    if (playerData.id === socket.id) {
        if (player) {
            player.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
            updateCamera(player.position);
        }
    } else if (otherPlayers[playerData.id]) {
        const otherPlayer = otherPlayers[playerData.id];
        otherPlayer.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
    }
}
function handlePlayerDisconnected(playerId) {
    if (otherPlayers[playerId]) {
        scene.remove(otherPlayers[playerId]);
        delete otherPlayers[playerId];
    }
}

export function findGroundLevel(x, z) {
    const chunkSize = CLIENT_WORLD_CONFIG.CHUNK_SIZE;
    const chunkX = Math.floor(x / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    const localX = Math.floor(x % chunkSize);
    const localZ = Math.floor(z % chunkSize);

    // Check if the chunk is loaded
    const chunkKey = `${chunkX},0,${chunkZ}`; // Assuming y starts at 0
    const chunk = CHUNK.get(chunkKey);

    if (chunk) {
        // Iterate from top to bottom to find the first non-air block
        for (let y = worldConfig.MAX_HEIGHT - 1; y >= 0; y--) {
            const localY = y % chunkSize;
            const blockIndex = localX + localY * chunkSize + localZ * chunkSize * chunkSize;
            const blockType = chunk.children[0].geometry.attributes.instanceMatrix.array[blockIndex * 16 + 13]; // Y position in the matrix

            if (blockType !== BlockType.AIR) {
                return y + 1; // Return the position above the ground block
            }
        }
    }

    // If chunk not loaded or no ground found, return a default value
    return 160; // Or any other reasonable default height
}

//----------------- Animation -----------------//
let isTexturesLoaded = false;
let isPlayerLoaded = false;

function startGameIfReady() {
    if (isTexturesLoaded && isPlayerLoaded) {
        generateInitialChunk();
        animate();
    } else {
        console.log('Game not ready to start. Textures loaded:', isTexturesLoaded, 'Player loaded:', isPlayerLoaded);
    }
}

function animate() {
    const updatePlayerMovement = addPlayerControls(player, camera, scene, renderer.domElement);
    const updateMiniMap = createMiniMap(scene, player);

    renderer.setAnimationLoop(() => {
        updatePlayerMovement();
        updateMiniMap();
        updateChunk();
        
        // Update player light position
        const playerLight = scene.getObjectByProperty('type', 'PointLight');
        if (playerLight) {
            playerLight.position.copy(player.position).add(new THREE.Vector3(0, 10, 0));
        }
        
        // Update shadow camera position based on player position
        const directionalLight = scene.getObjectByProperty('type', 'DirectionalLight');
        if (directionalLight) {
            directionalLight.position.set(
                player.position.x + 50,
                player.position.y + 100,
                player.position.z + 50
            );
            directionalLight.target.position.copy(player.position);
            directionalLight.target.updateMatrixWorld();
            directionalLight.shadow.camera.updateProjectionMatrix();
        }

        // Send player position and rotation to the server if online
        if (isOnline && socket) {
            socket.emit('playerMove', {
                position: player.position,
                rotation: player.rotation
            });
        }

        renderer.render(scene, camera);
    });
}















//----------------- Web Worker -----------------//

let worldConfig;
let client_world_config;
let chunkWorker;


function initChunkWorker() {
    chunkWorker = new Worker('./src/chunk-worker.js');
    chunkWorker.onmessage = function(e) {
        if (e.data.type === 'chunkGenerated') {
            const { chunk, chunkX, chunkY, chunkZ } = e.data;
            createChunkMesh(chunk, chunkX, chunkY, chunkZ);
        }
    };
    chunkWorker.onerror = function(error) {
        console.error('Chunk Worker Error:', error);
    };
    
    chunkWorker.postMessage({ 
        type: 'init', 
        server_config: worldConfig,
        client_config: client_world_config,
        seed: worldConfig.SEED
    });
}

async function generateChunk(chunkX, chunkY, chunkZ) {
    if (chunkY < 0 || chunkY >= worldConfig.MAX_HEIGHT) return;
    const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
    if (CHUNK.has(chunkKey)) return;

    chunkWorker.postMessage({ type: 'generateChunk', chunkX, chunkY, chunkZ });
}











//----------------- Chunk Generation -----------------//
//          No improvements needed for this section
const CHUNK = new Map();
let chunkLoadQueue = [];
let chunkUnloadQueue = [];
let isProcessingChunks = false;
let lastPlayerChunkPosition = { x: 0, y: 0, z: 0 };
function generateInitialChunk() {
    const playerChunkX = Math.floor(player.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const playerChunkY = Math.floor(player.position.y / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE);

    for (let dy = -CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dy <= CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dy++) {
        const chunkY = playerChunkY + dy;
        if (chunkY < 0 || chunkY >= worldConfig.MAX_HEIGHT) continue;

        for (let dx = -CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dx <= CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dx++) {
            for (let dz = -CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dz <= CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                queueChunkLoad(chunkX, chunkY, chunkZ);
            }
        }
    }
}

function queueChunkLoad(chunkX, chunkY, chunkZ) {
    const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
    if (!chunkLoadQueue.some(chunk => chunk.key === chunkKey)) {
        chunkLoadQueue.push({ x: chunkX, y: chunkY, z: chunkZ, key: chunkKey });
    }
}

function queueChunkUnload(chunkKey) {
    if (!chunkUnloadQueue.includes(chunkKey)) {
        chunkUnloadQueue.push(chunkKey);
    }
}

function unloadChunk(chunkKey) {
    const chunkGroup = CHUNK.get(chunkKey);
    if (chunkGroup) {
        chunkGroup.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        scene.remove(chunkGroup);
        CHUNK.delete(chunkKey);
    }
}

function updateChunk() {
    const playerChunkX = Math.floor(player.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const playerChunkY = Math.floor(player.position.y / CLIENT_WORLD_CONFIG.CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE);

    if (
        playerChunkX !== lastPlayerChunkPosition.x ||
        playerChunkY !== lastPlayerChunkPosition.y ||
        playerChunkZ !== lastPlayerChunkPosition.z
    ) {
        lastPlayerChunkPosition = { x: playerChunkX, y: playerChunkY, z: playerChunkZ };
        loadAndUnloadChunks(playerChunkX, playerChunkY, playerChunkZ);
    }

    if (!isProcessingChunks) {
        processChunkQueue();
    }
}

function loadAndUnloadChunks(playerChunkX, playerChunkY, playerChunkZ) {
    const chunksToKeep = new Set();

    for (let dy = -CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dy <= CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dy++) {
        const chunkY = playerChunkY + dy;
        if (chunkY < 0 || chunkY >= worldConfig.MAX_HEIGHT) continue;

        for (let dx = -CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dx <= CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dx++) {
            for (let dz = -CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dz <= CLIENT_WORLD_CONFIG.RENDER_DISTANCE; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

                chunksToKeep.add(chunkKey);
                if (!CHUNK.has(chunkKey)) {
                    queueChunkLoad(chunkX, chunkY, chunkZ);
                }
            }
        }
    }

    // Unload unused chunks
    for (const chunkKey of CHUNK.keys()) {
        if (!chunksToKeep.has(chunkKey)) {
            queueChunkUnload(chunkKey);
        }
    }
}


async function processChunkQueue() {
    if (isProcessingChunks) return;
    isProcessingChunks = true;

    const startTime = performance.now();
    const maxProcessingTime = 1000; // ms, targeting 60 FPS

    while (performance.now() - startTime < maxProcessingTime && (chunkLoadQueue.length > 0 || chunkUnloadQueue.length > 0)) {
        if (chunkLoadQueue.length > 0) {
            const chunk = chunkLoadQueue.shift();
            await generateChunk(chunk.x, chunk.y, chunk.z);
        }

        if (chunkUnloadQueue.length > 0) {
            const chunkKey = chunkUnloadQueue.shift();
            unloadChunk(chunkKey);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    isProcessingChunks = false;
    if (chunkLoadQueue.length > 0 || chunkUnloadQueue.length > 0) {
        requestAnimationFrame(processChunkQueue);
    }
}
















//----------------- Socket Connection -----------------//
function setupSocketConnection() {
    const serverUrl = CONFIG.SERVER_URL;
    
    socket = io(serverUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling']
    });

    socket.on('worldInfo', handleWorldInfo);
    socket.on('playerInfo', handlePlayerInfo);
    socket.on('newPlayer', handleNewPlayer);
    socket.on('playerMove', handlePlayerMove);
    socket.on('playerDisconnected', handlePlayerDisconnected);

    socket.on('connect', () => {
        console.log('Connected to server');
        updateServerStatus(true);
        socket.emit('requestWorldInfo');
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






//----------------- Event Listeners -----------------//

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupEventListeners() {
    window.addEventListener('resize', onWindowResize);
}

window.addEventListener('load', init);