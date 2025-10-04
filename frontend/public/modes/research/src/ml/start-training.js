// ==============================================================
// FILE: research/src/ml/training/start-training.js
// ==============================================================

import { TrainingOrchestrator } from "./training-orchestrator.js";
import { NPC_BEHAVIOR } from "../npc/config-npc-behavior.js";

export async function initializeTraining(
  npcSystem,
  hideSeekManager,
  chunkManager
) {
  console.log("Initializing ML training system...");

  NPC_BEHAVIOR.TRAINING.enabled = true;

  if (chunkManager) {
    npcSystem.chunkManager = chunkManager;
    console.log("✅ ChunkManager connected to NPCSystem");
  } else {
    console.error("❌ WARNING: ChunkManager not provided!");
  }

  const trainer = new TrainingOrchestrator(npcSystem, hideSeekManager);

  if (chunkManager) {
    trainer.visionSystem.setChunkManager(chunkManager);
    console.log(
      "✅ Vision system connected to ChunkManager - raycasting enabled"
    );
  }

  // 4. Double-check encoder has chunkManager
  if (chunkManager && !trainer.encoder.chunkManager) {
    trainer.encoder.chunkManager = chunkManager;
    console.log(
      "✅ StateEncoder connected to ChunkManager - terrain detection enabled"
    );
  }

  await trainer.initializeAgents();

  console.log("Training system ready!");
  return trainer;
}

export async function startTraining(trainer, numEpisodes) {
  console.log(`\n${"=".repeat(50)}`);
  console.log("STARTING TRAINING SESSION");
  console.log(`Episodes: ${numEpisodes}`);
  console.log(`${"=".repeat(50)}\n`);

  try {
    await trainer.train(numEpisodes);

    console.log("\nTraining session complete!");
    console.log("Models saved to IndexedDB");

    const data = trainer.exportData();
    console.log("Training data exported");

    return data;
  } catch (error) {
    console.error("Training error:", error);
    throw error;
  }
}

export async function loadTrainedModel(
  trainer,
  episode = 2000,
  seekerFiles,
  hiderFiles
) {
  try {
    console.log(`Loading SEEKER model for episode ${episode}...`);

    if (!seekerFiles || seekerFiles.length === 0) {
      throw new Error("No seeker model files provided");
    }

    const sortedSeekerFiles = Array.from(seekerFiles).sort((a, b) => {
      if (a.name.endsWith(".json")) return -1;
      if (b.name.endsWith(".json")) return 1;
      return 0;
    });

    const seekerModel = await tf.loadLayersModel(
      tf.io.browserFiles(sortedSeekerFiles)
    );
    trainer.seekerAgent.model = seekerModel;
    trainer.seekerAgent.model.compile({
      optimizer: tf.train.adam(trainer.seekerAgent.learningRate),
      loss: "meanSquaredError",
    });
    console.log("✅ Seeker model loaded and compiled successfully.");

    // --- Load Hider Model ---
    console.log(`Loading HIDER model for episode ${episode}...`);

    if (!hiderFiles || hiderFiles.length === 0) {
      throw new Error("No hider model files provided");
    }

    // Sort hider files the same way
    const sortedHiderFiles = Array.from(hiderFiles).sort((a, b) => {
      if (a.name.endsWith(".json")) return -1;
      if (b.name.endsWith(".json")) return 1;
      return 0;
    });

    const hiderModel = await tf.loadLayersModel(
      tf.io.browserFiles(sortedHiderFiles)
    );
    trainer.hiderAgent.model = hiderModel;
    trainer.hiderAgent.model.compile({
      optimizer: tf.train.adam(trainer.hiderAgent.learningRate),
      loss: "meanSquaredError",
    });
    console.log("✅ Hider model loaded and compiled successfully.");

    // --- Final Agent Configuration ---
    trainer.seekerAgent.epsilon = 0;
    trainer.hiderAgent.epsilon = 0;
    trainer.seekerAgent.explorationBonus = 0;
    trainer.hiderAgent.explorationBonus = 0;

    trainer.seekerAgent.updateTargetModel();
    trainer.hiderAgent.updateTargetModel();

    console.log(
      `All models from episode ${episode} loaded. Agents are now in inference mode.`
    );
  } catch (error) {
    console.error("A critical error occurred while loading the models:", error);
    throw error;
  }
}

if (typeof window !== "undefined") {
  window.ML = {
    initializeTraining,
    startTraining,
  };

  console.log("ML training functions available at window.ML");
}

export default {
  initializeTraining,
  startTraining,
};
