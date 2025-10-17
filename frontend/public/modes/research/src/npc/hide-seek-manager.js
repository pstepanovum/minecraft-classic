// ==============================================================
// FILE: research/src/npc/hide-seek-manager.js
// ==============================================================

import { NPC } from "./config-npc-behavior.js";
import { HideSeekManagerLogger } from "../ml/log/hide-seek-manager-logger.js";
import sessionManager from "../ml/log/session-manager.js";
import { TRAINING_WORLD_CONFIG } from "../config-training-world.js";
import { getCurrentTerrainSeed } from "../world/terrain-generator.js";
import { findSafeSpawnHeight, isPositionSafe } from "../world/terrain-utils.js"; // ✅ IMPORT

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

    this.logger = new HideSeekManagerLogger("http://localhost:3001", {
      enabled: true,
      logLevel: "INFO",
      sessionDir: sessionManager.getSessionDir(),
    });

    this.lastCountdownSecond = -1;
  }

  initializeGame(npcs) {
    const requiredNPCs =
      NPC.HIDE_AND_SEEK.seekerCount + NPC.HIDE_AND_SEEK.hiderCount;

    this.logger.logGameInitialization(npcs?.length || 0, requiredNPCs);

    if (!npcs || npcs.length < requiredNPCs) {
      this.logger.logGameInitializationFailed(npcs?.length || 0, requiredNPCs);
      return false;
    }

    this.npcs = npcs.slice(0, requiredNPCs);
    this.assignRoles();
    this.setupVisualIndicators();
    this.resetGameState();

    this.logger.logGameInitializationSuccess();
    return true;
  }

  resetGameState() {
    const oldState = this.gameState;
    this.gameState = NPC.GAME_STATES.COUNTDOWN;
    this.countdownStartTime = Date.now();
    this.hidersFound = 0;
    this.gameRunning = true;
    this.lastCountdownSecond = -1;

    this.logger.logStateChange(oldState, this.gameState);
    this.logger.logCountdownStart(this.countdownTime);

    this.npcs.forEach((npc) => {
      npc.justCaughtHider = false;
      npc.caughtTime = null;
    });
  }

  assignRoles() {
    const seekerCount = NPC.HIDE_AND_SEEK.seekerCount;
    const hiderCount = NPC.HIDE_AND_SEEK.hiderCount;

    this.logger.logRoleAssignment(seekerCount, hiderCount);

    this.seekers = this.npcs.slice(0, seekerCount);
    this.seekers.forEach((seeker) => {
      this.initializeNPC(seeker, "seeker", NPC.GAME_STATES.WAITING);
      this.logger.logNPCRole(
        seeker.userData.id,
        "seeker",
        NPC.GAME_STATES.WAITING
      );
    });

    this.seeker = this.seekers[0];

    this.hiders = this.npcs.slice(seekerCount, seekerCount + hiderCount);
    this.hiders.forEach((hider) => {
      this.initializeNPC(hider, "hider", NPC.GAME_STATES.HIDDEN);
      this.logger.logNPCRole(
        hider.userData.id,
        "hider",
        NPC.GAME_STATES.HIDDEN
      );
    });

    this.verifySpawnDistances();
  }

  verifySpawnDistances() {
    const MIN_SEEKER_HIDER_DISTANCE = 15; // Increased from 10
    const worldSize = TRAINING_WORLD_CONFIG.SIZE;
    const seed = getCurrentTerrainSeed(); // ✅ Get seed

    this.seekers.forEach((seeker) => {
      this.hiders.forEach((hider) => {
        const originalDistance = seeker.position.distanceTo(hider.position);

        if (originalDistance < MIN_SEEKER_HIDER_DISTANCE) {
          const dx = hider.position.x - seeker.position.x;
          const dz = hider.position.z - seeker.position.z;
          const angle = Math.atan2(dz, dx);

          // Try multiple distances until we find a safe position
          for (let distMultiplier = 1.5; distMultiplier <= 3.0; distMultiplier += 0.5) {
            const moveDistance = MIN_SEEKER_HIDER_DISTANCE * distMultiplier;
            
            const newX = hider.position.x - Math.cos(angle) * moveDistance;
            const newZ = hider.position.z - Math.sin(angle) * moveDistance;

            // Check if position is valid (not too close to boundaries)
            if (isPositionSafe(newX, newZ, worldSize, 10)) {
              // ✅ USE TERRAIN FORMULA
              const newY = findSafeSpawnHeight(newX, newZ, seed);

              // Apply new position
              seeker.position.x = Math.floor(newX) + 0.5;
              seeker.position.y = newY;
              seeker.position.z = Math.floor(newZ) + 0.5;

              const newDistance = seeker.position.distanceTo(hider.position);
              
              console.log(`📏 Adjusted seeker spawn: (${seeker.position.x.toFixed(1)}, ${seeker.position.y.toFixed(1)}, ${seeker.position.z.toFixed(1)}) - Distance: ${newDistance.toFixed(1)}`);
              
              this.logger.logSpawnDistanceAdjustment(
                seeker.userData.id,
                hider.userData.id,
                originalDistance,
                newDistance
              );
              
              break; // Found a good position
            }
          }
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
    const gameStats = {
      hidersFound: this.hidersFound,
      totalHiders: this.hiders.length,
      gameTime: this.gameStartTime > 0 ? Date.now() - this.gameStartTime : 0,
    };

    this.logger.logGameEnd(reason, gameStats);

    this.gameState = NPC.GAME_STATES.GAME_OVER;
    this.gameRunning = false;

    this.npcs.forEach((npc) => {
      npc.role = null;
      npc.mlControlled = false;
    });
  }

  restartGame() {
    this.logger.logGameRestart();
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
        const secondsRemaining = Math.ceil(remaining / 1000);

        if (
          secondsRemaining !== this.lastCountdownSecond &&
          secondsRemaining > 0
        ) {
          this.logger.logCountdownTick(secondsRemaining);
          this.lastCountdownSecond = secondsRemaining;
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
          const oldState = this.gameState;
          this.gameState = NPC.GAME_STATES.SEEKING;
          this.gameStartTime = now;

          this.logger.logStateChange(oldState, this.gameState);
          this.logger.logSeekingPhaseStart();

          this.seekers.forEach((seeker) => {
            seeker.hideSeekState = NPC.GAME_STATES.SEEKING;
            seeker.inPreparationPhase = false;
          });
        }
        break;

      case NPC.GAME_STATES.SEEKING:
        if (now - this.gameStartTime >= this.gameTimeLimit) {
          this.logger.logGameTimeout();
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
        if (hider.isDetected) {
          this.logger.logDetectionReset(hider.userData.id);
        }
        this.resetDetection(hider);
      }
    });
  }

  processDetection(hider, catchingSeeker) {
    if (!hider.isDetected) {
      hider.isDetected = true;
      hider.detectionTimer = Date.now();
      hider.caughtBySeeker = catchingSeeker;

      const distance = catchingSeeker.position.distanceTo(hider.position);
      this.logger.logDetectionStarted(
        catchingSeeker.userData.id,
        hider.userData.id,
        distance
      );
    } else {
      const detectionTime = Date.now() - hider.detectionTimer;

      this.logger.logDetectionProgress(
        hider.userData.id,
        detectionTime,
        NPC.HIDE_AND_SEEK.SEEKER.detectionTime
      );

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
    const gameTime = Date.now() - this.gameStartTime;

    this.logger.logHiderCaught(
      catchingSeeker.userData.id,
      hider.userData.id,
      gameTime,
      this.hidersFound + 1,
      this.hiders.length
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
      const gameTime = Date.now() - this.gameStartTime;
      this.logger.logSeekerVictory(this.hidersFound, gameTime);
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

    this.logger.logVisualIndicatorsSetup(this.npcs.length);

    this.npcs.forEach((npc) => {
      const indicator = this.createRoleIndicator(npc);
      if (indicator) {
        npc.add(indicator);
        this.visualIndicators.set(npc, indicator);

        const color =
          npc.role === "seeker"
            ? NPC.HIDE_AND_SEEK.SEEKER.visualIndicatorColor
            : NPC.HIDE_AND_SEEK.HIDER.visualIndicatorColor;

        this.logger.logVisualIndicatorCreated(npc.userData.id, npc.role, color);
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

  cleanup() {
    this.logger.logStats();
    this.logger.close();
  }
}

export default HideSeekManager;
