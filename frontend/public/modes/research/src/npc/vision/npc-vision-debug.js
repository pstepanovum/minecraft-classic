// ==============================================================
// FILE: research/src/npc/vision/npc-vision-debug.js
// ==============================================================

import { NPC_BEHAVIOR } from "../config-npc-behavior.js";
import * as GameState from "../../../../../src/core/game-state.js";

export class NPCVisionDebug {
  constructor(scene) {
    this.scene = scene;
    this.visionCones = new Map();
    this.raycastLines = new Map();
    this.debugEnabled = false;
    this.showVisionCones = false;
    this.showRaycastLines = false;
  }

  toggleDebug() {
    this.debugEnabled = !this.debugEnabled;
    if (!this.debugEnabled) this.clearAll();
    return this.debugEnabled;
  }

  toggleVisionCones() {
    this.showVisionCones = !this.showVisionCones;
    if (!this.showVisionCones) this.clearVisionCones();
    return this.showVisionCones;
  }

  toggleRaycastLines() {
    this.showRaycastLines = !this.showRaycastLines;
    if (!this.showRaycastLines) this.clearRaycastLines();
    return this.showRaycastLines;
  }

  // Main vision detection: distance -> FOV -> line of sight
  findVisibleTarget(seeker, targets) {
    const config = NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER;
    const results = [];

    for (const target of targets) {
      if (target === seeker) continue;

      const distance = seeker.position.distanceTo(target.position);

      // Distance check
      if (distance > config.visionRange) continue;

      // FOV check (includes pitch now)
      if (!this.isInFOV(seeker, target, config.visionAngle)) continue;

      // Line of sight check
      const hasLOS = this.checkLineOfSight(seeker.position, target.position);

      if (hasLOS) {
        results.push({ target, distance });

        if (this.debugEnabled && this.showRaycastLines) {
          this.drawRaycast(seeker, target, true);
        }
      }
    }

    if (this.debugEnabled && this.showVisionCones) {
      this.updateVisionCone(seeker);
    }

    return results;
  }

  // Check if target is in field of view (horizontal + vertical)
  isInFOV(seeker, target, maxAngle) {
    // Horizontal check
    const forward = new THREE.Vector3(
      -Math.sin(seeker.yaw),
      0,
      -Math.cos(seeker.yaw)
    );

    const toTarget = target.position.clone().sub(seeker.position);
    const horizontalDir = toTarget.clone();
    horizontalDir.y = 0;
    horizontalDir.normalize();

    const horizontalAngle = forward.angleTo(horizontalDir);
    if (horizontalAngle > maxAngle / 2) return false;

    // Vertical check (pitch)
    const horizontalDist = Math.sqrt(
      toTarget.x * toTarget.x + toTarget.z * toTarget.z
    );
    const targetPitch = Math.atan2(toTarget.y, horizontalDist);
    const pitchDiff = Math.abs(targetPitch - (seeker.pitch || 0));

    return pitchDiff < Math.PI / 3; // 60° vertical FOV
  }

  // Simple raycast through blocks
  checkLineOfSight(from, to) {
    const dir = to.clone().sub(from);
    const distance = dir.length();
    dir.normalize();

    const steps = Math.ceil(distance / 0.5);

    for (let i = 1; i < steps; i++) {
      const pos = from.clone().add(dir.clone().multiplyScalar(i * 0.5));
      pos.y += 1.5; // Eye level

      try {
        const block = GameState.getBlockType(
          Math.floor(pos.x),
          Math.floor(pos.y),
          Math.floor(pos.z)
        );

        // Solid block = blocked
        if (block > 0 && block !== 8 && block !== 9) {
          return false;
        }
      } catch (e) {
        continue;
      }
    }

    return true;
  }

  // Draw vision cone
  updateVisionCone(npc) {
    if (this.visionCones.has(npc)) {
      const cone = this.visionCones.get(npc);
      this.scene.remove(cone);
      cone.geometry.dispose();
      cone.material.dispose();
    }

    const config = NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER;
    const geometry = new THREE.ConeGeometry(
      Math.tan(config.visionAngle / 2) * config.visionRange,
      config.visionRange,
      16,
      1,
      true
    );

    const material = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });

    const cone = new THREE.Mesh(geometry, material);
    cone.position.copy(npc.position);
    cone.position.y += 1.5;
    cone.rotation.x = -Math.PI / 2;
    cone.rotation.y = npc.yaw;

    this.scene.add(cone);
    this.visionCones.set(npc, cone);
  }

  // Draw raycast line
  drawRaycast(from, to, visible) {
    if (this.raycastLines.has(to)) {
      const line = this.raycastLines.get(to);
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }

    const points = [from.position.clone(), to.position.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: visible ? 0x00ff00 : 0xff0000,
      transparent: true,
      opacity: 0.6,
    });

    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    this.raycastLines.set(to, line);
  }

  clearVisionCones() {
    this.visionCones.forEach((cone) => {
      this.scene.remove(cone);
      cone.geometry.dispose();
      cone.material.dispose();
    });
    this.visionCones.clear();
  }

  clearRaycastLines() {
    this.raycastLines.forEach((line) => {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
    this.raycastLines.clear();
  }

  clearAll() {
    this.clearVisionCones();
    this.clearRaycastLines();
  }

  update(npcs) {
    if (!this.debugEnabled || !this.showVisionCones) return;

    npcs.forEach((npc) => {
      if (npc.role === "seeker") {
        this.updateVisionCone(npc);
      }
    });
  }

  getDebugInfo(npc) {
    const config = NPC_BEHAVIOR.HIDE_AND_SEEK.SEEKER;
    return {
      position: npc.position,
      yaw: npc.yaw,
      pitch: npc.pitch || 0,
      visionRange: config.visionRange,
      visionAngle: config.visionAngle,
    };
  }
}

export default NPCVisionDebug;
