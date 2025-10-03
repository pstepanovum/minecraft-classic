// ==============================================================
// FILE: research/src/ml/agents/dqn-agent.js
// ==============================================================

import { NPC_BEHAVIOR } from "../npc/config-npc-behavior.js";

export class DQNAgent {
  constructor(role = "seeker") {
    this.role = role;
    this.config = NPC_BEHAVIOR.ML_TRAINING.MODEL;

    // Training parameters with adjusted epsilon for better exploration
    this.epsilon = 1.0; // Start with full exploration
    this.epsilonDecay = 0.9995; // Slower decay for more exploration
    this.epsilonMin = 0.1; // Higher minimum for continued exploration
    this.gamma = this.config.gamma;
    this.learningRate = this.config.learningRate;
    this.stateSize = 140;
    this.actionSize = 9;
    this.model = null;
    this.targetModel = null;
    this.trainingStep = 0;
    this.trainingInProgress = false;

    // Add exploration tracking
    this.explorationBonus = 0.2; // Extra chance to explore even after epsilon decay
    this.actionCounts = new Array(this.actionSize).fill(0);
    this.recentActions = [];
    this.maxRecentActions = 20;

    console.log(`DQN Agent initialized for ${role} with enhanced exploration`);
  }

  async initialize() {
    console.log(`Building neural networks for ${this.role}...`);
    this.model = await this.createModel();
    this.targetModel = await this.createModel();

    this.updateTargetModel();

    return this;
  }

