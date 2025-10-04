// ==============================================================
// FILE: research/src/npc/hide-seek/hide-seek-manager.js
// ==============================================================

import { NPC_BEHAVIOR } from "./config-npc-behavior.js";

export class HideSeekManager {
  constructor(scene) {
    this.scene = scene;
    this.gameState = NPC_BEHAVIOR.GAME_STATES.WAITING;

    // Game entities
    this.npcs = [];
    this.seekers = [];
    this.seeker = null;
    this.hiders = [];

    // Game timing
    this.gameStartTime = 0;
    this.countdownStartTime = 0;
    this.gameTimeLimit = NPC_BEHAVIOR.HIDE_AND_SEEK.gameTimeLimit;
    this.countdownTime = NPC_BEHAVIOR.HIDE_AND_SEEK.countdownTime;

    // Game stats
    this.hidersFound = 0;
    this.gameRunning = false;
    this.visualIndicators = new Map();

    console.log(
      "Hide and Seek Manager initialized (ML training mode - no hardcoded AI)"
    );
  }

  //--------------------------------------------------------------//
  //                      Game Lifecycle
  //--------------------------------------------------------------//

  initializeGame(npcs) {
    const requiredNPCs =
      NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount +
      NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;

    if (!npcs || npcs.length < requiredNPCs) {
      console.warn(`Need at least ${requiredNPCs} NPCs for hide and seek`);
      return false;
    }

    this.npcs = npcs.slice(0, requiredNPCs);
    this.assignRoles();
    this.setupVisualIndicators();
    this.resetGameState();
    return true;
  }

  resetGameState() {
    this.gameState = NPC_BEHAVIOR.GAME_STATES.COUNTDOWN;
    this.countdownStartTime = Date.now();
    this.hidersFound = 0;
    this.gameRunning = true;
    
    this.npcs.forEach(npc => {
      npc.justCaughtHider = false;
      npc.caughtTime = null;
    });
  }

  assignRoles() {
    const seekerCount = NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount;
    const hiderCount = NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;
    this.seekers = this.npcs.slice(0, seekerCount);
    this.seekers.forEach((seeker) => {
      this.initializeNPC(seeker, "seeker", NPC_BEHAVIOR.GAME_STATES.WAITING);
    });

    this.seeker = this.seekers[0];

    this.hiders = this.npcs.slice(seekerCount, seekerCount + hiderCount);
    this.hiders.forEach((hider) => {
      this.initializeNPC(hider, "hider", NPC_BEHAVIOR.GAME_STATES.HIDDEN);
    });
  }

  initializeNPC(npc, role, state) {
    npc.role = role;
    npc.hideSeekState = state;
    npc.jumpCooldown = 0;

    // Perception data (for ML)
    npc.lastSeenHider = null;
    npc.isDetected = false;
    npc.detectionTimer = 0;

    // Basic tracking
    npc.lastPosition = npc.position.clone();

    // Clear any AI control flags
    npc.mlControlled = false;

    console.log(`Initialized ${npc.userData?.id} as ${role}`);
  }

  endGame(reason) {
    this.gameState = NPC_BEHAVIOR.GAME_STATES.GAME_OVER;
    this.gameRunning = false;

    const gameTime =
      this.gameStartTime > 0 ? Date.now() - this.gameStartTime : 0;

    console.log(`Hide and Seek game ended: ${reason}`);
    console.log(`Game duration: ${Math.round(gameTime / 1000)} seconds`);
    console.log(`Hiders found: ${this.hidersFound}/${this.hiders.length}`);

    // Clean up NPC states
    this.npcs.forEach((npc) => {
      npc.role = null;
      npc.hideSeekState = null;
      npc.mlControlled = false;
    });
  }

  restartGame() {
    this.endGame("restart");
    setTimeout(() => {
      const requiredNPCs =
        NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount +
        NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;
      if (this.npcs.length >= requiredNPCs) {
        this.initializeGame(this.npcs);
      }
    }, 2000);
  }

  //--------------------------------------------------------------//
  //              Game Update Loop
  //--------------------------------------------------------------//

  update(deltaTime) {
    if (!this.gameRunning) return;

    this.updateGameState();

    if (this.gameState === NPC_BEHAVIOR.GAME_STATES.SEEKING) {
      this.checkDetections();
      this.checkWinConditions();
    }
  }

