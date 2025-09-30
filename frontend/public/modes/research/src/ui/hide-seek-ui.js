// ==============================================================
// FILE: research/src/ui/hide-seek-ui.js
// ==============================================================

export class HideSeekUI {
  constructor(npcSystem) {
    this.npcSystem = npcSystem;
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
          <h4>BLOCK INTERACTION</h4>
          <div class="hs-debug">
            <button id="hs-force-remove" class="btn-debug">FORCE REMOVE</button>
            <button id="hs-force-place" class="btn-debug">FORCE PLACE</button>
          </div>
          <div class="debug-status" id="hs-block-status">
            AUTO MODE: <span class="status-on">ON</span>
          </div>
        </div>
        
        <div class="hs-section">
          <h4>DEBUG CONTROLS</h4>
          <div class="hs-debug">
            <button id="hs-vision" class="btn-debug">TOGGLE VISION (B)</button>
            <button id="hs-camera" class="btn-debug">NPC CAMERA</button>
            <button id="hs-force-seek" class="btn-debug">FORCE SEEKING</button>
            <button id="hs-force-flee" class="btn-debug">FORCE FLEEING</button>
          </div>
          <div class="debug-status" id="hs-debug-status">
            VISION DEBUG: <span class="status-off">OFF</span>
          </div>
        </div>
      </div>
    `;
  }

  addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #hide-seek-overlay {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        background: #373737;
        border: 2px solid #8b8b8b;
        color: #ffffff;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
        z-index: 9999;
        text-transform: uppercase;
      }

      .hs-panel {
        padding: 0;
      }

      .hs-header {
        background: #727272;
        color: #ffffff;
        padding: 8px 12px;
        border-bottom: 2px solid #8b8b8b;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .hs-header h3 {
        margin: 0;
        font-size: 12px;
        letter-spacing: 1px;
      }

      .btn-close {
        background: transparent;
        border: none;
        color: #ffffff;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .btn-close:hover {
        background: #8b8b8b;
        color: #373737;
      }

      .hs-section {
        padding: 12px;
        border-bottom: 1px solid #8b8b8b;
      }

      .hs-section:last-child {
        border-bottom: none;
      }

      .hs-section h4 {
        margin: 0 0 8px 0;
        font-size: 10px;
        letter-spacing: 1px;
        color: #ffffff;
      }

      .hs-controls {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .btn {
        background: #8b8b8b;
        color: #373737;
        border: 1px solid #8b8b8b;
        padding: 8px;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 10px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .btn:hover {
        background: #727272;
        color: #ffffff;
      }

      .btn:disabled {
        background: #373737;
        color: #727272;
        cursor: not-allowed;
        border-color: #727272;
      }

      .btn:disabled:hover {
        background: #373737;
        color: #727272;
      }

      .hs-status {
        background: #727272;
        color: #ffffff;
        padding: 8px;
      }

      .status-line {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        font-size: 10px;
      }

      .status-line:last-child {
        margin-bottom: 0;
      }

      .hs-npc-list {
        background: #727272;
        color: #ffffff;
        padding: 8px;
        min-height: 40px;
        max-height: 120px;
        overflow-y: auto;
      }

      .npc-line {
        display: flex;
        justify-content: space-between;
        padding: 2px 0;
        border-bottom: 1px solid #8b8b8b;
        font-size: 10px;
      }

      .npc-line:last-child {
        border-bottom: none;
      }

      .npc-seeker {
        color: #ffffff;
        font-weight: bold;
      }

      .npc-hider {
        color: #8b8b8b;
      }

      .npc-found {
        color: #727272;
        text-decoration: line-through;
      }

      .hs-debug {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        margin-bottom: 8px;
      }

      .btn-debug {
        background: transparent;
        color: #ffffff;
        border: 1px solid #8b8b8b;
        padding: 6px;
        cursor: pointer;
        font-family: 'Courier New', monospace;
        font-size: 9px;
        font-weight: bold;
        text-transform: uppercase;
      }

      .btn-debug:hover {
        background: #8b8b8b;
        color: #373737;
      }

      .debug-status {
        font-size: 9px;
        color: #8b8b8b;
      }

      .status-on {
        color: #ffffff;
        font-weight: bold;
      }

      .status-off {
        color: #727272;
      }

      .state-countdown {
        color: #ffffff;
        font-weight: bold;
      }

      .state-seeking {
        color: #ffffff;
        font-weight: bold;
      }

      .state-game-over {
        color: #ffffff;
        font-weight: bold;
      }

      .hs-npc-list::-webkit-scrollbar {
        width: 8px;
      }

      .hs-npc-list::-webkit-scrollbar-track {
        background: #373737;
      }

      .hs-npc-list::-webkit-scrollbar-thumb {
        background: #8b8b8b;
      }

      .hs-npc-list::-webkit-scrollbar-thumb:hover {
        background: #727272;
      }
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

    // Block interaction buttons
    document
      .getElementById("hs-force-remove")
      ?.addEventListener("click", () => this.forceBlockRemoval());
    document
      .getElementById("hs-force-place")
      ?.addEventListener("click", () => this.forceBlockPlacement());

    document
      .getElementById("hs-vision")
      ?.addEventListener("click", () => this.toggleVisionDebug());
    document
      .getElementById("hs-camera")
      ?.addEventListener("click", () => this.toggleNPCCamera());
    document
      .getElementById("hs-force-seek")
      ?.addEventListener("click", () => this.forceSeeker());
    document
      .getElementById("hs-force-flee")
      ?.addEventListener("click", () => this.forceHidersFlee());

    document.addEventListener("keydown", (e) => this.handleKeyPress(e));
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
      case "b":
        this.toggleVisionDebug();
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
  //                   Block Interaction Controls
  //--------------------------------------------------------------//

  forceBlockRemoval() {
    this.npcSystem.npcs.forEach((npc) => {
      if (npc.blockInteraction) {
        npc.blockInteraction.currentlyInteracting = true;
        npc.blockInteraction.cooldownUntil = 0;
      }
    });
    console.log("Forced all NPCs to start removing blocks");
  }

  forceBlockPlacement() {
    this.npcSystem.npcs.forEach((npc) => {
      if (npc.blockPlacement) {
        npc.blockPlacement.currentlyPlacing = true;
        npc.blockPlacement.cooldownUntil = 0;
      }
    });
    console.log("Forced all NPCs to start placing blocks");
  }

  //--------------------------------------------------------------//
  //                      Debug Controls
  //--------------------------------------------------------------//

  toggleVisionDebug() {
    const enabled = this.npcSystem.hideSeekManager.toggleVisionDebug();
    this.updateDebugStatus(enabled);
    console.log(`Vision debug: ${enabled ? "enabled" : "disabled"}`);
  }

  toggleNPCCamera() {
    const seeker = this.npcSystem.getNPCByRole("seeker");
    const enabled = this.npcSystem.hideSeekManager.toggleNPCCamera(seeker);
    console.log(`NPC camera: ${enabled ? "active" : "inactive"}`);
  }

  forceSeeker() {
    this.npcSystem.forceSeeker();
    console.log("Forced seeker to start seeking");
  }

  forceHidersFlee() {
    this.npcSystem.forceHidersToFlee();
    console.log("Forced hiders to flee");
  }

  updateDebugStatus(visionEnabled) {
    const statusElement = document.getElementById("hs-debug-status");
    if (!statusElement) return;

    statusElement.innerHTML = `VISION DEBUG: <span class="${
      visionEnabled ? "status-on" : "status-off"
    }">${visionEnabled ? "ON" : "OFF"}</span>`;
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
      const role = npc.role || "NONE";
      const state = this.formatNPCState(npc.hideSeekState);
      const className = this.getNPCClassName(npc);

      html += `
        <div class="npc-line ${className}">
          <span>${npc.userData?.id || "UNKNOWN"}</span>
          <span>${role} - ${state}</span>
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
