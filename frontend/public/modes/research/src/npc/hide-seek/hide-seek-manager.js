// ==============================================================
// FILE: research/src/npc/hide-seek/hide-seek-manager.js
// ==============================================================

import { NPC_BEHAVIOR } from "../config-npc-behavior.js";
import * as GameState from "../../../../../src/core/game-state.js";
import NPCVisionDebug from "../vision/npc-vision-debug.js";
import NPCCameraView from "../vision/npc-camera-view.js";

export class HideSeekManager {
  constructor(scene) {
    this.scene = scene;
    this.gameState = NPC_BEHAVIOR.GAME_STATES.WAITING;

    // Game entities
    this.npcs = [];
    this.seekers = []; // FIX: Array to support multiple seekers
    this.seeker = null; // Keep for backward compatibility (first seeker)
    this.hiders = [];

    // Game timing
    this.gameStartTime = 0;
    this.countdownStartTime = 0;
    this.gameTimeLimit = NPC_BEHAVIOR.HIDE_AND_SEEK.gameTimeLimit;
    this.countdownTime = NPC_BEHAVIOR.HIDE_AND_SEEK.countdownTime;

    // Game stats
    this.hidersFound = 0;
    this.gameRunning = false;

    // Debug systems
    this.visionDebug = new NPCVisionDebug(scene);
    this.npcCameraView = null;
    this.visualIndicators = new Map();

    console.log("Hide and Seek Manager initialized");
  }

  //--------------------------------------------------------------//
  //                      Game Lifecycle
  //--------------------------------------------------------------//

  initializeGame(npcs) {
    const requiredNPCs =
      NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount +
      NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;

    if (!npcs || npcs.length < requiredNPCs) {
      console.warn(
        `Need at least ${requiredNPCs} NPCs for hide and seek (${NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount} seeker(s) + ${NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount} hider(s))`
      );
      return false;
    }

    this.npcs = npcs.slice(0, requiredNPCs);
    this.assignRoles();
    this.setupVisualIndicators();
    this.resetGameState();

    console.log("Hide and Seek game initialized:", {
      seekers: this.seekers.map((s) => s.userData?.id),
      hiders: this.hiders.map((h) => h.userData?.id),
    });

    return true;
  }

  initializeCameraView(renderer) {
    this.npcCameraView = new NPCCameraView(this.scene, renderer);
    console.log("NPC Camera View initialized");
  }

  resetGameState() {
    this.gameState = NPC_BEHAVIOR.GAME_STATES.COUNTDOWN;
    this.countdownStartTime = Date.now();
    this.hidersFound = 0;
    this.gameRunning = true;
  }

  assignRoles() {
    const shuffled = [...this.npcs].sort(() => Math.random() - 0.5);

    const seekerCount = NPC_BEHAVIOR.HIDE_AND_SEEK.seekerCount;
    const hiderCount = NPC_BEHAVIOR.HIDE_AND_SEEK.hiderCount;

    // FIX: Assign multiple seekers
    this.seekers = shuffled.slice(0, seekerCount);
    this.seekers.forEach((seeker) => {
      this.initializeNPC(seeker, "seeker", NPC_BEHAVIOR.GAME_STATES.WAITING);
    });

    // Keep first seeker for backward compatibility
    this.seeker = this.seekers[0];

    // Assign hiders
    this.hiders = shuffled.slice(seekerCount, seekerCount + hiderCount);
    this.hiders.forEach((hider) => {
      this.initializeNPC(hider, "hider", NPC_BEHAVIOR.GAME_STATES.HIDDEN);
    });

    console.log(
      `✅ Assigned roles: ${seekerCount} seeker(s), ${hiderCount} hider(s)`
    );
  }

