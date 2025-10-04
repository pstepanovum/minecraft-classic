// ==============================================================
// FILE: research/src/ml/memory/experience-replay.js
// ==============================================================

/**
 * Experience Replay Buffer for Deep Q-Learning
 * 
 * Stores agent experiences and provides random sampling for training.
 * Implements circular buffer to prevent unbounded memory growth.
 * 
 * Critical for DQN: Breaks temporal correlations in sequential data,
 * enabling stable neural network training.
 */
export class ExperienceReplay {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.buffer = [];
    this.position = 0;
    this.totalExperiences = 0;
    this.samplesDrawn = 0;

    console.log(`Experience Replay Buffer initialized (capacity: ${maxSize})`);
  }

  /**
   * Add experience to buffer
   * Overwrites oldest experience when full (circular buffer)
   */
  add(experience) {
    if (!this.isValidExperience(experience)) {
      console.warn("Invalid experience, skipping:", experience);
      return false;
    }

    if (this.buffer.length < this.maxSize) {
      this.buffer.push(experience);
    } else {
      this.buffer[this.position] = experience;
    }

    this.position = (this.position + 1) % this.maxSize;
    this.totalExperiences++;

    return true;
  }

  /**
   * Validate experience structure
   */
  isValidExperience(exp) {
    return (
      exp &&
      Array.isArray(exp.state) &&
      Array.isArray(exp.nextState) &&
      typeof exp.action === "number" &&
      typeof exp.reward === "number" &&
      typeof exp.done === "boolean"
    );
  }

  /**
   * Sample random batch for training (uniform sampling)
   * This is the standard DQN approach
   */
  sample(batchSize) {
    if (this.buffer.length < batchSize) {
      console.warn(
        `Not enough experiences (have ${this.buffer.length}, need ${batchSize})`
      );
      return this.buffer.slice();
    }

    const batch = [];
    const indices = new Set();

    // Sample without replacement
    while (indices.size < batchSize) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        batch.push(this.buffer[idx]);
      }
    }

    this.samplesDrawn += batchSize;
    return batch;
  }

  /**
   * Get recent experiences for debugging
   * Handles circular buffer wrap-around correctly
   */
  getRecent(count = 10) {
    if (this.buffer.length === 0) return [];

    const actualCount = Math.min(count, this.buffer.length);

    if (this.position >= actualCount) {
      // Simple case: no wrap-around needed
      return this.buffer.slice(this.position - actualCount, this.position);
    } else {
      // Wrap-around case: get from end + beginning
      return [
        ...this.buffer.slice(this.buffer.length - (actualCount - this.position)),
        ...this.buffer.slice(0, this.position),
      ];
    }
  }

  /**
   * Calculate buffer statistics
   */
  getStats() {
    if (this.buffer.length === 0) {
      return {
        size: 0,
        capacity: this.maxSize,
        utilization: "0.0%",
        totalExperiences: 0,
        samplesDrawn: 0,
        avgReward: 0,
        minReward: 0,
        maxReward: 0,
        episodesStored: 0,
        successRate: "N/A",
      };
    }

    const rewards = this.buffer.map((exp) => exp.reward);
    const dones = this.buffer.filter((exp) => exp.done);
    const successes = this.buffer.filter((exp) => exp.done && exp.reward > 0);

    return {
      size: this.buffer.length,
      capacity: this.maxSize,
      utilization: ((this.buffer.length / this.maxSize) * 100).toFixed(1) + "%",
      totalExperiences: this.totalExperiences,
      samplesDrawn: this.samplesDrawn,
      avgReward: (rewards.reduce((a, b) => a + b, 0) / rewards.length).toFixed(3),
      minReward: Math.min(...rewards).toFixed(3),
      maxReward: Math.max(...rewards).toFixed(3),
      episodesStored: dones.length,
      successRate:
        dones.length > 0
          ? ((successes.length / dones.length) * 100).toFixed(1) + "%"
          : "N/A",
    };
  }

  /**
   * Export buffer for analysis or checkpointing
   */
  export() {
    return [...this.buffer];
  }

  /**
   * Import experiences (for transfer learning or checkpoint restoration)
   */
  import(experiences) {
    const validCount = experiences.filter(exp => {
      const isValid = this.isValidExperience(exp);
      if (isValid) this.add(exp);
      return isValid;
    }).length;

    console.log(`Imported ${validCount}/${experiences.length} valid experiences`);
    return validCount;
  }

  /**
   * Clear the buffer
   */
  clear() {
    this.buffer = [];
    this.position = 0;
    this.totalExperiences = 0;
    this.samplesDrawn = 0;
    console.log("Experience buffer cleared");
  }

  /**
   * Get current buffer size
   */
  size() {
    return this.buffer.length;
  }

  /**
   * Check if buffer has enough samples for training
   */
  canSample(batchSize) {
    return this.buffer.length >= batchSize;
  }

  /**
   * Serialize buffer state for checkpointing
   */
  toJSON() {
    return {
      maxSize: this.maxSize,
      buffer: this.buffer,
      position: this.position,
      totalExperiences: this.totalExperiences,
      samplesDrawn: this.samplesDrawn,
    };
  }

  /**
   * Restore buffer state from checkpoint
   */
  fromJSON(data) {
    this.maxSize = data.maxSize || this.maxSize;
    this.buffer = data.buffer || [];
    this.position = data.position || 0;
    this.totalExperiences = data.totalExperiences || 0;
    this.samplesDrawn = data.samplesDrawn || 0;

    console.log(`Loaded buffer with ${this.buffer.length} experiences`);
  }
}

export default ExperienceReplay;