  updateGameState() {
    const now = Date.now();

    switch (this.gameState) {
      case NPC_BEHAVIOR.GAME_STATES.COUNTDOWN:
        if (now - this.countdownStartTime >= this.countdownTime) {
          this.gameState = NPC_BEHAVIOR.GAME_STATES.SEEKING;
          this.gameStartTime = now;

          this.seekers.forEach((seeker) => {
            seeker.hideSeekState = NPC_BEHAVIOR.GAME_STATES.SEEKING;
          });

          console.log("Hide and seek game started - seeking phase!");
        }
        break;

      case NPC_BEHAVIOR.GAME_STATES.SEEKING:
        if (now - this.gameStartTime >= this.gameTimeLimit) {
          this.endGame("timeout");
        }
        break;
    }
  }

  //--------------------------------------------------------------//
  //                    Detection System
  //--------------------------------------------------------------//

  checkDetections() {
    this.hiders.forEach((hider) => {
      if (hider.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) return;
      const catchingSeeker = this.seekers.find((seeker) => {
        const distance = seeker.position.distanceTo(hider.position);
        return distance < 2;
      });

      if (catchingSeeker) {
        this.processDetection(hider, catchingSeeker);
      } else {
        this.resetDetection(hider);
      }
    });
  }

  processDetection(hider, catchingSeeker) {
    if (!hider.isDetected) {
      hider.isDetected = true;
      hider.detectionTimer = Date.now();
      hider.caughtBySeeker = catchingSeeker;
      console.log(
        `Seeker ${catchingSeeker.userData?.id} catching hider ${hider.userData?.id}...`
      );
    } else {
      const detectionTime = Date.now() - hider.detectionTimer;
      if (detectionTime >= NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.detectionTime) {
        this.catchHider(hider, hider.caughtBySeeker);
      }
    }
  }

  resetDetection(hider) {
    hider.isDetected = false;
    hider.detectionTimer = 0;
    hider.caughtBySeeker = null;
  }

  catchHider(hider, catchingSeeker) {
    hider.hideSeekState = NPC_BEHAVIOR.GAME_STATES.FOUND;
    this.hidersFound++;

    console.log(
      `Hider ${hider.userData?.id} caught by seeker ${catchingSeeker.userData?.id}!`
    );

    // Properly remove the hider from the scene
    hider.visible = false;
    hider.position.y = -100; // Move below the map
    hider.velocity = { x: 0, y: 0, z: 0 };
    hider.isMoving = false;

    // Remove visual indicator
    if (this.visualIndicators.has(hider)) {
      const indicator = this.visualIndicators.get(hider);
      indicator.visible = false;
      if (indicator.parent) {
        indicator.parent.remove(indicator);
      }
    }

    // Store catch time for reward calculation
    hider.caughtTime = Date.now();
    catchingSeeker.lastCatchTime = Date.now();

    catchingSeeker.justCaughtHider = true;
    console.log(`Hider ${hider.userData?.id} successfully removed from game`);
  }

  checkWinConditions() {
    if (this.hidersFound >= this.hiders.length) {
      this.endGame("seeker_wins");
    }
  }

  //--------------------------------------------------------------//
  //                      Visual System
  //--------------------------------------------------------------//

  setupVisualIndicators() {
    this.visualIndicators.forEach((indicator) => {
      if (indicator.parent) {
        indicator.parent.remove(indicator);
      }
    });
    this.visualIndicators.clear();

    if (!NPC_BEHAVIOR.VISUALS.showNPCStatus) return;

    this.npcs.forEach((npc) => {
      const indicator = this.createRoleIndicator(npc);
      if (indicator) {
        npc.add(indicator);
        this.visualIndicators.set(npc, indicator);
      }
    });
  }

  createRoleIndicator(npc) {
    const geometry = new THREE.ConeGeometry(0.2, 0.6, 8);
    const color =
      npc.role === "seeker"
        ? NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.visualIndicatorColor
        : NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.visualIndicatorColor;

    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
    });

    const indicator = new THREE.Mesh(geometry, material);
    indicator.position.y = 2.5;
    indicator.rotation.x = Math.PI;

    return indicator;
  }

  //--------------------------------------------------------------//
  //                      Status Methods
  //--------------------------------------------------------------//

  getGameStatus() {
    return {
      state: this.gameState,
      hidersFound: this.hidersFound,
      totalHiders: this.hiders.length,
      gameTime: this.gameStartTime > 0 ? Date.now() - this.gameStartTime : 0,
      timeLimit: this.gameTimeLimit,
      gameStartTime: this.gameStartTime,
    };
  }
}

export default HideSeekManager;
