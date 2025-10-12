// ==============================================================
// FILE: research/src/npc/hide-seek/hide-seek-manager.js
// ==============================================================

import { NPC } from "./config-npc-behavior.js";

export class HideSeekManager {
  constructor(scene) {
    this.scene = scene;
    this.gameState = NPC.GAME_STATES.WAITING;
    this.npcs = [];
    this.seekers = [];
    this.seeker = null;
    this.hiders = [];
    this.gameStartTime = 0;
    this.countdownStartTime = 0;
    this.gameTimeLimit = NPC.HIDE_AND_SEEK.gameTimeLimit;
    this.countdownTime = NPC.HIDE_AND_SEEK.countdownTime;
    this.hidersFound = 0;
    this.gameRunning = false;
    this.visualIndicators = new Map();
  }

  initializeGame(npcs) {
    const requiredNPCs =
      NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;

    if (!npcs || npcs.length < requiredNPCs) {
      return false;
    }

    this.npcs = npcs.slice(0, requiredNPCs);
    this.assignRoles();
    this.setupVisualIndicators();
    this.resetGameState();
    return true;
  }

  resetGameState() {
    this.gameState = NPC.GAME_STATES.COUNTDOWN;
    this.countdownStartTime = Date.now();
    this.hidersFound = 0;
    this.gameRunning = true;

    this.npcs.forEach((npc) => {
      npc.justCaughtHider = false;
      npc.caughtTime = null;
    });
  }

  assignRoles() {
    const seekerCount = NPC.HIDE_AND_SEEK.seekerCount;
    const hiderCount = NPC.HIDE_AND_SEEK.hiderCount;

    this.seekers = this.npcs.slice(0, seekerCount);
    this.seekers.forEach((seeker) => {
      this.initializeNPC(seeker, "seeker", NPC.GAME_STATES.WAITING);
    });

    this.seeker = this.seekers[0];

    this.hiders = this.npcs.slice(seekerCount, seekerCount + hiderCount);
    this.hiders.forEach((hider) => {
      this.initializeNPC(hider, "hider", NPC.GAME_STATES.HIDDEN);
    });

    this.verifySpawnDistances();
  }

  verifySpawnDistances() {
    const MIN_SEEKER_HIDER_DISTANCE = 10;

    this.seekers.forEach((seeker) => {
      this.hiders.forEach((hider) => {
        const distance = seeker.position.distanceTo(hider.position);

        if (distance < MIN_SEEKER_HIDER_DISTANCE) {
          const dx = hider.position.x - seeker.position.x;
          const dz = hider.position.z - seeker.position.z;
          const angle = Math.atan2(dz, dx);

          seeker.position.x = hider.position.x - Math.cos(angle) * 15;
          seeker.position.z = hider.position.z - Math.sin(angle) * 15;
        }
      });
    });
  }

  initializeNPC(npc, role, state) {
    npc.role = role;
    npc.hideSeekState = state;
    npc.jumpCooldown = 0;
    npc.lastSeenHider = null;
    npc.isDetected = false;
    npc.detectionTimer = 0;
    npc.lastPosition = npc.position.clone();
    npc.mlControlled = false;

    npc.inPreparationPhase = role === "seeker";
  }

