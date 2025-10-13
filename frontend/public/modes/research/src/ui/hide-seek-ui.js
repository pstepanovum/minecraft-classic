// ==============================================================
// FILE: research/src/ui/hide-seek-ui.js
// ==============================================================

import { NPC } from "../npc/config-npc-behavior.js";

export class HideSeekUI {
  constructor(npcSystem, callbacks = {}) {
    this.npcSystem = npcSystem;
    this.callbacks = callbacks;
    this.updateInterval = null;
    this.isVisible = false;
    this.trainingMode = NPC.TRAINING.debug;

    this.setupUI();
    this.setupEventListeners();
    this.startStatusUpdates();

    console.log("Hide and Seek UI initialized - Press P to toggle");
  }

  //--------------------------------------------------------------//
  //                        UI Setup
  //--------------------------------------------------------------//

  setupUI() {
    const uiContainer = document.createElement("div");
    uiContainer.id = "hide-seek-overlay";
    uiContainer.innerHTML = this.createUIHTML();
    uiContainer.style.display = "none";

    this.addStyles();
    document.body.appendChild(uiContainer);
  }

  createUIHTML() {
    return `
      <div class="hs-panel">
        <div class="hs-header">
          <h3>HIDE AND SEEK CONTROLS</h3>
          <button id="hs-close" class="btn-close">×</button>
        </div>
        
        <div class="hs-section">
          <h4>TRAINING</h4>
            <div class="hs-controls">
              <button id="hs-start-training" class="btn">START TRAINING</button>
              <button id="hs-demo-model" class="btn">DEMO TRAINED MODEL</button>  <!-- ADD THIS -->
              <button id="hs-stop-training" class="btn btn-stop" style="display: none;">STOP TRAINING</button>
            </div>
          <div class="hs-training-status" id="hs-training-status" style="display: none;">
            <div class="status-line">EPISODE: <span id="hs-train-episode">0</span></div>
            <div class="status-line">MODE: <span id="hs-train-mode">IDLE</span></div>
          </div>
        </div>

        <div class="hs-section">
          <h4>MANUAL DEMO</h4>
          <div class="hs-controls">
            <button id="hs-start" class="btn btn-start">START GAME (H)</button>
            <button id="hs-restart" class="btn btn-restart">RESTART (J)</button>
            <button id="hs-stop" class="btn btn-stop">STOP (K)</button>
          </div>
        </div>
        
        <div class="hs-section">
          <h4>GAME STATUS</h4>
          <div class="hs-status">
            <div class="status-line">STATE: <span id="hs-state">WAITING</span></div>
            <div class="status-line">FOUND: <span id="hs-found">0/0</span></div>
            <div class="status-line">TIME: <span id="hs-time">0:00</span></div>
            <div class="status-line">NPCS: <span id="hs-npcs">0</span></div>
          </div>
        </div>
        
        <div class="hs-section">
          <h4>NPC LIST</h4>
          <div class="hs-npc-list" id="hs-npc-list">
            <div class="npc-line">NO NPCS SPAWNED</div>
          </div>
        </div>
      </div>
    `;
  }

  addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #hide-seek-overlay {
        position: fixed; top: 20px; right: 20px; width: 300px; background: #373737;
        border: 2px solid #8b8b8b; color: #ffffff; font-family: 'Courier New', monospace;
        font-size: 11px; font-weight: bold; z-index: 9999; text-transform: uppercase;
      }
      .hs-panel { padding: 0; }
      .hs-header {
        background: #727272; color: #ffffff; padding: 8px 12px;
        border-bottom: 2px solid #8b8b8b; display: flex; justify-content: space-between; align-items: center;
      }
      .hs-header h3 { margin: 0; font-size: 12px; letter-spacing: 1px; }
      .btn-close {
        background: transparent; border: none; color: #ffffff; font-size: 16px;
        font-weight: bold; cursor: pointer; padding: 0; width: 20px; height: 20px;
        display: flex; align-items: center; justify-content: center;
      }
      .btn-close:hover { background: #8b8b8b; color: #373737; }
      .hs-section { padding: 12px; border-bottom: 1px solid #8b8b8b; }
      .hs-section:last-child { border-bottom: none; }
      .hs-section h4 { margin: 0 0 8px 0; font-size: 10px; letter-spacing: 1px; color: #ffffff; }
      .hs-controls { display: flex; flex-direction: column; gap: 4px; }
      .btn {
        background: #8b8b8b; color: #373737; border: 1px solid #8b8b8b; padding: 8px;
        cursor: pointer; font-family: 'Courier New', monospace; font-size: 10px;
        font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;
      }
      .btn:hover { background: #727272; color: #ffffff; }
      .btn:disabled { background: #373737; color: #727272; cursor: not-allowed; border-color: #727272; }
      .btn:disabled:hover { background: #373737; color: #727272; }
      .btn-stop { background: #ff6666; color: #ffffff; }
      .btn-stop:hover { background: #ff4444; }
      .hs-training-status { 
        background: #727272; color: #ffffff; padding: 8px; margin-top: 8px;
      }
      .hs-status { background: #727272; color: #ffffff; padding: 8px; }
      .status-line { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px; }
      .status-line:last-child { margin-bottom: 0; }
      .hs-npc-list { background: #727272; color: #ffffff; padding: 8px; min-height: 40px; max-height: 120px; overflow-y: auto; }
      .npc-line { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #8b8b8b; font-size: 10px; }
      .npc-line:last-child { border-bottom: none; }
      .npc-seeker { color: #ff6666; font-weight: bold; }
      .npc-hider { color: #66ff66; }
      .npc-found { color: #727272; text-decoration: line-through; }
      .state-countdown { color: #ffff66; font-weight: bold; }
      .state-seeking { color: #66ff66; font-weight: bold; }
      .state-game-over { color: #ff6666; font-weight: bold; }
      .state-training { color: #66ccff; font-weight: bold; }
      .hs-npc-list::-webkit-scrollbar { width: 8px; }
      .hs-npc-list::-webkit-scrollbar-track { background: #373737; }
      .hs-npc-list::-webkit-scrollbar-thumb { background: #8b8b8b; }
      .hs-npc-list::-webkit-scrollbar-thumb:hover { background: #727272; }
    `;
    document.head.appendChild(style);
  }

  //--------------------------------------------------------------//
  //                      Toggle Functionality
  //--------------------------------------------------------------//

  toggle() {
    this.isVisible = !this.isVisible;
    const overlay = document.getElementById("hide-seek-overlay");
    if (overlay) {
      overlay.style.display = this.isVisible ? "block" : "none";
    }
    console.log(`Hide and Seek UI ${this.isVisible ? "opened" : "closed"}`);
  }

  show() {
    this.isVisible = true;
    const overlay = document.getElementById("hide-seek-overlay");
    if (overlay) overlay.style.display = "block";
  }

  hide() {
    this.isVisible = false;
    const overlay = document.getElementById("hide-seek-overlay");
    if (overlay) overlay.style.display = "none";
  }

  //--------------------------------------------------------------//
  //                      Event Handling
  //--------------------------------------------------------------//

  setupEventListeners() {
    // Toggle UI with P key
    document.addEventListener("keydown", (e) => {
      if (
        e.key.toLowerCase() === "p" &&
        !e.ctrlKey &&
        !e.altKey &&
        e.target.tagName !== "INPUT"
      ) {
        e.preventDefault();
        this.toggle();
      }
    });

    // Close button
    document.getElementById("hs-close")?.addEventListener("click", () => {
      this.hide();
    });

    // Demo trained model button
    document
      .getElementById("hs-demo-model")
      ?.addEventListener("click", async () => {
        if (
          confirm(
            "Start demo mode? This will show the trained agents playing.\n\nMake sure Python demo is running!"
          )
        ) {
          if (window.startDemoMode) {
            await window.startDemoMode();
          }
        }
      });

    // Training controls
    document
      .getElementById("hs-start-training")
      ?.addEventListener("click", () => {
        if (
          confirm(
            "Start PPO training? This will take a long time.\n\nMake sure Python backend is running!"
          )
        ) {
          this.callbacks.onStartTraining?.();
          this.setTrainingMode(true);
        }
      });

    document
      .getElementById("hs-stop-training")
      ?.addEventListener("click", () => {
        if (confirm("Stop training?")) {
          if (window.stopPPOTraining) {
            window.stopPPOTraining();
          }
          this.setTrainingMode(false);
        }
      });

    // Manual game controls
    document
      .getElementById("hs-start")
      ?.addEventListener("click", () => this.startGame());
    document
      .getElementById("hs-restart")
      ?.addEventListener("click", () => this.restartGame());
    document
      .getElementById("hs-stop")
      ?.addEventListener("click", () => this.stopGame());

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleKeyPress(e));
  }

  setTrainingMode(active) {
    this.trainingMode = active;

    const startBtn = document.getElementById("hs-start-training");
    const stopBtn = document.getElementById("hs-stop-training");
    const trainingStatus = document.getElementById("hs-training-status");
    const modeSpan = document.getElementById("hs-train-mode");

    if (active) {
      if (startBtn) startBtn.style.display = "none";
      if (stopBtn) stopBtn.style.display = "block";
      if (trainingStatus) trainingStatus.style.display = "block";
      if (modeSpan) modeSpan.textContent = "TRAINING";

      // Disable manual controls during training
      const manualButtons = ["hs-start", "hs-restart", "hs-stop"];
      manualButtons.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = true;
      });
    } else {
      if (startBtn) startBtn.style.display = "block";
      if (stopBtn) stopBtn.style.display = "none";
      if (trainingStatus) trainingStatus.style.display = "none";
      if (modeSpan) modeSpan.textContent = "IDLE";

      // Re-enable manual controls
      const manualButtons = ["hs-start", "hs-restart", "hs-stop"];
      manualButtons.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = false;
      });
    }
  }

  updateTrainingEpisode(episode) {
    const episodeSpan = document.getElementById("hs-train-episode");
    if (episodeSpan) {
      episodeSpan.textContent = episode;
    }
  }

  handleKeyPress(e) {
    if (e.ctrlKey || e.altKey || e.target.tagName === "INPUT") return;
    if (this.trainingMode) return; // Disable shortcuts during training

    switch (e.key.toLowerCase()) {
      case "h":
        this.startGame();
        break;
      case "j":
        this.restartGame();
        break;
      case "k":
        this.stopGame();
        break;
    }
  }

  //--------------------------------------------------------------//
  //                      Game Controls
  //--------------------------------------------------------------//

  startGame() {
    console.log("Starting Hide and Seek game...");
    this.npcSystem.removeAllNPCs();
    this.npcSystem.setGameMode("hide_and_seek");
    this.npcSystem.generateNPCs(3);
    this.updateButtons("playing");
  }

  restartGame() {
    console.log("Restarting Hide and Seek game...");
    this.npcSystem.restartHideSeekGame();
    this.updateButtons("playing");
  }

  stopGame() {
    console.log("Stopping Hide and Seek game...");

    if (window.isRunningDemo) {
      window.isRunningDemo = false;
      console.log("Stopped continuous demonstration");
    }

    this.npcSystem.removeAllNPCs();
    this.npcSystem.setGameMode("normal");
    this.updateButtons("stopped");
  }

  updateButtons(state) {
    const startBtn = document.getElementById("hs-start");
    const restartBtn = document.getElementById("hs-restart");
    const stopBtn = document.getElementById("hs-stop");

    if (!startBtn || !restartBtn || !stopBtn) return;

    switch (state) {
      case "playing":
        startBtn.disabled = true;
        restartBtn.disabled = false;
        stopBtn.disabled = false;
        break;
      case "stopped":
        startBtn.disabled = false;
        restartBtn.disabled = true;
        stopBtn.disabled = true;
        break;
    }
  }

  //--------------------------------------------------------------//
  //                      Status Updates
  //--------------------------------------------------------------//

  startStatusUpdates() {
    this.updateInterval = setInterval(() => {
      if (this.isVisible) {
        this.updateGameStatus();
        this.updateNPCList();
      }
    }, 500);
  }

  updateGameStatus() {
    const status = this.npcSystem.getHideSeekStatus();

    // Update state
    const stateElement = document.getElementById("hs-state");
    if (stateElement) {
      const displayState = this.trainingMode
        ? "TRAINING"
        : this.formatGameState(status.state);
      stateElement.textContent = displayState;
      stateElement.className = this.trainingMode
        ? "state-training"
        : `state-${status.state.replace("_", "-")}`;
    }

    // Update found count
    const foundElement = document.getElementById("hs-found");
    if (foundElement) {
      foundElement.textContent = `${status.hidersFound}/${status.totalHiders}`;
    }

    // FIXED: Update time display
    const timeElement = document.getElementById("hs-time");
    if (timeElement) {
      if (this.trainingMode) {
        // During training, show step count instead of time
        const bridge = window.activePPOBridge;
        const stepCount = bridge?.currentStep || 0;
        timeElement.textContent = `STEP ${stepCount}`;
      } else {
        // Normal mode - show actual time
        const minutes = Math.floor(status.gameTime / 60000);
        const seconds = Math.floor((status.gameTime % 60000) / 1000);
        timeElement.textContent = `${minutes}:${seconds
          .toString()
          .padStart(2, "0")}`;
      }
    }

    // Update NPC count
    const npcsElement = document.getElementById("hs-npcs");
    if (npcsElement) {
      npcsElement.textContent = this.npcSystem.npcs.length;
    }

    // Update button states
    if (status.state === "game_over" && !this.trainingMode) {
      this.updateButtons("stopped");
    } else if (status.state !== "waiting" && !this.trainingMode) {
      this.updateButtons("playing");
    }
  }

  updateNPCList() {
    const listElement = document.getElementById("hs-npc-list");
    if (!listElement) return;

    if (this.npcSystem.npcs.length === 0) {
      listElement.innerHTML = '<div class="npc-line">NO NPCS SPAWNED</div>';
      return;
    }

    let html = "";
    this.npcSystem.npcs.forEach((npc) => {
      const id = npc.userData?.id || "UNKNOWN";
      const state = this.formatNPCState(npc.hideSeekState);
      const className = this.getNPCClassName(npc);

      html += `
        <div class="npc-line ${className}">
          <span>${id.toUpperCase()}</span>
          <span>${state}</span>
        </div>
      `;
    });

    listElement.innerHTML = html;
  }

  getNPCClassName(npc) {
    if (npc.hideSeekState === "found") return "npc-found";
    if (npc.role === "seeker") return "npc-seeker";
    return "npc-hider";
  }

  formatGameState(state) {
    const states = {
      waiting: "WAITING",
      countdown: "COUNTDOWN",
      seeking: "ACTIVE",
      game_over: "GAME OVER",
    };
    return states[state] || state.toUpperCase();
  }

  formatNPCState(state) {
    const states = {
      hidden: "HIDDEN",
      fleeing: "FLEEING",
      seeking: "SEEKING",
      found: "FOUND",
      waiting: "WAITING",
    };
    return states[state] || "IDLE";
  }

  //--------------------------------------------------------------//
  //                      Cleanup
  //--------------------------------------------------------------//

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    const overlay = document.getElementById("hide-seek-overlay");
    if (overlay) {
      overlay.remove();
    }

    console.log("Hide and Seek UI destroyed");
  }
}

export default HideSeekUI;
