// ==============================================================
// FILE: research/src/ui/hide-seek-ui.js
// ==============================================================

export class HideSeekUI {
  constructor(npcSystem, callbacks = {}) {
    this.npcSystem = npcSystem;
    this.callbacks = callbacks; // Store the callbacks
    this.updateInterval = null;
    this.isVisible = false;

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
            <h4>ML TRAINING</h4>
            <div class="hs-controls">
                <button id="hs-start-training" class="btn">START NEW TRAINING</button>
                <div class="hs-load-controls">
                    <button id="hs-load-model" class="btn">LOAD MODEL</button>
                    <input type="number" id="hs-episode-number" value="500" placeholder="Ep #" title="Episode Number">
                </div>
            </div>
        </div>

        <div class="hs-section">
          <h4>GAME CONTROLS</h4>
          <div class="hs-controls">
            <button id="hs-start" class="btn btn-start">START GAME (H)</button>
            <button id="hs-restart" class="btn btn-restart">RESTART (J)</button>
            <button id="hs-stop" class="btn btn-stop">STOP GAME (K)</button>
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
        
        <div class="hs-section">
          <h4>DEBUG CONTROLS</h4>
          <div class="hs-debug">
            <button id="hs-camera" class="btn-debug">NPC CAMERA (C)</button>
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
      .hs-load-controls { display: flex; gap: 4px; }
      .hs-load-controls .btn { flex-grow: 1; }
      #hs-episode-number {
        width: 60px; background: #727272; border: 1px solid #8b8b8b; color: white;
        text-align: center; font-family: 'Courier New', monospace; font-weight: bold;
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
      .hs-debug { display: flex; flex-direction: column; gap: 4px; }
      .btn-debug {
        background: transparent; color: #ffffff; border: 1px solid #8b8b8b; padding: 6px; cursor: pointer;
        font-family: 'Courier New', monospace; font-size: 9px; font-weight: bold; text-transform: uppercase;
      }
      .btn-debug:hover { background: #8b8b8b; color: #373737; }
      .state-countdown { color: #ffff66; font-weight: bold; }
      .state-seeking { color: #66ff66; font-weight: bold; }
      .state-game-over { color: #ff6666; font-weight: bold; }
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
    if (overlay) {
      overlay.style.display = "block";
    }
  }

  hide() {
    this.isVisible = false;
    const overlay = document.getElementById("hide-seek-overlay");
    if (overlay) {
      overlay.style.display = "none";
    }
  }

  //--------------------------------------------------------------//
  //                      Event Handling
  //--------------------------------------------------------------//

  setupEventListeners() {
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

    document.getElementById("hs-close")?.addEventListener("click", () => {
      this.hide();
    });

    document
      .getElementById("hs-start")
      ?.addEventListener("click", () => this.startGame());
    document
      .getElementById("hs-restart")
      ?.addEventListener("click", () => this.restartGame());
    document
      .getElementById("hs-stop")
      ?.addEventListener("click", () => this.stopGame());

    document
      .getElementById("hs-camera")
      ?.addEventListener("click", () => this.toggleNPCCamera());

    document
      .getElementById("hs-start-training")
      ?.addEventListener("click", () => {
        if (confirm("This will start a long training process. Are you sure?")) {
          this.callbacks.onStartTraining?.();
          this.disableMLButtons();
        }
      });

    document
      .getElementById("hs-load-model")
      ?.addEventListener("click", async () => {
        const episodeInput = document.getElementById("hs-episode-number");
        const episode = episodeInput ? parseInt(episodeInput.value, 10) : 500;

        const modelInput = document.createElement("input");
        modelInput.type = "file";
        modelInput.accept = ".json,.bin";
        modelInput.multiple = true;

        alert(
          `Please select ALL 4 model files at once:\n\n` +
            `1. seeker_ep${episode}.json\n` +
            `2. seeker_ep${episode}.weights.bin\n` +
            `3. hider_ep${episode}.json\n` +
            `4. hider_ep${episode}.weights.bin\n\n` +
            `Hold Ctrl (or Cmd on Mac) and click all 4 files, then press Open.`
        );

        const allFiles = await new Promise((resolve) => {
          modelInput.onchange = (e) => resolve(e.target.files);
          modelInput.click();
        });

        if (!allFiles || allFiles.length < 4) {
          alert(
            `You must select all 4 files (you selected ${
              allFiles?.length || 0
            }).\n\n` +
              `Expected files:\n` +
              `- seeker .json and .weights.bin\n` +
              `- hider .json and .weights.bin\n\n` +
              `Operation cancelled.`
          );
          return;
        }

        // Separate the files into seeker and hider
        const seekerFiles = [];
        const hiderFiles = [];

        for (let i = 0; i < allFiles.length; i++) {
          const file = allFiles[i];
          if (file.name.toLowerCase().includes("seeker")) {
            seekerFiles.push(file);
          } else if (file.name.toLowerCase().includes("hider")) {
            hiderFiles.push(file);
          }
        }

        if (seekerFiles.length < 2) {
          alert(
            `Missing seeker files! Found ${seekerFiles.length}/2.\n` +
              `Make sure you selected both seeker_ep${episode}.json and seeker_ep${episode}.weights.bin`
          );
          return;
        }

        if (hiderFiles.length < 2) {
          alert(
            `Missing hider files! Found ${hiderFiles.length}/2.\n` +
              `Make sure you selected both hider_ep${episode}.json and hider_ep${episode}.weights.bin`
          );
          return;
        }

        console.log(`✅ All 4 files selected successfully`);

        // Pass the arrays directly - they'll work with tf.io.browserFiles
        this.callbacks.onLoadModel?.(episode, seekerFiles, hiderFiles);
        this.disableMLButtons();
      });

    document.addEventListener("keydown", (e) => this.handleKeyPress(e));
  }

  disableMLButtons() {
    const startTrainingBtn = document.getElementById("hs-start-training");
    const loadModelBtn = document.getElementById("hs-load-model");
    if (startTrainingBtn) startTrainingBtn.disabled = true;
    if (loadModelBtn) loadModelBtn.disabled = true;
  }

  handleKeyPress(e) {
    if (e.ctrlKey || e.altKey || e.target.tagName === "INPUT") return;

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
      case "c":
        this.toggleNPCCamera();
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

    // Stop continuous demo if running
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
  //                      Debug Controls
  //--------------------------------------------------------------//

  toggleNPCCamera() {
    const seekers = this.npcSystem.getNPCsByRole("seeker");
    const seeker = seekers && seekers.length > 0 ? seekers[0] : null;

    if (!seeker) {
      console.warn("No seeker found for camera view");
      return;
    }

    const enabled = this.npcSystem.hideSeekManager.toggleNPCCamera(seeker);
    console.log(`NPC camera: ${enabled ? "active" : "inactive"}`);
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

    const stateElement = document.getElementById("hs-state");
    if (stateElement) {
      stateElement.textContent = this.formatGameState(status.state);
      stateElement.className = `state-${status.state.replace("_", "-")}`;
    }

    const foundElement = document.getElementById("hs-found");
    if (foundElement) {
      foundElement.textContent = `${status.hidersFound}/${status.totalHiders}`;
    }

    const timeElement = document.getElementById("hs-time");
    if (timeElement) {
      const minutes = Math.floor(status.gameTime / 60000);
      const seconds = Math.floor((status.gameTime % 60000) / 1000);
      timeElement.textContent = `${minutes}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }

    const npcsElement = document.getElementById("hs-npcs");
    if (npcsElement) {
      npcsElement.textContent = this.npcSystem.npcs.length;
    }

    if (status.state === "game_over") {
      this.updateButtons("stopped");
    } else if (status.state !== "waiting") {
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
