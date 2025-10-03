// ==============================================================
// FILE: research/src/ml/memory/experience-replay.js
// ==============================================================

export class ExperienceReplay {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.buffer = [];
    this.position = 0;
    this.totalExperiences = 0;
    this.samplesDrawn = 0;

    console.log(`Experience Replay Buffer initialized (capacity: ${maxSize})`);
  }

  add(experience) {
    // Validate experience
    if (!this.isValidExperience(experience)) {
      console.warn("Invalid experience, skipping");
      return false;
    }

    // Circular buffer: overwrite oldest when full
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(experience);
    } else {
      this.buffer[this.position] = experience;
    }

    // Update position (wrap around)
    this.position = (this.position + 1) % this.maxSize;
    this.totalExperiences++;

    return true;
  }
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
  sample(batchSize) {
    if (this.buffer.length < batchSize) {
      console.warn(
        `Not enough experiences (have ${this.buffer.length}, need ${batchSize})`
      );
      return this.buffer.slice(); // Return all available
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

  samplePrioritized(batchSize, alpha = 0.6) {
    if (this.buffer.length < batchSize) {
      return this.sample(batchSize);
    }

    // Calculate priorities (simplified: based on absolute reward)
    const priorities = this.buffer.map((exp) =>
      Math.pow(Math.abs(exp.reward) + 0.01, alpha)
    );

    const totalPriority = priorities.reduce((sum, p) => sum + p, 0);
    const probabilities = priorities.map((p) => p / totalPriority);

    // Sample based on priorities
    const batch = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = this.weightedRandomSample(probabilities);
      batch.push(this.buffer[idx]);
    }

    this.samplesDrawn += batchSize;
    return batch;
  }
  weightedRandomSample(probabilities) {
    const random = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i];
      if (random < cumulative) {
        return i;
      }
    }

    return probabilities.length - 1;
  }

  /**
   * Get recent experiences (for debugging/analysis)
   *
   * @param {number} count - Number of recent experiences
   * @returns {Array} - Recent experiences
   */
  getRecent(count = 10) {
    if (this.buffer.length === 0) return [];

    const startIdx = Math.max(0, this.position - count);
    if (this.position > count) {
      return this.buffer.slice(startIdx, this.position);
    } else {
      // Handle wrap-around
      return [
        ...this.buffer.slice(this.maxSize - (count - this.position)),
        ...this.buffer.slice(0, this.position),
      ];
    }
  }

  /**
   * Get experiences from specific episode
   *
   * Useful for analyzing agent behavior in a complete episode
   *
   * @param {string} episodeId - Episode identifier
   * @returns {Array} - All experiences from episode
   */
  getEpisode(episodeId) {
    return this.buffer.filter(
      (exp) => exp.metadata && exp.metadata.episodeId === episodeId
    );
  }

  /**
   * Calculate statistics about stored experiences
   *
   * @returns {Object} - Buffer statistics
   */
  getStats() {
    if (this.buffer.length === 0) {
      return {
        size: 0,
        avgReward: 0,
        minReward: 0,
        maxReward: 0,
        successRate: 0,
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
      avgReward: (rewards.reduce((a, b) => a + b, 0) / rewards.length).toFixed(
        3
      ),
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
   * Export buffer for analysis
   *
   * @returns {Array} - All experiences
   */
  export() {
    return [...this.buffer];
  }

  /**
   * Import experiences (for transfer learning)
   *
   * @param {Array} experiences - Experiences to import
   */
  import(experiences) {
    experiences.forEach((exp) => this.add(exp));
    console.log(`Imported ${experiences.length} experiences`);
  }

  /**
   * Clear the buffer
   */
  clear() {
    this.buffer = [];
    this.position = 0;
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
   * Save buffer to JSON (for checkpointing)
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
   * Load buffer from JSON
   */
  fromJSON(data) {
    this.maxSize = data.maxSize;
    this.buffer = data.buffer;
    this.position = data.position;
    this.totalExperiences = data.totalExperiences;
    this.samplesDrawn = data.samplesDrawn;

    console.log(`Loaded buffer with ${this.buffer.length} experiences`);
  }
}

export default ExperienceReplay;