  /**
   * Creates the neural network model with GRU for memory
   */
  async createModel() {
    const model = tf.sequential();

    // The model expects a sequence of states: [1, 5, state_size]
    model.add(
      tf.layers.gru({
        units: this.config.hiddenLayers[0],
        inputShape: [5, this.stateSize],
        returnSequences: false,
        recurrentDropout: 0.2, // Add dropout for regularization
      })
    );

    // Add Dense layers with dropout for better generalization
    this.config.hiddenLayers.slice(1).forEach((units, idx) => {
      model.add(
        tf.layers.dense({
          units: units,
          activation: "relu",
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }), // L2 regularization
        })
      );

      // Add dropout to prevent overfitting
      if (idx < this.config.hiddenLayers.length - 2) {
        model.add(tf.layers.dropout({ rate: 0.2 }));
      }
    });

    // Output layer: one output per possible action
    model.add(
      tf.layers.dense({
        units: this.actionSize,
        activation: "linear",
        kernelInitializer: "glorotUniform", // Better initialization
      })
    );

    // Compile with a slightly adjusted learning rate
    const adjustedLR =
      this.role === "seeker" ? this.learningRate : this.learningRate * 0.8;

    model.compile({
      optimizer: tf.train.adam(adjustedLR),
      loss: "meanSquaredError",
    });

    return model;
  }

  /**
   * Enhanced action selection with better exploration strategies
   */
  selectAction(stateSequence) {
    // Track recent actions to avoid repetition
    if (this.recentActions.length >= this.maxRecentActions) {
      this.recentActions.shift();
    }

    // Calculate action probabilities based on least-used actions
    const leastUsedBonus = this.calculateLeastUsedBonus();

    // Enhanced epsilon-greedy with exploration bonuses
    const explorationChance = Math.max(
      this.epsilon,
      this.explorationBonus * (1 - this.epsilon)
    );

    if (Math.random() < explorationChance) {
      // Intelligent exploration: bias towards less-used actions
      let action;

      if (Math.random() < 0.3 && this.role === "seeker") {
        // 30% chance to specifically try movement actions for seekers
        const movementActions = [0, 1, 2, 3, 4]; // Forward, back, left, right, jump
        action =
          movementActions[Math.floor(Math.random() * movementActions.length)];
      } else if (Math.random() < 0.5) {
        // 50% chance to use least-used action bonus
        action = this.selectLeastUsedAction();
      } else {
        // Random exploration
        action = Math.floor(Math.random() * this.actionSize);
      }

      // Avoid repeating the same action too much
      const recentCount = this.recentActions.filter((a) => a === action).length;
      if (recentCount > 5 && Math.random() < 0.7) {
        // If action is too repetitive, pick a different one
        action =
          (action + 1 + Math.floor(Math.random() * (this.actionSize - 1))) %
          this.actionSize;
      }

      this.actionCounts[action]++;
      this.recentActions.push(action);
      return action;
    } else {
      // Exploit: select the best action with some noise
      return tf.tidy(() => {
        const stateTensor = tf.tensor2d(stateSequence).expandDims(0);

        let predictions = this.model.predict(stateTensor, { training: false });

        // Add small noise to Q-values to break ties
        const noise = tf.randomNormal(predictions.shape, 0, 0.01);
        predictions = predictions.add(noise);

        // Get action with highest Q-value
        const actionIndex = predictions.argMax(-1).dataSync()[0];

        this.actionCounts[actionIndex]++;
        this.recentActions.push(actionIndex);

        return actionIndex;
      });
    }
  }

  /**
   * Select action that has been used the least
   */
  selectLeastUsedAction() {
    const minCount = Math.min(...this.actionCounts);
    const leastUsedActions = [];

    for (let i = 0; i < this.actionSize; i++) {
      if (this.actionCounts[i] <= minCount + 2) {
        // Allow some tolerance
        leastUsedActions.push(i);
      }
    }

    return leastUsedActions[
      Math.floor(Math.random() * leastUsedActions.length)
    ];
  }

  /**
   * Calculate bonus for least-used actions
   */
  calculateLeastUsedBonus() {
    const totalActions = this.actionCounts.reduce((a, b) => a + b, 0);
    if (totalActions === 0) return 0;

    const avgCount = totalActions / this.actionSize;
    const bonuses = this.actionCounts.map((count) =>
      Math.max(0, (avgCount - count) / avgCount)
    );

    return bonuses;
  }

  /**
   * Adjusted epsilon decay with role-specific rates
   */
  decayEpsilon() {
    // Seekers should explore more aggressively
    const roleMultiplier = this.role === "seeker" ? 0.9995 : 0.999;
    const adjustedDecay = this.epsilonDecay * roleMultiplier;

    this.epsilon = Math.max(this.epsilonMin, this.epsilon * adjustedDecay);

    // Adjust exploration bonus based on training progress
    if (this.trainingStep > 1000) {
      this.explorationBonus = Math.max(0.05, this.explorationBonus * 0.999);
    }
  }

  /**
   * Enhanced training with prioritized experience replay
   */
  async train(memory, stateHistory) {
    if (!memory.canSample(this.config.batchSize)) {
      return null;
    }

    if (this.trainingInProgress) {
      return null;
    }

    this.trainingInProgress = true;

    try {
      // Use prioritized sampling for more important experiences
      const batch = memory.samplePrioritized(this.config.batchSize, 0.6);

      const stateSequences = [];
      const nextStateSequences = [];
      const actions = [];
      const rewards = [];
      const dones = [];

      for (const experience of batch) {
        const liveHistory = stateHistory.get(experience.id);
        if (!liveHistory) continue;

        stateSequences.push(liveHistory.slice());
        nextStateSequences.push(
          liveHistory.slice(1).concat([experience.nextState])
        );

        actions.push(experience.action);
        rewards.push(experience.reward);
        dones.push(experience.done);
      }

      if (stateSequences.length === 0) {
        return null;
      }

      // Use improved training approach
      return await this.trainImprovedApproach(
        stateSequences,
        nextStateSequences,
        actions,
        rewards,
        dones
      );
    } catch (error) {
      console.error("DQN Agent Training Failed:", error);
      return null;
    } finally {
      this.trainingInProgress = false;
    }
  }

  /**
   * Improved training with double DQN approach
   */
  async trainImprovedApproach(
    stateSequences,
    nextStateSequences,
    actions,
    rewards,
    dones
  ) {
    const xs = [];
    const ys = [];

    // Use Double DQN for more stable learning
    for (let i = 0; i < stateSequences.length; i++) {
      const stateSeq = stateSequences[i];
      const nextStateSeq = nextStateSequences[i];
      const action = actions[i];
      const reward = rewards[i];
      const done = dones[i];

      // Get current Q values
      const stateTensor = tf.tensor3d([stateSeq]);
      const currentQ = this.model.predict(stateTensor, { training: false });
      const currentQArray = await currentQ.array();

      let targetQ = reward;

      if (!done) {
        // Double DQN: Use main network to select action, target network to evaluate
        const nextStateTensor = tf.tensor3d([nextStateSeq]);

        // Get action from main network
        const nextQMain = this.model.predict(nextStateTensor, {
          training: false,
        });
        const nextQMainArray = await nextQMain.array();
        const bestNextAction = nextQMainArray[0].indexOf(
          Math.max(...nextQMainArray[0])
        );

        // Evaluate using target network
        const nextQTarget = this.targetModel.predict(nextStateTensor, {
          training: false,
        });
        const nextQTargetArray = await nextQTarget.array();

        targetQ += this.gamma * nextQTargetArray[0][bestNextAction];

        // Clean up
        nextQMain.dispose();
        nextQTarget.dispose();
        nextStateTensor.dispose();
      }

      // Update only the Q value for the taken action
      const target = [...currentQArray[0]];

      // Add small reward shaping to encourage exploration
      if (this.actionCounts[action] < 10) {
        targetQ += 0.1; // Small bonus for trying new actions
      }

      target[action] = targetQ;

      xs.push(stateSeq);
      ys.push(target);

      // Clean up tensors
      stateTensor.dispose();
      currentQ.dispose();
    }

    if (xs.length === 0) {
      return null;
    }

    // Convert to tensors and train
    const xTensor = tf.tensor3d(xs);
    const yTensor = tf.tensor2d(ys);

    try {
      const h = await this.model.fit(xTensor, yTensor, {
        epochs: 1,
        verbose: 0,
        batchSize: Math.min(this.config.batchSize, xs.length),
        shuffle: true, // Shuffle training data
      });

      const loss = h.history.loss[0];

      // Clean up
      xTensor.dispose();
      yTensor.dispose();

      this.trainingStep++;

      // Log progress periodically
      if (this.trainingStep % 100 === 0) {
        console.log(
          `[${this.role}] Training step ${
            this.trainingStep
          }, Loss: ${loss.toFixed(4)}, Epsilon: ${this.epsilon.toFixed(3)}`
        );
        this.logActionDistribution();
      }

      return loss;
    } catch (fitError) {
      console.warn("Fit operation failed:", fitError);
      xTensor.dispose();
      yTensor.dispose();
      return null;
    }
  }

  /**
   * Log action distribution for debugging
   */
  logActionDistribution() {
    const total = this.actionCounts.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const distribution = this.actionCounts.map((count) =>
      ((count / total) * 100).toFixed(1)
    );

    console.log(`[${this.role}] Action distribution:`, distribution);

    // Reset counts periodically to allow for strategy changes
    if (total > 10000) {
      this.actionCounts = this.actionCounts.map((c) => Math.floor(c / 2));
    }
  }

  updateTargetModel() {
    if (!this.model) {
      console.warn("Cannot update target model: Main model not yet built.");
      return;
    }

    try {
      const weights = this.model.getWeights();
      const weightCopies = weights.map((w) => w.clone());
      this.targetModel.setWeights(weightCopies);

      // Clean up cloned weights
      weightCopies.forEach((w) => {
        if (w && !w.isDisposed) {
          w.dispose();
        }
      });

      console.log(
        `[${this.role}] Target model updated at step ${this.trainingStep}`
      );
    } catch (error) {
      console.error("Error updating target model:", error);
    }
  }

  /**
   * Get model summary for debugging
   */
  summary() {
    if (!this.model) return;

    try {
      this.model.summary();
    } catch (error) {
      console.log("Model summary not available:", error);
    }
  }

  /**
   * Save model to storage
   */
  async saveModel(path) {
    if (!this.model) {
      console.warn("Cannot save model: Model not initialized");
      return;
    }

    try {
      await this.model.save(path);
      console.log(`Model saved to: ${path}`);
    } catch (error) {
      console.error("Error saving model:", error);
    }
  }

  /**
   * Load model from storage
   */
  async loadModel(path) {
    try {
      this.model = await tf.loadLayersModel(path);
      this.model.compile({
        optimizer: tf.train.adam(this.learningRate),
        loss: "meanSquaredError",
      });
      console.log(`Model loaded from: ${path}`);

      // Reset exploration parameters for loaded model
      this.epsilon = this.epsilonMin;
      this.explorationBonus = 0.05;
    } catch (error) {
      console.error("Error loading model:", error);
    }
  }

  /**
   * Dispose of models and free memory
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    if (this.targetModel) {
      this.targetModel.dispose();
      this.targetModel = null;
    }
  }
}

export default DQNAgent;
