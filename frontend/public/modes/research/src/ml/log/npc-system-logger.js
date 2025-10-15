// ==============================================================
// FILE: research/src/ml/log/npc-system-logger.js
// ==============================================================

import { Logger } from "../logger.js";

export class NPCSystemLogger extends Logger {
  constructor(serverUrl = "http://localhost:3001", options = {}) {
    super("npc_system", serverUrl, {
      logInterval: 1, // Log every spawn/important event
      flushInterval: 3000,
      bufferSize: 30,
      logLevel: "INFO", // Can be MIN, INFO, WARN, ERROR
      ...options,
    });

    this.spawnAttempts = 0;
    this.successfulSpawns = 0;
    this.failedSpawns = 0;
  }

  // ============================================================
  // SPAWN TRACKING
  // ============================================================

  logSpawnAttempt(index, position, role) {
    this.spawnAttempts++;

    if (this.shouldLog()) {
      this.info(`🎯 Attempting to spawn NPC #${index}`);
      if (role) {
        this.info(`   Role: ${role}`);
      }
      if (position) {
        this.info(
          `   Target: (${position.x?.toFixed(1)}, ${position.y?.toFixed(
            1
          )}, ${position.z?.toFixed(1)})`
        );
      }
    }
  }

  logSpawnSuccess(npcId, position, role) {
    this.successfulSpawns++;

    this.info(`✅ NPC spawned successfully`);
    this.info(`   ID: ${npcId}`);
    this.info(`   Role: ${role || "default"}`);
    this.info(
      `   Position: (${position.x.toFixed(1)}, ${position.y.toFixed(
        1
      )}, ${position.z.toFixed(1)})`
    );
    this.info(`   Total NPCs: ${this.successfulSpawns}`);
  }

  logSpawnFailure(reason, details = {}) {
    this.failedSpawns++;

    this.warn(`❌ Spawn failed: ${reason}`);
    if (details.attempts) {
      this.warn(`   Attempts made: ${details.attempts}`);
    }
    if (details.position) {
      this.warn(
        `   Last position: (${details.position.x?.toFixed(
          1
        )}, ${details.position.y?.toFixed(1)}, ${details.position.z?.toFixed(
          1
        )})`
      );
    }
    this.warn(`   Failed spawns: ${this.failedSpawns}`);
  }

  // ============================================================
  // POSITION FINDING
  // ============================================================

  logPositionSearch(attempt, maxAttempts) {
    if (attempt % 25 === 0) {
      // Log every 25 attempts
      this.min(
        `🔍 Searching for valid position... (${attempt}/${maxAttempts})`
      );
    }
  }

  logValidPosition(x, y, z, attempt) {
    this.info(`✅ Valid spawn position found`);
    this.info(
      `   Location: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`
    );
    this.info(`   Attempts: ${attempt}`);
  }

  logFallbackPosition(x, y, z, reason) {
    this.warn(`⚠️ Using fallback spawn position`);
    this.warn(`   Reason: ${reason}`);
    this.warn(
      `   Position: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`
    );
  }

  logEmergencyPosition(x, y, z) {
    this.error(`❌ EMERGENCY: Using world center spawn!`);
    this.error(
      `   Position: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`
    );
    this.error(`   This should rarely happen - check world generation`);
  }

  // ============================================================
  // GROUND DETECTION
  // ============================================================

  logGroundSearch(x, z, startY) {
    if (this.config.logLevel === "MIN") {
      this.min(
        `🔎 Searching for ground at (${x.toFixed(1)}, ${z.toFixed(
          1
        )}) from Y=${startY}`
      );
    }
  }

  logGroundFound(x, y, z) {
    this.min(
      `✅ Ground found at Y=${y.toFixed(1)} (X=${x.toFixed(1)}, Z=${z.toFixed(
        1
      )})`
    );
  }

  logNoGroundFound(x, z) {
    this.warn(`⚠️ No ground found at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }

  logHeadroomCheck(position, required, success) {
    if (this.config.logLevel === "MIN") {
      const status = success ? "✅" : "❌";
      this.min(
        `${status} Headroom check: ${required}m at (${position.x.toFixed(
          1
        )}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
      );
    }
  }

  // ============================================================
  // SYSTEM STATE
  // ============================================================

  logSystemStart() {
    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🎮 NPC SYSTEM STARTED`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logSystemStop(reason = "manual") {
    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🛑 NPC SYSTEM STOPPED`);
    this.info(`   Reason: ${reason}`);
    this.info(`   Total spawns: ${this.successfulSpawns}`);
    this.info(`   Failed spawns: ${this.failedSpawns}`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logNPCRemoval(npcId, role) {
    this.info(`🗑️ NPC removed: ${npcId} (${role || "unknown"})`);
  }

  logAllNPCsRemoved(count) {
    this.info(`🗑️ All NPCs removed (${count} total)`);
    this.successfulSpawns = 0;
    this.failedSpawns = 0;
  }

  logGameModeChange(oldMode, newMode) {
    this.info(`🎮 Game mode changed: ${oldMode} → ${newMode}`);
  }

  // ============================================================
  // HIDE & SEEK INTEGRATION
  // ============================================================

  logHideSeekStart(seekerCount, hiderCount) {
    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🎯 HIDE AND SEEK GAME STARTING`);
    this.info(`   Seekers: ${seekerCount}`);
    this.info(`   Hiders: ${hiderCount}`);
    this.raw(`${"=".repeat(70)}`);
    this.flush();
  }

  logHideSeekRestart() {
    this.info(`🔄 Hide and seek game restarting...`);
  }

  logInsufficientNPCs(required, current) {
    this.warn(`⚠️ Insufficient NPCs for hide and seek`);
    this.warn(`   Required: ${required}`);
    this.warn(`   Current: ${current}`);
  }

  // ============================================================
  // RESPAWN
  // ============================================================

  logRespawn(npcId, oldPos, newPos) {
    this.info(`🔁 Respawning NPC: ${npcId}`);
    this.info(
      `   Old: (${oldPos.x.toFixed(1)}, ${oldPos.y.toFixed(
        1
      )}, ${oldPos.z.toFixed(1)})`
    );
    this.info(
      `   New: (${newPos.x.toFixed(1)}, ${newPos.y.toFixed(
        1
      )}, ${newPos.z.toFixed(1)})`
    );
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  getStats() {
    return {
      spawnAttempts: this.spawnAttempts,
      successfulSpawns: this.successfulSpawns,
      failedSpawns: this.failedSpawns,
      successRate:
        this.spawnAttempts > 0
          ? ((this.successfulSpawns / this.spawnAttempts) * 100).toFixed(1) +
            "%"
          : "N/A",
    };
  }

  logStats() {
    const stats = this.getStats();
    this.raw(`\n${"─".repeat(70)}`);
    this.info(`📊 NPC SYSTEM STATISTICS`);
    this.info(`   Total spawn attempts: ${stats.spawnAttempts}`);
    this.info(`   Successful spawns: ${stats.successfulSpawns}`);
    this.info(`   Failed spawns: ${stats.failedSpawns}`);
    this.info(`   Success rate: ${stats.successRate}`);
    this.raw(`${"─".repeat(70)}`);
  }
}

export default NPCSystemLogger;
