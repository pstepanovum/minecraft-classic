// ==============================================================
// FILE: frontend/public/modes/research/src/script.js
// ==============================================================

//--------------------------------------------------------------//
//                              Imports
//--------------------------------------------------------------//
import {
  createPlayer,
  addPlayerControls,
} from "../../../src/player/players.js";
import { createMiniMap } from "../../../src/player/map.js";
import { TRAINING_WORLD_CONFIG } from "./config-training-world.js";
import { ChunkManager } from "../../../src/world/chunk_manager.js";
import { Texture, BlockType } from "../../../src/world/textures.js";
import { initializeBlockInteractions } from "../../../src/world/block_interactions.js";
import * as GameState from "../../../src/core/game-state.js";
import BoundaryIntegration from "../../../src/core/game-state-boundary-integration.js";
import ResearchBoundaryIntegration from "../src/world/boundary-integration.js";
import NPCSystem from "../src/npc/npc-system.js";
import HideSeekUI from "../src/ui/hide-seek-ui.js";
import { initializeTraining, loadTrainedModel } from "./ml/start-training.js";

//--------------------------------------------------------------//
//                       Configuration
//--------------------------------------------------------------//
const CLIENT_WORLD_CONFIG = GameState.CLIENT_WORLD_CONFIG;
const DEFAULT_PLAYER_DATA = GameState.DEFAULT_PLAYER_DATA;
const MAX_INSTANCES = CLIENT_WORLD_CONFIG.CHUNK_SIZE ** 3;

//--------------------------------------------------------------//
//                      Global Variables
//--------------------------------------------------------------//
const textureManager = new Texture(
  MAX_INSTANCES,
  CLIENT_WORLD_CONFIG.CHUNK_SIZE
);

// System references - initialized in functions, exported at bottom
let boundarySystem = null;
let researchBoundarySystem = null;
let npcSystem = null;
let hideSeekUI = null;

//--------------------------------------------------------------//
//                              Textures
//--------------------------------------------------------------//
function createChunkMesh(chunk, chunkX, chunkY, chunkZ) {
  return textureManager.createChunkMesh(
    chunk,
    chunkX,
    chunkY,
    chunkZ,
    GameState.scene
  );
}

//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//
function generateInitialChunk() {
  if (!GameState.chunkManager || !GameState.player) return;

  const playerChunkX = Math.floor(
    GameState.player.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE
  );
  const playerChunkZ = Math.floor(
    GameState.player.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE
  );
  GameState.chunkManager.lastPlayerChunkPos = {
    x: playerChunkX,
    z: playerChunkZ,
  };

  GameState.chunkManager.generateInitialChunk();
}

