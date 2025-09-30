// ==============================================================
// FILE: research/src/npc/vision/npc-camera-view.js
// ==============================================================

import { NPC_BEHAVIOR } from "../config-npc-behavior.js";

export class NPCCameraView {
  constructor(scene, renderer) {
    this.scene = scene;
    this.npcCamera = null;
    this.targetNPC = null;
    this.isActive = false;
    this.viewElement = null;
    this.viewRenderer = null;
    this.titleElement = null;
    this.infoElement = null;

    this.createCamera();
    this.createUI();
  }

  createCamera() {
    this.npcCamera = new THREE.PerspectiveCamera(
      75,
      300 / 200,
      0.1,
      NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER.visionRange
    );
  }

  createUI() {
    // Main container - positioned on LEFT side
    this.viewElement = document.createElement("div");
    this.viewElement.id = "npc-camera-view";
    this.viewElement.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      width: 300px;
      height: 240px;
      border: 2px solid #8b8b8b;
      background: #373737;
      z-index: 1000;
      display: none;
      overflow: hidden;
      font-family: 'Courier New', monospace;
    `;

    // Title bar
    this.titleElement = document.createElement("div");
    this.titleElement.textContent = "NPC VISION - NO TARGET";
    this.titleElement.style.cssText = `
      position: absolute;
      top: -30px;
      left: 0;
      right: 0;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      font-weight: bold;
      background: #727272;
      border: 1px solid #8b8b8b;
      padding: 4px 8px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    this.viewElement.appendChild(this.titleElement);

    // Info overlay
    this.infoElement = document.createElement("div");
    this.infoElement.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      color: #ffffff;
      font-family: 'Courier New', monospace;
      font-size: 9px;
      font-weight: bold;
      background: #727272;
      border-top: 1px solid #8b8b8b;
      padding: 4px;
      pointer-events: none;
      z-index: 10;
      text-transform: uppercase;
    `;
    this.viewElement.appendChild(this.infoElement);

    // Close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.style.cssText = `
      position: absolute;
      top: 2px;
      right: 2px;
      width: 18px;
      height: 18px;
      border: 1px solid #8b8b8b;
      background: #373737;
      color: #ffffff;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeButton.addEventListener("click", () => this.detach());
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "#8b8b8b";
      closeButton.style.color = "#373737";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "#373737";
      closeButton.style.color = "#ffffff";
    });
    this.viewElement.appendChild(closeButton);

    // Make draggable
    this.makeDraggable(this.viewElement);

    document.body.appendChild(this.viewElement);

    // Create renderer
    this.viewRenderer = new THREE.WebGLRenderer({ antialias: true });
    this.viewRenderer.setSize(300, 200);
    this.viewRenderer.setClearColor(0x87ceeb);
    this.viewElement.appendChild(this.viewRenderer.domElement);
  }

  makeDraggable(element) {
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    element.addEventListener("mousedown", dragStart);
    document.addEventListener("mousemove", drag);
    document.addEventListener("mouseup", dragEnd);

    function dragStart(e) {
      if (e.target === element || e.target === element.querySelector("div")) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
        element.style.cursor = "grabbing";
      }
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        element.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    }

    function dragEnd() {
      isDragging = false;
      element.style.cursor = "grab";
    }
  }

  attachToNPC(npc) {
    if (!npc) return;

    this.targetNPC = npc;
    this.isActive = true;
    this.viewElement.style.display = "block";

    const npcId = npc.userData?.id || "UNKNOWN";
    const npcRole = npc.role || "UNKNOWN";
    this.titleElement.textContent = `${npcRole.toUpperCase()} VISION - ${npcId.toUpperCase()}`;
  }

  detach() {
    this.targetNPC = null;
    this.isActive = false;
    this.viewElement.style.display = "none";
    this.titleElement.textContent = "NPC VISION - NO TARGET";
  }

  toggle(npc = null) {
    if (this.isActive) {
      this.detach();
    } else if (npc) {
      this.attachToNPC(npc);
    }
    return this.isActive;
  }

  update() {
    if (!this.isActive || !this.targetNPC) return;

    const npc = this.targetNPC;

    // Position camera at eye level
    this.npcCamera.position.copy(npc.position);
    this.npcCamera.position.y += 1.6;

    // Calculate look direction with pitch support (NEW)
    const pitch = npc.pitch || 0;
    const yaw = npc.yaw;

    const forward = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch)
    );

    const lookTarget = npc.position.clone().add(forward.multiplyScalar(10));
    lookTarget.y += 1.6;
    this.npcCamera.lookAt(lookTarget);

    // Update info overlay
    const pos = npc.position;
    const yawDegrees = Math.round(((yaw * 180) / Math.PI) % 360);
    const role = npc.role || "UNKNOWN";
    const state = npc.hideSeekState || "IDLE";

    // Calculate nearest distance
    let nearestDistance = "N/A";
    if (window.npcSystem && window.npcSystem.npcs) {
      const others = window.npcSystem.npcs.filter((other) => other !== npc);
      if (others.length > 0) {
        const distances = others.map((other) =>
          npc.position.distanceTo(other.position)
        );
        nearestDistance = Math.round(Math.min(...distances) * 10) / 10;
      }
    }

    this.infoElement.innerHTML = `
      <div>POS: ${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(
      pos.z
    )}</div>
      <div>FACING: ${yawDegrees}° | STATE: ${state}</div>
      <div>NEAREST: ${nearestDistance}M | ROLE: ${role}</div>
    `;

    // Render
    this.viewRenderer.render(this.scene, this.npcCamera);
  }

  destroy() {
    if (this.viewElement?.parentNode) {
      document.body.removeChild(this.viewElement);
    }
    if (this.viewRenderer) {
      this.viewRenderer.dispose();
    }
    this.npcCamera = null;
    this.targetNPC = null;
  }
}

export default NPCCameraView;
