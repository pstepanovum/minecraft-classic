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

    if (outputData[0].some((v) => !isFinite(v))) {
      console.error(`[${this.role}] Model initialized with NaN/Inf values!`);
      throw new Error("Model initialization failed");
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
      metrics: ["mae"],
    });

    return model;
  }

  selectAction(stateSequence) {
    const explorationChance = Math.max(
      this.epsilon,
      this.explorationBonus * (1 - this.epsilon)
    );

    if (Math.random() < explorationChance) {
      // Random exploration - pick random value in each group
      return {
        movement: Math.floor(Math.random() * 3),
        jump: Math.floor(Math.random() * 2),
        rotation: Math.floor(Math.random() * 3),
        look: Math.floor(Math.random() * 3),
        block: Math.floor(Math.random() * 3),
      };
    } else {
      return tf.tidy(() => {
        const stateTensor = tf.tensor2d(stateSequence).expandDims(0);
        const predictions = this.model.predict(stateTensor, {
          training: false,
        });
        const values = predictions.dataSync();

        // Split into groups and pick best in each
        return {
          movement: this.argmax(Array.from(values.slice(0, 3))),
          jump: this.argmax(Array.from(values.slice(3, 5))),
          rotation: this.argmax(Array.from(values.slice(5, 8))),
          look: this.argmax(Array.from(values.slice(8, 11))),
          block: this.argmax(Array.from(values.slice(11, 14))),
        };
      });
    }
  }

  argmax(array) {
    let maxIdx = 0;
    let maxVal = array[0];
    for (let i = 1; i < array.length; i++) {
      if (array[i] > maxVal) {
        maxVal = array[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  actionGroupsToIndex(groups) {
    // Encode as: movement * 72 + jump * 36 + rotation * 12 + look * 3 + block
    return (
      groups.movement * 72 +
      groups.jump * 36 +
      groups.rotation * 12 +
      groups.look * 3 +
      groups.block
    );
  }

  // Convert single index back to action groups
  indexToActionGroups(index) {
    const movement = Math.floor(index / 72);
    const remainder1 = index % 72;
    const jump = Math.floor(remainder1 / 36);
    const remainder2 = remainder1 % 36;
    const rotation = Math.floor(remainder2 / 12);
    const remainder3 = remainder2 % 12;
    const look = Math.floor(remainder3 / 3);
    const block = remainder3 % 3;

    return { movement, jump, rotation, look, block };
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
    if (!memory.canSample(this.config.batchSize)) return null;
    if (this.trainingInProgress) return null;

    this.trainingInProgress = true;

    try {
      const batch = memory.sample(this.config.batchSize);
      const xs = [];
      const ys = [];

      for (const experience of batch) {
        const liveHistory = stateHistory.get(experience.id);
        if (!liveHistory) continue;

        const stateSeq = liveHistory.slice();
        const nextStateSeq = liveHistory
          .slice(1)
          .concat([experience.nextState]);

        const stateTensor = tf.tensor3d([stateSeq]);
        const currentQ = this.model.predict(stateTensor, { training: false });
        const currentQArray = await currentQ.array();

        if (currentQArray[0].some((v) => !isFinite(v))) {
          stateTensor.dispose();
          currentQ.dispose();
          continue;
        }

        const target = [...currentQArray[0]];
        const actionGroups = experience.action; // Now an object
        const reward = this.clipReward(experience.reward);

        if (!experience.done) {
          const nextStateTensor = tf.tensor3d([nextStateSeq]);
          const nextQMain = this.model.predict(nextStateTensor, {
            training: false,
          });
          const nextQMainArray = await nextQMain.array();

          if (!nextQMainArray[0].some((v) => !isFinite(v))) {
            // Find best action combination for next state
            const bestNextMovement = this.argmax(nextQMainArray[0].slice(0, 3));
            const bestNextJump = this.argmax(nextQMainArray[0].slice(3, 5));
            const bestNextRotation = this.argmax(nextQMainArray[0].slice(5, 8));
            const bestNextLook = this.argmax(nextQMainArray[0].slice(8, 11));
            const bestNextBlock = this.argmax(nextQMainArray[0].slice(11, 14));

            // Get Q-values from target network for best actions
            const nextQTarget = this.targetModel.predict(nextStateTensor, {
              training: false,
            });
            const nextQTargetArray = await nextQTarget.array();

            const nextQValueMovement = nextQTargetArray[0][bestNextMovement];
            const nextQValueJump = nextQTargetArray[0][3 + bestNextJump];
            const nextQValueRotation =
              nextQTargetArray[0][5 + bestNextRotation];
            const nextQValueLook = nextQTargetArray[0][8 + bestNextLook];
            const nextQValueBlock = nextQTargetArray[0][11 + bestNextBlock];

            // Average Q-value across all groups (or sum, experiment with this)
            const avgNextQ =
              (nextQValueMovement +
                nextQValueJump +
                nextQValueRotation +
                nextQValueLook +
                nextQValueBlock) /
              5;

            if (isFinite(avgNextQ)) {
              // Update Q-values for each selected action in each group
              target[actionGroups.movement] = reward + this.gamma * avgNextQ;
              target[3 + actionGroups.jump] = reward + this.gamma * avgNextQ;
              target[5 + actionGroups.rotation] =
                reward + this.gamma * avgNextQ;
              target[8 + actionGroups.look] = reward + this.gamma * avgNextQ;
              target[11 + actionGroups.block] = reward + this.gamma * avgNextQ;
            } else {
              // Fallback to immediate reward
              target[actionGroups.movement] = reward;
              target[3 + actionGroups.jump] = reward;
              target[5 + actionGroups.rotation] = reward;
              target[8 + actionGroups.look] = reward;
              target[11 + actionGroups.block] = reward;
            }

            nextQTarget.dispose();
          }

          nextQMain.dispose();
          nextStateTensor.dispose();
        } else {
          // Terminal state - only immediate reward
          target[actionGroups.movement] = reward;
          target[3 + actionGroups.jump] = reward;
          target[5 + actionGroups.rotation] = reward;
          target[8 + actionGroups.look] = reward;
          target[11 + actionGroups.block] = reward;
        }

        if (target.some((v) => !isFinite(v))) {
          stateTensor.dispose();
          currentQ.dispose();
          continue;
        }

        xs.push(stateSeq);
        ys.push(target);

        stateTensor.dispose();
        currentQ.dispose();
      }

      if (xs.length === 0) return null;

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
          `[${this.role}] Step ${this.trainingStep}, Loss: ${loss.toFixed(
            4
          )}, ` + `Epsilon: ${this.epsilon.toFixed(3)}`
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