function initChunkManager() {
  const config = GameState.worldConfig || TRAINING_WORLD_CONFIG;

  console.log("Initializing ChunkManager with config:", {
    worldConfig: config,
    clientConfig: CLIENT_WORLD_CONFIG,
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
  const chunkWorker = new Worker("../../../src/web-worker/chunk-worker.js");
  chunkWorker.onmessage = function (e) {
    switch (e.data.type) {
      case "chunkGenerated":
      case "chunkUpdated":
        const { chunk, chunkX, chunkY, chunkZ } = e.data;
        if (GameState.chunkManager) {
          GameState.chunkManager.handleChunkData(chunk, chunkX, chunkY, chunkZ);
          GameState.publish(GameState.EVENTS.CHUNK_LOADED, {
            chunk,
            chunkX,
            chunkY,
            chunkZ,
          });
        } else {
          console.warn(
            "ChunkManager not initialized when receiving chunk data"
          );
        }
        break;
      case "regenerated":
        console.log(`✅ [Worker] Terrain regenerated with seed ${e.data.seed}`);
        break;
      case "error":
        console.error("Chunk generation error:", e.data.error);
        break;
    }
  };

  const workerConfig = {
    type: "init",
    server_config: GameState.worldConfig,
    client_config: CLIENT_WORLD_CONFIG,
    seed: GameState.worldConfig?.SEED || Date.now(),
    block_type: BlockType,
  };

  console.log("Initializing worker with config:", workerConfig);
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

  console.log("World configuration:", data.config);

  // Initialize boundary systems
  initializeResearchBoundarySystem(data.config);
  initializeBoundarySystem(data.config);

  // Initialize systems
  initChunkManager();
  initWebWorker();

  // Apply world modifications if they exist
  if (data.modifications && data.modifications.length > 0) {
    console.log(`Processing ${data.modifications.length} modifications`);

    const chunkModifications = data.modifications.map((mod) => ({
      chunkX: Math.floor(mod.position.x / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
      chunkY: Math.floor(mod.position.y / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
      chunkZ: Math.floor(mod.position.z / CLIENT_WORLD_CONFIG.CHUNK_SIZE),
      localX:
        ((mod.position.x % CLIENT_WORLD_CONFIG.CHUNK_SIZE) +
          CLIENT_WORLD_CONFIG.CHUNK_SIZE) %
        CLIENT_WORLD_CONFIG.CHUNK_SIZE,
      localY:
        ((mod.position.y % CLIENT_WORLD_CONFIG.CHUNK_SIZE) +
          CLIENT_WORLD_CONFIG.CHUNK_SIZE) %
        CLIENT_WORLD_CONFIG.CHUNK_SIZE,
      localZ:
        ((mod.position.z % CLIENT_WORLD_CONFIG.CHUNK_SIZE) +
          CLIENT_WORLD_CONFIG.CHUNK_SIZE) %
        CLIENT_WORLD_CONFIG.CHUNK_SIZE,
      blockType: mod.blockType,
    }));

    setTimeout(() => {
      GameState.chunkWorker.postMessage({
        type: "applyModifications",
        modifications: chunkModifications,
      });
    }, 100);
  }

  if (GameState.player) {
    console.log(
      "Generating initial chunks for player at:",
      GameState.player.position
    );
    generateInitialChunk();
  }
}

//--------------------------------------------------------------//
//               Research Boundary System Integration
//--------------------------------------------------------------//
function initializeResearchBoundarySystem(worldConfig) {
  try {
    console.log("Initializing RESEARCH boundary system for NPC containment...");

    researchBoundarySystem =
      ResearchBoundaryIntegration.initializeResearchBoundaries(
        GameState.scene,
        worldConfig
      );

    ResearchBoundaryIntegration.enableResearchBoundaryIntegration();

    console.log(
      "Research boundary system initialized successfully - NPCs are now contained by invisible walls"
    );
  } catch (error) {
    console.error("Failed to initialize research boundary system:", error);
  }
}

//--------------------------------------------------------------//
//                    Original Boundary System (Backup)
//--------------------------------------------------------------//
function initializeBoundarySystem(worldConfig) {
  try {
    console.log("Initializing backup boundary system...");

    boundarySystem = BoundaryIntegration.initializeBoundarySystem(
      GameState.scene,
      worldConfig
    );

    console.log("Backup boundary system initialized successfully");
  } catch (error) {
    console.error("Failed to initialize backup boundary system:", error);
  }
}

function checkAllEntitiesBoundaries() {
  // Check player boundaries (using original system)
  if (GameState.player && boundarySystem) {
    BoundaryIntegration.checkEntityBoundaries(GameState.player);
  }

  // Check NPC boundaries with RESEARCH system (invisible walls)
  if (npcSystem && npcSystem.npcs && researchBoundarySystem) {
    for (const npc of npcSystem.npcs) {
      if (npc && npc.position) {
        ResearchBoundaryIntegration.enforceNPCContainment(npc);
      }
    }
  }
}

//--------------------------------------------------------------//
//                 ML Training and Loading Logic
//--------------------------------------------------------------//
/**
 * Initializes the ML system and starts a new training session from scratch.
 * This function is triggered by the UI panel.
 */
async function startNewTraining() {
  if (!npcSystem || !npcSystem.hideSeekManager) {
    console.error("Cannot start training: NPCSystem not ready.");
    return;
  }
  console.log("Starting new ML training session...");
  alert(
    "Starting new training session. The UI may become less responsive. Check the console for progress."
  );

  try {
    npcSystem.setGameMode("hide_and_seek");
    const trainer = await initializeTraining(
      npcSystem,
      npcSystem.hideSeekManager,
      GameState.chunkManager
    );

    await trainer.train(2000, { visual: true });
    console.log("✅ Training complete! Models have been saved.");
    alert("Training session finished!");
  } catch (err) {
    console.error("❌ A fatal error occurred during training:", err);
    alert("A fatal error occurred during training. See console for details.");
  }
}

/**
 * Initializes the ML system and loads a pre-trained model for observation.
 * This function is triggered by the UI panel.
 * @param {number} episode The episode number to load.
 */
async function loadExistingModel(episode, seekerFiles, hiderFiles) {
  if (!npcSystem || !npcSystem.hideSeekManager) {
    console.error("Cannot load model: NPCSystem not ready.");
    return;
  }
  console.log(`Loading pre-trained model from episode ${episode}...`);

  try {
    npcSystem.setGameMode("hide_and_seek");
    const trainer = await initializeTraining(
      npcSystem,
      npcSystem.hideSeekManager,
      GameState.chunkManager
    );

    await loadTrainedModel(trainer, episode, seekerFiles, hiderFiles);
    console.log(
      "✅ Model loaded successfully! Starting continuous demonstration."
    );

    // Store the trainer globally so we can stop it later
    window.activeTrainer = trainer;
    window.isRunningDemo = true;

    // Run episodes continuously in a loop
    const runContinuousDemo = async () => {
      while (window.isRunningDemo) {
        console.log("Starting new demonstration episode...");
        await trainer.runEpisode({ visual: true });

        // Small delay between episodes (optional, adjust as needed)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log("Demonstration stopped.");
    };

    runContinuousDemo();
  } catch (error) {
    console.error(`❌ Failed to load model from episode ${episode}.`, error);
    alert(
      `Could not load the model for episode ${episode}. Please check the console for errors.`
    );
  }
}

function startGameIfReady() {
  if (GameState.isGameReady()) {
    console.log("Starting game...");
    try {
      if (!GameState.chunkManager) {
        console.log("Initializing chunk manager...");
        initChunkManager();
      }
      console.log("Generating initial chunks...");
      generateInitialChunk();

      const blockManager = initializeBlockInteractions(GameState.player);
      GameState.setBlockManager(blockManager);

      GameState.publish(GameState.EVENTS.GAME_READY, true);
      animate();
    } catch (error) {
      console.error("Error starting game:", error);
    }
  }
}

//--------------------------------------------------------------//
//                       Initialization
//--------------------------------------------------------------//
async function init() {
  try {
    GameState.createLoadingScreen();

    GameState.updateLoadingMessage("Setting up the scene...");
    GameState.setupScene(TRAINING_WORLD_CONFIG.SIZE);

    GameState.updateLoadingMessage("Configuring lighting...");
    GameState.setupLighting();

    GameState.updateLoadingMessage("Setting up event listeners...");
    setupEventListeners();

    // Disable text selection
    const style = document.createElement("style");
    style.innerHTML = `
      * {
        user-select: none;
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
      }
    `;
    document.head.appendChild(style);

    GameState.updateLoadingMessage("Loading textures...");
    try {
      await textureManager.loadTextureAtlas(
        "../../../assets/images/texture-pack/texture-atlas.png"
      );
      console.log("Textures loaded successfully");
      GameState.setTexturesLoaded(true);
    } catch (error) {
      console.error("Failed to load textures:", error);
    }

    GameState.updateLoadingMessage("Starting in research mode...");
    startOfflineMode();

    GameState.updateLoadingMessage("Initializing world generator...");
    initWebWorker();

    await new Promise((resolve) => setTimeout(resolve, 100));
    GameState.setSchematicsLoaded(true);

    GameState.updateLoadingMessage("Setting up Hide and Seek system...");
    initializeHideSeekSystem();

    GameState.updateLoadingMessage("Preparing the research world...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    GameState.removeLoadingScreen();

    startGameIfReady();

    // All automatic ML logic is now removed from here.

    setTimeout(GameState.showIntroPopup, 1000);
  } catch (error) {
    console.error("Initialization failed:", error);
    GameState.updateLoadingMessage("Failed to initialize game");
  }
}

function startOfflineMode() {
  handleWorldInfo({
    config: TRAINING_WORLD_CONFIG,
    client_config: CLIENT_WORLD_CONFIG,
  });

  handlePlayerInfo(DEFAULT_PLAYER_DATA);
  GameState.updateServerStatus(false);
}

//--------------------------------------------------------------//
//                   Hide and Seek System Integration
//--------------------------------------------------------------//
function initializeHideSeekSystem() {
  if (npcSystem && hideSeekUI) return { npcSystem, hideSeekUI };

  console.log("Initializing Hide and Seek system...");

  npcSystem = new NPCSystem(GameState.scene, GameState.chunkManager).initialize();

  window.npcSystem = npcSystem;

  // Define the callbacks and pass them to the UI
  const mlCallbacks = {
    onStartTraining: startNewTraining,
    onLoadModel: loadExistingModel,
  };

  hideSeekUI = new HideSeekUI(npcSystem, mlCallbacks);

  return { npcSystem, hideSeekUI };
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

  const player = createPlayer(
    GameState.scene,
    {
      ...playerData,
      position,
    },
    "../../../assets/images/skins/1.png",
    true
  );

  GameState.setPlayer(player);
  GameState.setPlayerLoaded(true);
  GameState.updateCamera(position);

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
  let sceneChanged = true;
  let updateCounter = 0;

  GameState.renderer.setAnimationLoop(() => {
    if (GameState.playerControls && GameState.player) {
      GameState.playerControls();
      sceneChanged = true;
    }

    // Update block manager
    if (GameState.blockManager) {
      GameState.blockManager.update();
      sceneChanged = true;
    }

    if (updateCounter % 5 === 0) {
      updateMiniMap();
      updateChunk();
      checkAllEntitiesBoundaries();
      sceneChanged = true;
    }
    updateCounter++;

    const playerLight = GameState.scene.getObjectByProperty(
      "type",
      "PointLight"
    );
    if (playerLight && GameState.player) {
      playerLight.position
        .copy(GameState.player.position)
        .add(new THREE.Vector3(0, 10, 0));
      sceneChanged = true;
    }

    // Update directional light
    const directionalLight = GameState.scene.getObjectByProperty(
      "type",
      "DirectionalLight"
    );
    if (directionalLight && GameState.player) {
      directionalLight.position.set(
        GameState.player.position.x + 50,
        GameState.player.position.y + 100,
        GameState.player.position.z + 50
      );
      directionalLight.target.position.copy(GameState.player.position);
      directionalLight.target.updateMatrixWorld();
      directionalLight.shadow.camera.updateProjectionMatrix();
      sceneChanged = true;
    }

    // Only render if the scene has changed
    if (sceneChanged) {
      GameState.renderer.render(GameState.scene, GameState.camera);
      sceneChanged = false;
    }
  });
}

//--------------------------------------------------------------//
//                       Event Listeners
//--------------------------------------------------------------//
function setupEventListeners() {
  window.addEventListener("resize", GameState.handleWindowResize);

  document.addEventListener("keydown", (e) => {
    // Only handle if not typing in input fields
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    // Hide and seek game controls
    if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.altKey) {
      if (npcSystem) {
        npcSystem.startHideAndSeekGame();
        console.log("Started Hide and Seek game");
      }
    }

    if (e.key.toLowerCase() === "j" && !e.ctrlKey && !e.altKey) {
      if (npcSystem) {
        npcSystem.restartHideSeekGame();
        console.log("Restarted Hide and Seek game");
      }
    }

    if (e.key.toLowerCase() === "k" && !e.ctrlKey && !e.altKey) {
      if (npcSystem) {
        npcSystem.removeAllNPCs();
        console.log("Stopped Hide and Seek game");
      }
    }

    if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.altKey) {
      if (npcSystem) {
        // FIX: Only allow in non-hide_and_seek modes
        if (npcSystem.gameMode !== "hide_and_seek") {
          if (npcSystem.npcs.length < 10) {
            const safePosition =
              ResearchBoundaryIntegration.getSafeNPCSpawnPosition(
                TRAINING_WORLD_CONFIG
              );
            npcSystem.spawnNPC(safePosition);
            console.log("Added additional NPC for testing");
          }
        } else {
          console.warn(
            "Cannot spawn individual NPCs in Hide and Seek mode - use 'H' to start game with config values"
          );
        }
      }
    }

    // Toggle boundary debug visualizations
    if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.altKey) {
      if (boundarySystem) {
        const existingDebug =
          GameState.scene.getObjectByName("worldBoundaryDebug");
        if (existingDebug) {
          boundarySystem.removeDebugVisualization();
          console.log("Original boundary debug visualization disabled");
        } else {
          boundarySystem.createDebugVisualization();
          console.log("Original boundary debug visualization enabled");
        }
      }
    }

    if (e.key.toLowerCase() === "]" && !e.ctrlKey && !e.altKey) {
      if (researchBoundarySystem) {
        const newState =
          ResearchBoundaryIntegration.toggleResearchBoundaryDebug();
        const stateNames = ["hidden", "semi-transparent", "visible"];
        console.log(`Research boundary walls: ${stateNames[newState]}`);
      }
    }
  });
}

// Handle intro popup
document.addEventListener("DOMContentLoaded", () => {
  const closeButton = document.getElementById("close-popup");
  const introPopup = document.getElementById("intro-popup");

  if (closeButton && introPopup) {
    closeButton.addEventListener("click", () => {
      introPopup.style.display = "none";
    });

    closeButton.addEventListener("touchstart", (event) => {
      introPopup.style.display = "none";
      event.preventDefault();
    });
  }
});

// Window load event
window.addEventListener("load", () => {
  init();

  const canvas = document.querySelector("canvas");
  if (!canvas) return;

  function requestFullscreen() {
    if (canvas.requestFullscreen) {
      canvas.requestFullscreen();
    } else if (canvas.mozRequestFullScreen) {
      canvas.mozRequestFullScreen();
    } else if (canvas.webkitRequestFullscreen) {
      canvas.webkitRequestFullscreen();
    } else if (canvas.msRequestFullscreen) {
      canvas.msRequestFullscreen();
    }
  }

  function onWindowResize() {
    if (document.fullscreenElement) {
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    } else {
      canvas.style.width = "";
      canvas.style.height = "";
    }
  }

  requestFullscreen();

  // Fullscreen event listeners
  document.addEventListener("fullscreenchange", onWindowResize);
  document.addEventListener("mozfullscreenchange", onWindowResize);
  document.addEventListener("webkitfullscreenchange", onWindowResize);
  document.addEventListener("msfullscreenchange", onWindowResize);

  // Prevent zoom gestures
  document.addEventListener(
    "touchstart",
    function (event) {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    "dblclick",
    function (event) {
      event.preventDefault();
    },
    { passive: false }
  );

  // Hide address bar on mobile
  window.scrollTo(0, 1);
  window.addEventListener("resize", () => {
    setTimeout(() => {
      window.scrollTo(0, 1);
    }, 0);
  });
});

//--------------------------------------------------------------//
//                         Exports
//--------------------------------------------------------------//
// These functions return the current instances
const getNPCSystem = () => npcSystem;
const getHideSeekUI = () => hideSeekUI;
const getBoundarySystem = () => boundarySystem;
const getResearchBoundarySystem = () => researchBoundarySystem;

export {
  CLIENT_WORLD_CONFIG,
  TRAINING_WORLD_CONFIG,
  getNPCSystem,
  getHideSeekUI,
  getBoundarySystem,
  getResearchBoundarySystem,
};
