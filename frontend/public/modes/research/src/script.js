
// ==============================================================
// FILE: frontend/public/modes/research/src/script.js
// ==============================================================

//--------------------------------------------------------------//
//                              Imports
//--------------------------------------------------------------//
import { createPlayer, addPlayerControls } from '../../../src/player/players.js';
import { createMiniMap } from '../../../src/player/map.js';
import { TRAINING_WORLD_CONFIG } from './config-training-world.js';
import { ChunkManager } from '../../../src/world/chunk_manager.js';
import { Texture, BlockType } from '../../../src/world/textures.js';
import { initializeBlockInteractions } from '../../../src/world/block_interactions.js';

// Import the game state module for centralized state management
import * as GameState from '../../../src/core/game-state.js';


import NPCSystem from '../src/npc/npc-system.js';

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
    const config = GameState.worldConfig || TRAINING_WORLD_CONFIG;

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
    chunkWorker.onmessage = function (e) {
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

    // Apply any world modifications if they exist
    if (data.modifications && data.modifications.length > 0) {
        console.log(`Processing ${data.modifications.length} modifications`);

        // Convert modifications to chunk format
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

            // Spawn initial NPCs
            if (npcSystem) {
                setTimeout(() => {
                    npcSystem.generateNPCs(20);
                    updateNPCStats();
                }, 2000); // Delay slightly to ensure world is loaded
            }

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
    try {
        // Create UI elements using GameState functions
        GameState.createLoadingScreen();

        GameState.updateLoadingMessage('Setting up the scene...');
        // Use centralized scene setup with training world size
        GameState.setupScene(TRAINING_WORLD_CONFIG.SIZE);

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
            // Load texture atlas
            await textureManager.loadTextureAtlas('../../../assets/images/texture-pack/texture-atlas.png');
            console.log('Textures loaded successfully');
            GameState.setTexturesLoaded(true);
        } catch (error) {
            console.error('Failed to load textures:', error);
        }

        // Always use offline mode 
        GameState.updateLoadingMessage('Starting in training mode...');
        startOfflineMode(); // Using the offline mode function but with training config

        // Initialize web worker
        GameState.updateLoadingMessage('Initializing world generator...');
        initWebWorker();

        // Wait a moment for worker to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        GameState.setSchematicsLoaded(true);

        GameState.updateLoadingMessage('Setting up NPC system...');
        // Initialize NPC system after the world and player are set up
        // but before removing the loading screen
        initializeNPCSystem();

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
    // Initialize world with training config
    handleWorldInfo({
        config: TRAINING_WORLD_CONFIG,
        client_config: CLIENT_WORLD_CONFIG
    });

    // Initialize offline player with default data
    handlePlayerInfo(DEFAULT_PLAYER_DATA);

    // Set offline status
    GameState.updateServerStatus(false);
}
//--------------------------------------------------------------//
//                       NPC System Integration
//--------------------------------------------------------------//
let npcSystem = null;

function initializeNPCSystem() {
    if (npcSystem) return npcSystem;

    console.log('Initializing NPC system...');
    npcSystem = new NPCSystem(GameState.scene).initialize();

    // Add NPC system controls to research panel
    setupNPCControls();

    return npcSystem;
}

function setupNPCControls() {
    const researchPanel = document.getElementById('research-panel');
    if (!researchPanel) {
        console.warn('Research panel not found, cannot add NPC controls');
        return;
    }

    // Create NPC control section
    const npcSection = document.createElement('div');
    npcSection.id = 'npc-controls';
    npcSection.innerHTML = `
        <h3>NPC Controls</h3>
        <button id="spawn-npcs">Spawn 5 NPCs</button>
        <button id="remove-npcs">Remove All NPCs</button>
        <div id="npc-stats">
            Active NPCs: 0
        </div>
    `;

    // Insert before stats section
    const statsSection = document.getElementById('stats');
    if (statsSection) {
        researchPanel.insertBefore(npcSection, statsSection);
    } else {
        researchPanel.appendChild(npcSection);
    }

    // Add event listeners
    document.getElementById('spawn-npcs').addEventListener('click', () => {
        npcSystem.generateNPCs(5);
        updateNPCStats();
    });

    document.getElementById('remove-npcs').addEventListener('click', () => {
        npcSystem.removeAllNPCs();
        updateNPCStats();
    });

    // Add keyboard shortcut (N key)
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'n') {
            npcSystem.generateNPCs(1);
            updateNPCStats();
        }
    });

    // Start periodic stats updates
    setInterval(updateNPCStats, 1000);
}

