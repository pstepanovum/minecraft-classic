// ==============================================================
// FILE: research/src/ml/log/ppo-training-bridge-logger.js
// ==============================================================

import { Logger } from "../logger.js";

export class PPOTrainingLogger extends Logger {
  constructor(serverUrl = "http://localhost:3001", options = {}) {
    super("ppo_training", serverUrl, {
      logInterval: 100, // Log every 100 steps
      flushInterval: 5000,
      bufferSize: 50,
      ...options,
    });

    this.currentEpisode = null;
  }

  startEpisode(episodeNum) {
    this.currentEpisode = {
      episode: episodeNum,
      startTime: Date.now(),
      steps: 0,
      cumulativeRewards: {},
      stepRewards: [],
    };

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🔄 EPISODE ${episodeNum} STARTED`);
    this.raw(`${"=".repeat(70)}`);

    this.flush(); // Immediate flush for episode start
  }

  logStep(stepNum, data) {
    if (!this.config.enabled) return;

    const { rewards, gameState, elapsedTime } = data;

    if (this.currentEpisode) {
      this.currentEpisode.steps = stepNum;

      // Track cumulative rewards
      Object.entries(rewards).forEach(([agentId, reward]) => {
        if (!this.currentEpisode.cumulativeRewards[agentId]) {
          this.currentEpisode.cumulativeRewards[agentId] = 0;
        }
        this.currentEpisode.cumulativeRewards[agentId] += reward;
      });

      // Store step reward
      const totalReward = Object.values(rewards).reduce((a, b) => a + b, 0);
      this.currentEpisode.stepRewards.push({
        step: stepNum,
        totalReward,
        timestamp: elapsedTime,
      });
    }

    // Log at intervals
    if (stepNum % this.config.logInterval === 0 || stepNum === 1) {
      const totalReward = Object.values(rewards).reduce((a, b) => a + b, 0);

      this.raw("");
      this.info(`📊 Step ${stepNum}:`);
      this.info(`   Elapsed: ${(elapsedTime / 1000).toFixed(1)}s`);
      this.info(`   State: ${gameState.state}`);
      this.info(`   Hiders: ${gameState.hidersFound}/${gameState.totalHiders}`);
      this.info(`   Step Reward: ${totalReward.toFixed(3)}`);

      // Show cumulative
      if (this.currentEpisode) {
        const cumulative = Object.values(
          this.currentEpisode.cumulativeRewards
        ).reduce((a, b) => a + b, 0);
        this.info(`   Cumulative: ${cumulative.toFixed(2)}`);
      }
    }
  }

  endEpisode(finalRewards, gameState) {
    if (!this.currentEpisode) return;

    const duration = (Date.now() - this.currentEpisode.startTime) / 1000;

    this.raw(`\n${"=".repeat(70)}`);
    this.info(`🏁 EPISODE ${this.currentEpisode.episode} ENDED`);
    this.raw(`${"=".repeat(70)}`);
    this.info(`Duration: ${duration.toFixed(1)}s`);
    this.info(`Total Steps: ${this.currentEpisode.steps}`);
    this.info(`Final State: ${gameState.state}`);
    this.info(
      `Hiders Found: ${gameState.hidersFound}/${gameState.totalHiders}`
    );

    this.raw("");
    this.info(`💰 FINAL REWARDS:`);
    Object.entries(finalRewards).forEach(([agentId, reward]) => {
      this.info(`   ${agentId}: ${reward.toFixed(2)}`);
    });

    const totalReward = Object.values(finalRewards).reduce((a, b) => a + b, 0);
    const avgStepReward =
      this.currentEpisode.stepRewards.length > 0
        ? this.currentEpisode.stepRewards.reduce(
            (sum, s) => sum + s.totalReward,
            0
          ) / this.currentEpisode.stepRewards.length
        : 0;

    this.info(`   Total: ${totalReward.toFixed(2)}`);
    this.info(`   Avg/Step: ${avgStepReward.toFixed(3)}`);

    this.currentEpisode = null;
    this.flush(); // Immediate flush for episode end
  }
}

export default PPOTrainingLogger;
