// ==============================================================
// FILE: research/src/ml/agents/dqn-agent.js
// ==============================================================

import { NPC } from "../npc/config-npc-behavior.js";

export class DQNAgent {
  constructor(role = "seeker") {
    this.role = role;
    this.config = NPC.TRAINING.MODEL;

    // Exploration parameters
    this.epsilon = NPC.TRAINING.MODEL.epsilon;
    this.epsilonDecay = NPC.TRAINING.MODEL.epsilonDecay;
    this.epsilonMin = NPC.TRAINING.MODEL.epsilonMin;
    this.gamma = NPC.TRAINING.MODEL.gamma;
    this.learningRate = NPC.TRAINING.MODEL.learningRate;
    this.stateSize = NPC.TRAINING.MODEL.stateSize;
    this.actionSize = NPC.TRAINING.MODEL.actionSize;
    
    this.model = null;
    this.targetModel = null;
    this.trainingStep = 0;
    this.trainingInProgress = false;

    // Reward clipping to prevent explosion
    this.rewardClipMin = NPC.TRAINING.MODEL.rewardClipMin;
    this.rewardClipMax = NPC.TRAINING.MODEL.rewardClipMax;

    this.explorationBonus = 0.2;
    this.actionCounts = new Array(this.actionSize).fill(0);
    this.recentActions = [];
    this.maxRecentActions = 20;

    console.log(`DQN Agent initialized for ${role}`);
  }

  async initialize() {
    console.log(`Building neural networks for ${this.role}...`);
    this.model = await this.createModel();
    this.targetModel = await this.createModel();

    const testInput = tf.zeros([1, 5, this.stateSize]);
    const testOutput = this.model.predict(testInput);
    const outputData = await testOutput.array();
    testInput.dispose();
    testOutput.dispose();

    if (outputData[0].some(v => !isFinite(v))) {
      console.error(`[${this.role}] Model initialized with NaN/Inf values!`);
      throw new Error('Model initialization failed');
    }

    console.log(`[${this.role}] Model initialized successfully`);
    this.updateTargetModel();
    return this;
  }

  async createModel() {
    const model = tf.sequential();

    model.add(
      tf.layers.gru({
        units: this.config.hiddenLayers[0],
        inputShape: [5, this.stateSize],
        returnSequences: false,
        recurrentDropout: 0.2,
      })
    );

    this.config.hiddenLayers.slice(1).forEach((units, idx) => {
      model.add(
        tf.layers.dense({
          units: units,
          activation: "relu",
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
        })
      );

      if (idx < this.config.hiddenLayers.length - 2) {
        model.add(tf.layers.dropout({ rate: 0.2 }));
      }
    });

    model.add(
      tf.layers.dense({
        units: this.actionSize,
        activation: "linear",
        kernelInitializer: "glorotUniform",
      })
    );

    const adjustedLR =
      this.role === "seeker" ? this.learningRate : this.learningRate * 0.8;

    model.compile({
      optimizer: tf.train.adam(adjustedLR),
      loss: "meanSquaredError",
      metrics: ['mae'],
    });

    return model;
  }

  selectAction(stateSequence) {
    if (this.recentActions.length >= this.maxRecentActions) {
      this.recentActions.shift();
    }

    const explorationChance = Math.max(
      this.epsilon,
      this.explorationBonus * (1 - this.epsilon)
    );

    if (Math.random() < explorationChance) {
      let action;

      if (Math.random() < 0.3 && this.role === "seeker") {
        const movementActions = [0, 1, 2, 3, 4];
        action =
          movementActions[Math.floor(Math.random() * movementActions.length)];
      } else if (Math.random() < 0.5) {
        action = this.selectLeastUsedAction();
      } else {
        action = Math.floor(Math.random() * this.actionSize);
      }

      const recentCount = this.recentActions.filter((a) => a === action).length;
      if (recentCount > 5 && Math.random() < 0.7) {
        action =
          (action + 1 + Math.floor(Math.random() * (this.actionSize - 1))) %
          this.actionSize;
      }

      this.actionCounts[action]++;
      this.recentActions.push(action);
      return action;
    } else {
      return tf.tidy(() => {
        const stateTensor = tf.tensor2d(stateSequence).expandDims(0);

        let predictions = this.model.predict(stateTensor, { training: false });

        const noise = tf.randomNormal(predictions.shape, 0, 0.01);
        predictions = predictions.add(noise);

        const actionIndex = predictions.argMax(-1).dataSync()[0];

        this.actionCounts[actionIndex]++;
        this.recentActions.push(actionIndex);

        return actionIndex;
      });
    }
  }

  selectLeastUsedAction() {
    const minCount = Math.min(...this.actionCounts);
    const leastUsedActions = [];

    for (let i = 0; i < this.actionSize; i++) {
      if (this.actionCounts[i] <= minCount + 2) {
        leastUsedActions.push(i);
      }
    }

    return leastUsedActions[
      Math.floor(Math.random() * leastUsedActions.length)
    ];
  }

  decayEpsilon() {
    const roleMultiplier = this.role === "seeker" ? 0.9995 : 0.999;
    const adjustedDecay = this.epsilonDecay * roleMultiplier;

    this.epsilon = Math.max(this.epsilonMin, this.epsilon * adjustedDecay);

    if (this.trainingStep > 1000) {
      this.explorationBonus = Math.max(0.05, this.explorationBonus * 0.999);
    }
  }