  initializeNPC(npc, role, state) {
    npc.role = role;
    npc.hideSeekState = state;
    npc.jumpCooldown = 0;

    // Reset NPC-specific properties
    npc.lastSeenHider = null;
    npc.searchTarget = null;
    npc.giveUpTimer = 0;
    npc.hidingSpot = null;
    npc.hideTimer = 0;
    npc.isDetected = false;
    npc.detectionTimer = 0;
    npc.randomTarget = null;

    // Simple stuck detection
    npc.stuckTimer = 0;
    npc.lastPosition = npc.position.clone();
    npc.moveAwayTarget = null;
    npc.moveAwayTimer = 0;
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
      npc.searchTarget = null;
      npc.hidingSpot = null;
      npc.randomTarget = null;
      npc.moveAwayTarget = null;
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
  //                      Game Update Loop
  //--------------------------------------------------------------//

  update(deltaTime) {
    if (!this.gameRunning) return;

    this.updateGameState();

    if (this.gameState === NPC_BEHAVIOR.GAME_STATES.SEEKING) {
      this.updateSeekers(deltaTime); // FIX: Update ALL seekers
      this.updateHiders(deltaTime);
      this.checkDetections();
      this.checkWinConditions();
    }

    // Update debug systems
    if (this.visionDebug) {
      this.visionDebug.update(this.npcs);
    }
    if (this.npcCameraView) {
      this.npcCameraView.update();
    }
  }

  updateGameState() {
    const now = Date.now();

    switch (this.gameState) {
      case NPC_BEHAVIOR.GAME_STATES.COUNTDOWN:
        if (now - this.countdownStartTime >= this.countdownTime) {
          this.gameState = NPC_BEHAVIOR.GAME_STATES.SEEKING;
          this.gameStartTime = now;

          // FIX: Set ALL seekers to SEEKING state
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
  //            FIX #2: Multi-Seeker Behavior Update
  //--------------------------------------------------------------//

  updateSeekers(deltaTime) {
    // FIX: Update ALL seekers, not just one
    this.seekers.forEach((seeker) => {
      this.updateSingleSeeker(seeker, deltaTime);
    });
  }

  updateSingleSeeker(seeker, deltaTime) {
    if (!seeker) return;

    this.updateJumpCooldown(seeker, deltaTime);
    this.updateStuckDetection(seeker, deltaTime);

    // Check if seeker needs to move away after catching someone
    if (seeker.moveAwayTimer > 0) {
      seeker.moveAwayTimer -= deltaTime * 1000;
      if (seeker.moveAwayTarget) {
        this.moveTowardsTarget(
          seeker,
          seeker.moveAwayTarget,
          NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.moveSpeed,
          deltaTime
        );
        return;
      }
    }

    const visibleHider = this.findVisibleHider(seeker);

    if (visibleHider) {
      this.chaseHider(seeker, visibleHider, deltaTime);
    } else if (seeker.lastSeenHider) {
      this.searchLastKnownPosition(seeker, deltaTime);
    } else {
      this.performRandomSearch(seeker, deltaTime);
    }
  }

  findVisibleHider(seeker) {
    if (!seeker || !this.visionDebug) return null;

    // Only check hiders that haven't been found yet
    const activeHiders = this.hiders.filter(
      (hider) => hider.hideSeekState !== NPC_BEHAVIOR.GAME_STATES.FOUND
    );

    if (activeHiders.length === 0) return null;

    const visibleTargets = this.visionDebug.findVisibleTarget(
      seeker,
      activeHiders
    );
    return visibleTargets.length > 0 ? visibleTargets[0].target : null;
  }

  chaseHider(seeker, hider, deltaTime) {
    seeker.searchTarget = hider;
    seeker.lastSeenHider = {
      position: hider.position.clone(),
      time: Date.now(),
    };
    seeker.giveUpTimer = 0;

    this.moveTowardsTarget(
      seeker,
      hider.position,
      NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.moveSpeed,
      deltaTime
    );
  }

  searchLastKnownPosition(seeker, deltaTime) {
    const timeSinceLastSeen = Date.now() - seeker.lastSeenHider.time;

    if (timeSinceLastSeen < NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.memoryTime) {
      this.moveTowardsTarget(
        seeker,
        seeker.lastSeenHider.position,
        NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.moveSpeed,
        deltaTime
      );
    } else {
      seeker.giveUpTimer += deltaTime * 1000;
      if (seeker.giveUpTimer >= NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.giveUpTime) {
        seeker.lastSeenHider = null;
        seeker.searchTarget = null;
        seeker.giveUpTimer = 0;
      }
    }
  }

  //--------------------------------------------------------------//
  //                      Hider Behavior
  //--------------------------------------------------------------//

  updateHiders(deltaTime) {
    this.hiders.forEach((hider) => {
      if (hider.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) return;

      this.updateJumpCooldown(hider, deltaTime);
      this.updateStuckDetection(hider, deltaTime);

      // FIX: Check distance to ALL seekers, flee from closest
      const closestSeeker = this.findClosestSeeker(hider);
      if (!closestSeeker) return;

      const distanceToSeeker = closestSeeker.position.distanceTo(
        hider.position
      );
      const isInDanger =
        distanceToSeeker < NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.fleeDistance;

      if (isInDanger) {
        this.makeHiderFlee(hider, closestSeeker, deltaTime);
      } else {
        this.makeHiderHide(hider, deltaTime);
      }
    });
  }

  findClosestSeeker(hider) {
    if (this.seekers.length === 0) return null;

    let closest = this.seekers[0];
    let minDistance = hider.position.distanceTo(closest.position);

    for (let i = 1; i < this.seekers.length; i++) {
      const distance = hider.position.distanceTo(this.seekers[i].position);
      if (distance < minDistance) {
        minDistance = distance;
        closest = this.seekers[i];
      }
    }

    return closest;
  }

  makeHiderFlee(hider, fromSeeker, deltaTime) {
    hider.hideSeekState = NPC_BEHAVIOR.GAME_STATES.FLEEING;

    const fleeDirection = hider.position.clone().sub(fromSeeker.position);
    fleeDirection.y = 0;
    fleeDirection.normalize();

    const fleeTarget = hider.position
      .clone()
      .add(fleeDirection.multiplyScalar(10));

    this.moveTowardsTarget(
      hider,
      fleeTarget,
      NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.panicMoveSpeed,
      deltaTime
    );
  }

  makeHiderHide(hider, deltaTime) {
    hider.hideSeekState = NPC_BEHAVIOR.GAME_STATES.HIDDEN;

    if (!hider.hidingSpot || hider.hideTimer <= 0) {
      hider.hidingSpot = this.findNearbyHidingSpot(hider.position);
      hider.hideTimer = NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.hidingTime;
    }

    if (hider.hidingSpot) {
      const distance = hider.position.distanceTo(hider.hidingSpot);
      if (distance > 1) {
        this.moveTowardsTarget(
          hider,
          hider.hidingSpot,
          NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.stealthMoveSpeed,
          deltaTime
        );
      } else {
        hider.hideTimer -= deltaTime * 1000;
        hider.isMoving = false;
      }
    } else {
      this.performRandomSearch(hider, deltaTime);
    }
  }

  //--------------------------------------------------------------//
  //                      Movement System
  //--------------------------------------------------------------//

  moveTowardsTarget(npc, targetPos, speed, deltaTime) {
    const direction = targetPos.clone().sub(npc.position);
    direction.y = 0;

    if (direction.lengthSq() < 0.01) {
      npc.isMoving = false;
      return;
    }

    direction.normalize();

    const NPCPhysics = window.NPCPhysics;
    if (!NPCPhysics || !NPCPhysics.moveNPC) {
      console.warn("NPCPhysics not available");
      return;
    }

    const movementResult = NPCPhysics.moveNPC(
      npc,
      direction,
      speed,
      this.scene,
      deltaTime
    );

    if (
      (movementResult.xBlocked || movementResult.zBlocked) &&
      npc.isOnGround &&
      npc.jumpCooldown <= 0
    ) {
      const jumpSuccess = NPCPhysics.makeNPCJump(npc);
      if (jumpSuccess) {
        npc.jumpCooldown = 0.5;
      }
    }

    if (
      !movementResult.hasMoved &&
      (movementResult.xBlocked || movementResult.zBlocked)
    ) {
      npc.stuckTimer += deltaTime * 1000;
      if (npc.stuckTimer > 1500) {
        this.generateNewRandomTarget(npc);
        npc.stuckTimer = 0;
      }
    } else {
      npc.stuckTimer = 0;
    }

    npc.yaw = Math.atan2(-direction.x, -direction.z);
    npc.isMoving = movementResult.hasMoved;
  }

  performRandomSearch(npc, deltaTime) {
    if (!npc.randomTarget || Math.random() < 0.05) {
      this.generateNewRandomTarget(npc);
    }

    this.moveTowardsTarget(
      npc,
      npc.randomTarget,
      NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.moveSpeed * 0.7,
      deltaTime
    );
  }

  generateNewRandomTarget(npc) {
    const attempts = 10;

    for (let i = 0; i < attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 3 + Math.random() * 8;

      const newTarget = new THREE.Vector3(
        npc.position.x + Math.cos(angle) * distance,
        npc.position.y,
        npc.position.z + Math.sin(angle) * distance
      );

      const worldSize = GameState.worldConfig?.SIZE || 512;
      const margin = 10;

      if (
        newTarget.x > margin &&
        newTarget.x < worldSize - margin &&
        newTarget.z > margin &&
        newTarget.z < worldSize - margin
      ) {
        npc.randomTarget = newTarget;
        return;
      }
    }

    const worldSize = GameState.worldConfig?.SIZE || 512;
    const center = worldSize / 2;
    npc.randomTarget = new THREE.Vector3(
      center + (Math.random() * 20 - 10),
      npc.position.y,
      center + (Math.random() * 20 - 10)
    );
  }

  updateStuckDetection(npc, deltaTime) {
    const distanceMoved = npc.position.distanceTo(npc.lastPosition);

    if (distanceMoved < 0.1) {
      npc.stuckTimer += deltaTime * 1000;

      if (npc.stuckTimer > 3000) {
        console.log(`NPC ${npc.userData?.id} stuck, clearing targets`);
        npc.randomTarget = null;
        npc.hidingSpot = null;
        npc.searchTarget = null;
        npc.stuckTimer = 0;
        this.generateNewRandomTarget(npc);
      }
    } else {
      npc.stuckTimer = 0;
    }

    npc.lastPosition.copy(npc.position);
  }

  updateJumpCooldown(npc, deltaTime) {
    if (npc.jumpCooldown > 0) {
      npc.jumpCooldown -= deltaTime;
    }
  }

  //--------------------------------------------------------------//
  //                      Hiding System
  //--------------------------------------------------------------//

  findNearbyHidingSpot(position) {
    const searchRadius = NPC_BEHAVIOR.HIDE_AND_SEEK.HIDER.hideRange;
    const attempts = 10;

    for (let i = 0; i < attempts; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * searchRadius;

      const testPos = new THREE.Vector3(
        position.x + Math.cos(angle) * distance,
        position.y,
        position.z + Math.sin(angle) * distance
      );

      if (this.isGoodHidingSpot(testPos)) {
        return testPos;
      }
    }

    return null;
  }

  isGoodHidingSpot(position) {
    let coverScore = 0;
    const checkRadius = 2;

    for (let x = -checkRadius; x <= checkRadius; x++) {
      for (let z = -checkRadius; z <= checkRadius; z++) {
        if (x === 0 && z === 0) continue;

        try {
          const blockType = GameState.getBlockType(
            Math.floor(position.x + x),
            Math.floor(position.y + 1),
            Math.floor(position.z + z)
          );

          if (blockType > 0 && blockType !== 8 && blockType !== 9) {
            coverScore++;
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }

    return coverScore >= 3;
  }

  //--------------------------------------------------------------//
  //                      Detection System
  //--------------------------------------------------------------//

  checkDetections() {
    this.hiders.forEach((hider) => {
      if (hider.hideSeekState === NPC_BEHAVIOR.GAME_STATES.FOUND) return;

      // FIX: Check if ANY seeker is close enough to catch
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
      hider.caughtBySeeker = catchingSeeker; // Track which seeker is catching
      console.log(
        `Seeker ${catchingSeeker.userData?.id} is catching hider ${hider.userData?.id}...`
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
      `✅ Hider ${hider.userData?.id} caught by seeker ${catchingSeeker.userData?.id}!`
    );

    hider.visible = false;

    if (this.visualIndicators.has(hider)) {
      const indicator = this.visualIndicators.get(hider);
      indicator.visible = false;
    }

    // Make the catching seeker move away
    const moveAwayDirection = new THREE.Vector3(
      Math.random() * 2 - 1,
      0,
      Math.random() * 2 - 1
    ).normalize();

    catchingSeeker.moveAwayTarget = catchingSeeker.position
      .clone()
      .add(moveAwayDirection.multiplyScalar(5));

    catchingSeeker.moveAwayTimer = 1500;
    catchingSeeker.searchTarget = null;
    catchingSeeker.lastSeenHider = null;

    console.log(`Eliminated NPC ${hider.userData?.id} removed from map`);
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
  //                      Debug Controls
  //--------------------------------------------------------------//

  toggleVisionDebug() {
    return this.visionDebug ? this.visionDebug.toggleDebug() : false;
  }

  toggleVisionCones() {
    return this.visionDebug ? this.visionDebug.toggleVisionCones() : false;
  }

  toggleRaycastLines() {
    return this.visionDebug ? this.visionDebug.toggleRaycastLines() : false;
  }

  toggleNPCCamera(npc = null) {
    if (!this.npcCameraView) return false;
    const targetNPC = npc || this.seeker;
    return this.npcCameraView.toggle(targetNPC);
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
    };
  }

  getVisionDebugInfo() {
    if (!this.seeker || !this.visionDebug) return null;

    const seekerInfo = this.visionDebug.getDebugInfo(this.seeker);
    const visibleTargets = this.visionDebug.findVisibleTarget(
      this.seeker,
      this.hiders
    );

    return {
      seeker: seekerInfo,
      targets: visibleTargets,
      debugEnabled: this.visionDebug.debugEnabled,
      visionConesVisible: this.visionDebug.showVisionCones,
      raycastLinesVisible: this.visionDebug.showRaycastLines,
      cameraViewActive: this.npcCameraView
        ? this.npcCameraView.isActive
        : false,
    };
  }
}

export default HideSeekManager;