  endGame(reason) {
    this.gameState = NPC.GAME_STATES.GAME_OVER;
    this.gameRunning = false;

    const gameTime =
      this.gameStartTime > 0 ? Date.now() - this.gameStartTime : 0;

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
        NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;
      if (this.npcs.length >= requiredNPCs) {
        this.initializeGame(this.npcs);
      }
    }, 2000);
  }

  update(deltaTime) {
    if (!this.gameRunning) return;

    this.updateGameState();

    if (this.gameState === NPC.GAME_STATES.SEEKING) {
      this.checkDetections();
      this.checkWinConditions();
    }
  }

  updateGameState() {
    const now = Date.now();

    switch (this.gameState) {
      case NPC.GAME_STATES.COUNTDOWN:
        const timeInCountdown = now - this.countdownStartTime;
        const remaining = this.countdownTime - timeInCountdown;

        // ADD THIS:
        const secondsRemaining = Math.ceil(remaining / 1000);
        const prevSecondsRemaining = Math.ceil((remaining - 16) / 1000);
        if (secondsRemaining !== prevSecondsRemaining && secondsRemaining > 0) {
          console.log(
            `⏳ Countdown: ${secondsRemaining}s remaining - Seekers frozen, hiders hiding...`
          );
        }

        if (timeInCountdown < this.countdownTime) {
          this.seekers.forEach((seeker) => {
            seeker.inPreparationPhase = true;
            seeker.velocity = { x: 0, y: 0, z: 0 };
            seeker.isMoving = false;
          });

          this.hiders.forEach((hider) => {
            hider.inPreparationPhase = false;
          });
        } else {
          this.gameState = NPC.GAME_STATES.SEEKING;
          this.gameStartTime = now;

          // ADD THIS:
          console.log("🔍 SEEKING PHASE STARTED - Seekers can now move!");

          this.seekers.forEach((seeker) => {
            seeker.hideSeekState = NPC.GAME_STATES.SEEKING;
            seeker.inPreparationPhase = false;
          });
        }
        break;

      case NPC.GAME_STATES.SEEKING:
        if (now - this.gameStartTime >= this.gameTimeLimit) {
          console.log("⏰ TIMEOUT - Hiders win!");
          this.endGame("timeout");
        }
        break;
    }
  }

  checkDetections() {
    this.hiders.forEach((hider) => {
      if (hider.hideSeekState === NPC.GAME_STATES.FOUND) return;
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

      // ADD THIS:
      const distance = catchingSeeker.position.distanceTo(hider.position);
      console.log(
        `⚠️ Detection started: ${catchingSeeker.userData.id} → ${
          hider.userData.id
        } (distance: ${distance.toFixed(2)})`
      );
    } else {
      const detectionTime = Date.now() - hider.detectionTimer;

      if (detectionTime % 200 < 16) {
        console.log(
          `⏱️ Detecting ${hider.userData.id}: ${detectionTime}ms / ${NPC.HIDE_AND_SEEK.SEEKER.detectionTime}ms`
        );
      }

      if (detectionTime >= NPC.HIDE_AND_SEEK.SEEKER.detectionTime) {
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
    // ADD THIS:
    const gameTime = Date.now() - this.gameStartTime;
    console.log(
      `🎯 CAUGHT! ${catchingSeeker.userData.id} caught ${
        hider.userData.id
      } at ${(gameTime / 1000).toFixed(1)}s`
    );
    console.log(
      `   Total caught: ${this.hidersFound + 1}/${this.hiders.length}`
    );

    hider.hideSeekState = NPC.GAME_STATES.FOUND;
    this.hidersFound++;
    hider.visible = false;
    hider.position.y = -100;
    hider.velocity = { x: 0, y: 0, z: 0 };
    hider.isMoving = false;

    if (this.visualIndicators.has(hider)) {
      const indicator = this.visualIndicators.get(hider);
      indicator.visible = false;
      if (indicator.parent) {
        indicator.parent.remove(indicator);
      }
    }

    hider.caughtTime = Date.now();
    catchingSeeker.lastCatchTime = Date.now();

    catchingSeeker.justCaughtHider = true;
  }

  checkWinConditions() {
    if (this.hidersFound >= this.hiders.length) {
      console.log("🏆 SEEKER WINS - All hiders caught!");
      this.endGame("seeker_wins");
    }
  }

  setupVisualIndicators() {
    this.visualIndicators.forEach((indicator) => {
      if (indicator.parent) {
        indicator.parent.remove(indicator);
      }
    });
    this.visualIndicators.clear();

    if (!NPC.VISUALS.showNPCStatus) return;

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
        ? NPC.HIDE_AND_SEEK.SEEKER.visualIndicatorColor
        : NPC.HIDE_AND_SEEK.HIDER.visualIndicatorColor;

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