function updateNPCStats() {
    const npcStatsElement = document.getElementById('npc-stats');
    if (!npcStatsElement || !npcSystem) return;

    npcStatsElement.innerHTML = `
        Active NPCs: ${npcSystem.npcs.length}
    `;
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
        // Apply player controls
        if (GameState.playerControls && GameState.player) {
            GameState.playerControls();
            sceneChanged = true; // Mark scene as changed
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

        // Update player light
        const playerLight = GameState.scene.getObjectByProperty('type', 'PointLight');
        if (playerLight && GameState.player) {
            playerLight.position.copy(GameState.player.position).add(new THREE.Vector3(0, 10, 0));
            sceneChanged = true; // Mark scene as changed
        }

        // Update directional light
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

        // Only render if the scene has changed
        if (sceneChanged) {
            GameState.renderer.render(GameState.scene, GameState.camera);
            sceneChanged = false; // Reset the flag
        }
    });
}

//--------------------------------------------------------------//
//                       Event Listeners
//--------------------------------------------------------------//
function setupEventListeners() {
    window.addEventListener('resize', GameState.handleWindowResize);

    // Add event listener for NPC toggle key
    document.addEventListener('keydown', (e) => {
        // Press 'N' to spawn an NPC
        if (e.key === 'n') {
            if (npcSystem) {
                npcSystem.generateNPCs(1);
                updateNPCStats();
            }
        }
        // Test key 'R' - Force all NPCs to remove blocks
        if (e.key.toLowerCase() === 'r' && GameState.npcSystem && GameState.npcSystem.blockInteractionSystem) {
            console.log("Forcing all NPCs to remove blocks");
            GameState.npcSystem.blockInteractionSystem.forceAllNPCsToRemoveBlocks();
        }
        
        // Test key 'M' - Remove blocks around player directly (no NPC involved)
        if (e.key.toLowerCase() === 'm' && GameState.npcSystem && GameState.player) {
            console.log("Removing blocks around player directly");
            
            const blockSystem = GameState.npcSystem.blockInteractionSystem;
            const playerX = Math.floor(GameState.player.position.x);
            const playerY = Math.floor(GameState.player.position.y);
            const playerZ = Math.floor(GameState.player.position.z);
            
            // Try removing blocks in a 3x3x3 area around player
            let removedCount = 0;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = 0; dy <= 2; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (blockSystem.removeBlockAtPosition(
                            playerX + dx,
                            playerY + dy,
                            playerZ + dz
                        )) {
                            removedCount++;
                        }
                    }
                }
            }
            
            console.log(`Directly removed ${removedCount} blocks around player`);
        }
        
        // Test key 'T' - Toggle debugging visuals
        if (e.key.toLowerCase() === 't' && GameState.npcSystem) {
            // Toggle debug mode
            console.log("Toggling NPC debug visuals");
            window.npcDebugMode = !window.npcDebugMode;
            
            // Add or remove visuals
            for (const npc of GameState.npcSystem.npcs) {
                if (window.npcDebugMode) {
                    // Add visual indicator
                    if (!npc.debugSphere) {
                        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
                        const material = new THREE.MeshBasicMaterial({
                            color: 0x00FFFF,
                            transparent: true,
                            opacity: 0.7
                        });
                        npc.debugSphere = new THREE.Mesh(geometry, material);
                        npc.debugSphere.position.y = 2.2; // Above NPC head
                        npc.add(npc.debugSphere);
                    }
                } else {
                    // Remove visual indicator
                    if (npc.debugSphere) {
                        npc.remove(npc.debugSphere);
                        npc.debugSphere.geometry.dispose();
                        npc.debugSphere.material.dispose();
                        npc.debugSphere = null;
                    }
                }
            }
        }

        if (e.key.toLowerCase() === 'g' && GameState.npcSystem && GameState.npcSystem.blockInteractionSystem) {
            console.log("Enabling aggressive block interactions for all NPCs");
            GameState.npcSystem.blockInteractionSystem.enableAggressiveBlockInteractions();
        }
    });

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
    document.addEventListener('touchstart', function (event) {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });

    // Prevent zoom on double-click
    document.addEventListener('dblclick', function (event) {
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
export { CLIENT_WORLD_CONFIG, TRAINING_WORLD_CONFIG, npcSystem };