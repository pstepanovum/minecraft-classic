// ==============================================================
// FILE: research/src/ml/log/hide-seek-manager-logger.js
// ==============================================================

import { Logger } from "../logger.js";

export class HideSeekManagerLogger extends Logger {
  constructor(serverUrl = "http://localhost:3001", options = {}) {
    super("hide_seek_manager", serverUrl, {
      logInterval: 1, // Log all important events
      flushInterval: 2000,
      bufferSize: 40,
      logLevel: "INFO",
      ...options,
    });

    this.currentGameId = 0;
    this.gamesPlayed = 0;
    this.seekerWins = 0;
    this.hiderWins = 0;
    this.timeouts = 0;
  }

  // ============================================================
  // GAME LIFECYCLE
  // ============================================================

  logGameInitialization(npcCount, requiredNPCs) {
    this.currentGameId++;
    this.gamesPlayed++;

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🎮 HIDE & SEEK GAME #${this.currentGameId} INITIALIZING`);
    this.raw(`${"=".repeat(70)}`);
    this.info(`   NPCs available: ${npcCount}`);
    this.info(`   NPCs required: ${requiredNPCs}`);
  }

  logGameInitializationFailed(npcCount, requiredNPCs) {
    this.error(`❌ Game initialization failed`);
    this.error(`   Available: ${npcCount} NPCs`);
    this.error(`   Required: ${requiredNPCs} NPCs`);
  }

  logGameInitializationSuccess() {
    this.info(`✅ Game initialized successfully`);
    this.flush();
  }

  // ============================================================
  // ROLE ASSIGNMENT
  // ============================================================

  logRoleAssignment(seekerCount, hiderCount) {
    this.raw(`\n${"─".repeat(70)}`);
    this.info(`👥 ROLE ASSIGNMENT`);
    this.info(`   Seekers: ${seekerCount}`);
    this.info(`   Hiders: ${hiderCount}`);
  }

  logNPCRole(npcId, role, state) {
    this.min(`   ${npcId}: ${role} (${state})`);
  }

  logSpawnDistanceAdjustment(seekerId, hiderId, originalDistance, newDistance) {
    this.warn(`⚠️ Adjusting spawn distance`);
    this.warn(`   ${seekerId} was too close to ${hiderId}`);
    this.warn(
      `   Distance: ${originalDistance.toFixed(2)} → ${newDistance.toFixed(2)}`
    );
  }

  // ============================================================
  // GAME STATES
  // ============================================================

  logStateChange(oldState, newState) {
    this.raw(`\n${"─".repeat(70)}`);
    this.info(`🔄 STATE CHANGE: ${oldState} → ${newState}`);
    this.raw(`${"─".repeat(70)}`);
    this.flush();
  }

  logCountdownStart(countdownTime) {
    this.raw(`\n${"=".repeat(70)}`);
    this.info(`⏳ COUNTDOWN PHASE STARTED`);
    this.info(`   Duration: ${countdownTime / 1000}s`);
    this.info(`   Seekers: FROZEN`);
    this.info(`   Hiders: HIDING`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logCountdownTick(secondsRemaining) {
    if (secondsRemaining > 0) {
      this.info(`⏳ Countdown: ${secondsRemaining}s remaining`);
    }
  }

  logSeekingPhaseStart() {
    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🔍 SEEKING PHASE STARTED`);
    this.info(`   Seekers can now move!`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logGameTimeout() {
    this.timeouts++;
    this.hiderWins++;

    this.raw(`\n${"=".repeat(70)}`);
    this.warn(`⏰ GAME TIMEOUT - Time limit reached`);
    this.info(`   Result: HIDERS WIN!`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  // ============================================================
  // DETECTION & CATCHING
  // ============================================================

  logDetectionStarted(seekerId, hiderId, distance) {
    this.info(`⚠️ Detection started`);
    this.info(`   Seeker: ${seekerId}`);
    this.info(`   Hider: ${hiderId}`);
    this.info(`   Distance: ${distance.toFixed(2)}m`);
  }

  logDetectionProgress(hiderId, elapsed, required) {
    if (elapsed % 200 < 16) {
      this.min(`⏱️ Detecting ${hiderId}: ${elapsed}ms / ${required}ms`);
    }
  }

  logDetectionReset(hiderId) {
    this.min(`↩️ Detection reset: ${hiderId} escaped`);
  }

  logHiderCaught(seekerId, hiderId, gameTime, caughtCount, totalHiders) {
    this.raw(`\n${"─".repeat(70)}`);
    this.info(`🎯 HIDER CAUGHT!`);
    this.info(`   Seeker: ${seekerId}`);
    this.info(`   Hider: ${hiderId}`);
    this.info(`   Game time: ${(gameTime / 1000).toFixed(1)}s`);
    this.info(`   Progress: ${caughtCount}/${totalHiders} hiders caught`);
    this.raw(`${"─".repeat(70)}`);
    this.flush();
  }

  // ============================================================
  // WIN CONDITIONS
  // ============================================================

  logSeekerVictory(totalCaught, gameTime) {
    this.seekerWins++;

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🏆 SEEKER WINS!`);
    this.info(`   All ${totalCaught} hiders caught`);
    this.info(`   Game time: ${(gameTime / 1000).toFixed(1)}s`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logHiderVictory(remainingHiders, gameTime) {
    this.hiderWins++;

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🏆 HIDERS WIN!`);
    this.info(`   ${remainingHiders} hiders survived`);
    this.info(`   Game time: ${(gameTime / 1000).toFixed(1)}s`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  // ============================================================
  // GAME END
  // ============================================================

  logGameEnd(reason, gameStats = {}) {
    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🏁 GAME #${this.currentGameId} ENDED`);
    this.info(`   Reason: ${reason}`);

    if (gameStats.hidersFound !== undefined) {
      this.info(
        `   Hiders caught: ${gameStats.hidersFound}/${gameStats.totalHiders}`
      );
    }

    if (gameStats.gameTime) {
      this.info(`   Duration: ${(gameStats.gameTime / 1000).toFixed(1)}s`);
    }

    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logGameRestart() {
    this.info(`🔄 Game restarting in 2 seconds...`);
    this.flush();
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  getStats() {
    return {
      gamesPlayed: this.gamesPlayed,
      seekerWins: this.seekerWins,
      hiderWins: this.hiderWins,
      timeouts: this.timeouts,
      seekerWinRate:
        this.gamesPlayed > 0
          ? ((this.seekerWins / this.gamesPlayed) * 100).toFixed(1) + "%"
          : "N/A",
      hiderWinRate:
        this.gamesPlayed > 0
          ? ((this.hiderWins / this.gamesPlayed) * 100).toFixed(1) + "%"
          : "N/A",
    };
  }

  logStats() {
    const stats = this.getStats();

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`📊 HIDE & SEEK STATISTICS`);
    this.raw(`${"=".repeat(70)}`);
    this.info(`   Total games: ${stats.gamesPlayed}`);
    this.info(`   Seeker wins: ${stats.seekerWins} (${stats.seekerWinRate})`);
    this.info(`   Hider wins: ${stats.hiderWins} (${stats.hiderWinRate})`);
    this.info(`   Timeouts: ${stats.timeouts}`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  // ============================================================
  // VISUAL INDICATORS
  // ============================================================

  logVisualIndicatorsSetup(count) {
    this.min(`🎨 Setting up ${count} visual indicators`);
  }

  logVisualIndicatorCreated(npcId, role, color) {
    this.min(`   ${npcId}: ${role} indicator (${color})`);
  }
}

export default HideSeekManagerLogger;