  clipReward(reward) {
    return Math.max(this.rewardClipMin, Math.min(this.rewardClipMax, reward));
  }

  async train(memory, stateHistory) {
    if (!memory.canSample(this.config.batchSize)) {
      return null;
    }

    if (this.trainingInProgress) {
      return null;
    }

    this.trainingInProgress = true;

    try {
      const batch = memory.sample(this.config.batchSize);

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
        // CLIP REWARDS HERE
        rewards.push(this.clipReward(experience.reward));
        dones.push(experience.done);
      }

      if (stateSequences.length === 0) {
        return null;
      }

      const xs = [];
      const ys = [];

      for (let i = 0; i < stateSequences.length; i++) {
        const stateSeq = stateSequences[i];
        const nextStateSeq = nextStateSequences[i];
        const action = actions[i];
        const reward = rewards[i];
        const done = dones[i];

        const stateTensor = tf.tensor3d([stateSeq]);
        const currentQ = this.model.predict(stateTensor, { training: false });
        const currentQArray = await currentQ.array();

        // CHECK FOR NaN IN PREDICTIONS
        if (currentQArray[0].some(v => !isFinite(v))) {
          console.error(`[${this.role}] Model predictions contain NaN/Inf - skipping sample`);
          stateTensor.dispose();
          currentQ.dispose();
          continue;
        }

        let targetQ = reward;

        if (!done) {
          const nextStateTensor = tf.tensor3d([nextStateSeq]);

          const nextQMain = this.model.predict(nextStateTensor, {
            training: false,
          });
          const nextQMainArray = await nextQMain.array();
          
          // CHECK FOR NaN
          if (nextQMainArray[0].some(v => !isFinite(v))) {
            console.error(`[${this.role}] Next Q predictions contain NaN/Inf - using reward only`);
            nextQMain.dispose();
            nextStateTensor.dispose();
            targetQ = reward; // Fallback: just use immediate reward
          } else {
            const bestNextAction = nextQMainArray[0].indexOf(
              Math.max(...nextQMainArray[0])
            );

            const nextQTarget = this.targetModel.predict(nextStateTensor, {
              training: false,
            });
            const nextQTargetArray = await nextQTarget.array();

            const nextQValue = nextQTargetArray[0][bestNextAction];
            
            // CHECK nextQValue
            if (isFinite(nextQValue)) {
              targetQ += this.gamma * nextQValue;
            } else {
              console.warn(`[${this.role}] Invalid next Q-value, using reward only`);
              targetQ = reward;
            }

            nextQMain.dispose();
            nextQTarget.dispose();
            nextStateTensor.dispose();
          }
        }

        // FINAL NaN CHECK
        if (!isFinite(targetQ)) {
          console.error(`[${this.role}] Invalid targetQ: ${targetQ} for action ${action}`);
          stateTensor.dispose();
          currentQ.dispose();
          continue;
        }

        const target = [...currentQArray[0]];
        target[action] = targetQ;

        // VALIDATE TARGET ARRAY
        if (target.some(v => !isFinite(v))) {
          console.error(`[${this.role}] Invalid target values:`, target);
          stateTensor.dispose();
          currentQ.dispose();
          continue;
        }

        xs.push(stateSeq);
        ys.push(target);

        stateTensor.dispose();
        currentQ.dispose();
      }

      if (xs.length === 0) {
        console.warn(`[${this.role}] No valid training samples after filtering`);
        return null;
      }

      const xTensor = tf.tensor3d(xs);
      const yTensor = tf.tensor2d(ys);

      const h = await this.model.fit(xTensor, yTensor, {
        epochs: 1,
        verbose: 0,
        batchSize: Math.min(this.config.batchSize, xs.length),
        shuffle: true,
      });

      const loss = h.history.loss[0];

      if (this.trainingStep % 100 === 0) {
        console.log(
          `[${this.role}] Step ${this.trainingStep}, Loss: ${loss.toFixed(4)}, ` +
          `Epsilon: ${this.epsilon.toFixed(3)}, Samples: ${xs.length}/${stateSequences.length}`
        );
      }

      xTensor.dispose();
      yTensor.dispose();

      this.trainingStep++;

      return loss;
    } catch (error) {
      console.error(`[${this.role}] Training error:`, error);
      return null;
    } finally {
      this.trainingInProgress = false;
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

  logActionDistribution() {
    const total = this.actionCounts.reduce((a, b) => a + b, 0);
    if (total === 0) return;

    const distribution = this.actionCounts.map((count) =>
      ((count / total) * 100).toFixed(1)
    );

    console.log(`[${this.role}] Action distribution:`, distribution);

    if (total > 10000) {
      this.actionCounts = this.actionCounts.map((c) => Math.floor(c / 2));
    }
  }
  
  summary() {
    if (!this.model) return;
    try {
      this.model.summary();
    } catch (error) {
      console.log("Model summary not available:", error);
    }
  }

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

  async loadModel(path) {
    try {
      this.model = await tf.loadLayersModel(path);
      this.model.compile({
        optimizer: tf.train.adam(this.learningRate),
        loss: "meanSquaredError",
      });
      console.log(`Model loaded from: ${path}`);

      this.epsilon = this.epsilonMin;
      this.explorationBonus = 0.05;
    } catch (error) {
      console.error("Error loading model:", error);
    }
  }

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