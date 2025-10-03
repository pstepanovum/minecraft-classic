// ==============================================================
// FILE: research/src/npc/physics/npc-vision-system.js
// ==============================================================
export class NPCVisionSystem {
  constructor(config = {}) {
    this.visionRange = config.visionRange || 12;
    this.visionAngle = config.visionAngle || Math.PI / 2;
    this.rayCount = config.rayCount || 32;
    this.rayPrecisionAngle = config.rayPrecisionAngle || 0.1;

    this.debug = config.debug || false;
    this.chunkManager = null;

    // ✅ FIX 2: Use a Map to store debug lines for each NPC separately.
    this.debugLines = new Map();

    this.warningShown = {
      noChunkManager: false,
    };
  }

  setChunkManager(chunkManager) {
    this.chunkManager = chunkManager;
  }

  getVisionData(observer, allNPCs) {
    const visibleNPCs = [];

    allNPCs.forEach((target) => {
      if (target === observer || target.role === observer.role) return;

      const distance = observer.position.distanceTo(target.position);

      if (distance < this.visionRange) {
        if (this.isInFieldOfView(observer, target)) {
          if (this.hasLineOfSight(observer, target)) {
            const direction = this.getDirectionVector(observer, target);

            visibleNPCs.push({
              id: target.userData.id,
              role: target.role,
              distance: distance,
              direction: direction,
              position: target.position.clone(),
              state: target.hideSeekState,
            });
          }
        }
      }
    });

    visibleNPCs.sort((a, b) => a.distance - b.distance);

    return {
      visibleNPCs,
      raycastData: {
        rays: this.generateRaycast(observer, allNPCs, visibleNPCs),
      },
      sounds: [],
    };
  }

  isInFieldOfView(observer, target) {
    const toTarget = {
      x: target.position.x - observer.position.x,
      z: target.position.z - observer.position.z,
    };

    // This calculation is based on a +Z forward world, so we must adjust the observer's yaw.
    const observerForwardAngle = observer.yaw - Math.PI;

    const angleToTarget = Math.atan2(toTarget.x, toTarget.z);
    const angleDiff = angleToTarget - observerForwardAngle;

    const normalizedAngleDiff = Math.atan2(
      Math.sin(angleDiff),
      Math.cos(angleDiff)
    );

    return Math.abs(normalizedAngleDiff) < this.visionAngle / 2;
  }

  hasLineOfSight(observer, target) {
    if (!this.chunkManager) {
      if (!this.warningShown.noChunkManager) {
        console.warn(
          "⚠️ NPCVisionSystem: ChunkManager not set - vision disabled"
        );
        this.warningShown.noChunkManager = true;
      }
      return false;
    }

    const startPos = {
      x: observer.position.x,
      y: observer.position.y + 1.6,
      z: observer.position.z,
    };

    const endPos = {
      x: target.position.x,
      y: target.position.y + 0.85,
      z: target.position.z,
    };

    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dz = endPos.z - startPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const direction = {
      x: dx / distance,
      y: dy / distance,
      z: dz / distance,
    };

    return this.raycastToTarget(startPos, direction, distance);
  }

  raycastToTarget(startPos, direction, maxDistance) {
    let gridX = Math.floor(startPos.x);
    let gridY = Math.floor(startPos.y);
    let gridZ = Math.floor(startPos.z);

    const stepX = direction.x >= 0 ? 1 : -1;
    const stepY = direction.y >= 0 ? 1 : -1;
    const stepZ = direction.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / direction.x) || Infinity;
    const tDeltaY = Math.abs(1 / direction.y) || Infinity;
    const tDeltaZ = Math.abs(1 / direction.z) || Infinity;

    const xOffset =
      direction.x >= 0
        ? 1 - (startPos.x - Math.floor(startPos.x))
        : startPos.x - Math.floor(startPos.x);
    const yOffset =
      direction.y >= 0
        ? 1 - (startPos.y - Math.floor(startPos.y))
        : startPos.y - Math.floor(startPos.y);
    const zOffset =
      direction.z >= 0
        ? 1 - (startPos.z - Math.floor(startPos.z))
        : startPos.z - Math.floor(startPos.z);

    let tMaxX = direction.x !== 0 ? tDeltaX * xOffset : Infinity;
    let tMaxY = direction.y !== 0 ? tDeltaY * yOffset : Infinity;
    let tMaxZ = direction.z !== 0 ? tDeltaZ * zOffset : Infinity;

    let distance = 0;

    while (distance <= maxDistance) {
      const block = this.getBlockAt(gridX, gridY, gridZ);

      if (block && this.isBlockSolid(block.blockType)) {
        return false;
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        distance = tMaxX;
        tMaxX += tDeltaX;
        gridX += stepX;
      } else if (tMaxY < tMaxZ) {
        distance = tMaxY;
        tMaxY += tDeltaY;
        gridY += stepY;
      } else {
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        gridZ += stepZ;
      }

      if (distance > maxDistance) {
        break;
      }
    }

    return true;
  }

  getBlockAt(x, y, z) {
    if (!this.chunkManager) return null;

    const CHUNK_SIZE = 16;
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

    const blockType = this.chunkManager.getBlockType(
      chunkX,
      chunkY,
      chunkZ,
      localX,
      localY,
      localZ
    );

    return {
      blockType: blockType,
      chunkCoords: { x: chunkX, y: chunkY, z: chunkZ },
      localCoords: { x: localX, y: localY, z: localZ },
    };
  }

  isBlockSolid(blockType) {
    if (blockType === 0) return false;

    const transparentBlocks = [7, 23, 24, 26];
    return !transparentBlocks.includes(blockType);
  }

  getDirectionVector(observer, target) {
    const dx = target.position.x - observer.position.x;
    const dz = target.position.z - observer.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    return {
      x: dx / Math.max(distance, 0.001),
      z: dz / Math.max(distance, 0.001),
    };
  }

  generateRaycast(observer, allNPCs, visibleNPCs) {
    const rays = [];

    const raysPerRow = Math.floor(Math.sqrt(this.rayCount));
    const numRows = Math.ceil(this.rayCount / raysPerRow);
    const verticalFOV = this.visionAngle * 0.75;

    for (let row = 0; row < numRows; row++) {
      const pitchAngle = (row / (numRows - 1) - 0.5) * verticalFOV;

      for (let col = 0; col < raysPerRow; col++) {
        if (rays.length >= this.rayCount) break;

        const yawOffset = (col / (raysPerRow - 1) - 0.5) * this.visionAngle;
        const rayAngle = yawOffset + observer.yaw;

        // ✅ FIX 1: Flipped the direction to match the NPC's coordinate system (-Z forward).
        const direction = {
          x: -Math.sin(rayAngle) * Math.cos(pitchAngle),
          y: Math.sin(pitchAngle),
          z: -Math.cos(rayAngle) * Math.cos(pitchAngle),
        };

        const rayResult = this.castSingleRay(
          observer,
          direction,
          allNPCs,
          visibleNPCs
        );

        rays.push(rayResult);
      }
    }

    return rays;
  }

  castSingleRay(observer, direction, allNPCs, visibleNPCs) {
    const startPos = {
      x: observer.position.x,
      y: observer.position.y + 1.6,
      z: observer.position.z,
    };

    let closestHit = {
      hit: false,
      distance: this.visionRange,
      isPlayer: false,
      blockType: 0,
      direction: direction,
      hitNPC: null,
    };

    for (const visibleNPC of visibleNPCs) {
      const toNPC = {
        x: visibleNPC.position.x - observer.position.x,
        y: visibleNPC.position.y - observer.position.y,
        z: visibleNPC.position.z - observer.position.z,
      };

      const dotProduct =
        direction.x * toNPC.x + direction.y * toNPC.y + direction.z * toNPC.z;

      const distanceToNPC = Math.sqrt(
        toNPC.x * toNPC.x + toNPC.y * toNPC.y + toNPC.z * toNPC.z
      );

      if (dotProduct > 0 && distanceToNPC < closestHit.distance) {
        const angleDiff = Math.acos(
          Math.max(-1, Math.min(1, dotProduct / distanceToNPC))
        );

        if (angleDiff < this.rayPrecisionAngle) {
          closestHit = {
            hit: true,
            distance: distanceToNPC,
            isPlayer: true,
            blockType: 0,
            direction: direction,
            hitNPC: { id: visibleNPC.id, role: visibleNPC.role },
          };
        }
      }
    }

    const blockHit = this.raycastForBlock(
      startPos,
      direction,
      closestHit.distance
    );

    if (blockHit && blockHit.distance < closestHit.distance) {
      return {
        hit: true,
        distance: blockHit.distance,
        isPlayer: false,
        blockType: blockHit.blockType,
        direction: direction,
        hitNPC: null,
      };
    }

    return closestHit;
  }

  raycastForBlock(startPos, direction, maxDistance) {
    if (!this.chunkManager) return null;

    let gridX = Math.floor(startPos.x);
    let gridY = Math.floor(startPos.y);
    let gridZ = Math.floor(startPos.z);

    const stepX = direction.x >= 0 ? 1 : -1;
    const stepY = direction.y >= 0 ? 1 : -1;
    const stepZ = direction.z >= 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / direction.x) || Infinity;
    const tDeltaY = Math.abs(1 / direction.y) || Infinity;
    const tDeltaZ = Math.abs(1 / direction.z) || Infinity;

    const xOffset =
      direction.x >= 0
        ? 1 - (startPos.x - Math.floor(startPos.x))
        : startPos.x - Math.floor(startPos.x);
    const yOffset =
      direction.y >= 0
        ? 1 - (startPos.y - Math.floor(startPos.y))
        : startPos.y - Math.floor(startPos.y);
    const zOffset =
      direction.z >= 0
        ? 1 - (startPos.z - Math.floor(startPos.z))
        : startPos.z - Math.floor(startPos.z);

    let tMaxX = direction.x !== 0 ? tDeltaX * xOffset : Infinity;
    let tMaxY = direction.y !== 0 ? tDeltaY * yOffset : Infinity;
    let tMaxZ = direction.z !== 0 ? tDeltaZ * zOffset : Infinity;

    let distance = 0;

    while (distance <= maxDistance) {
      const block = this.getBlockAt(gridX, gridY, gridZ);

      if (block && block.blockType !== 0) {
        return {
          distance: distance,
          blockType: block.blockType,
          position: { x: gridX, y: gridY, z: gridZ },
        };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        distance = tMaxX;
        tMaxX += tDeltaX;
        gridX += stepX;
      } else if (tMaxY < tMaxZ) {
        distance = tMaxY;
        tMaxY += tDeltaY;
        gridY += stepY;
      } else {
        distance = tMaxZ;
        tMaxZ += tDeltaZ;
        gridZ += stepZ;
      }
    }

    return null;
  }

  getDirectionName(yaw) {
    const directions = [
      "North",
      "NE",
      "East",
      "SE",
      "South",
      "SW",
      "West",
      "NW",
    ];
    const index = Math.floor(((yaw + Math.PI) / (2 * Math.PI)) * 8) % 8;
    return directions[index];
  }

  logVisionState(observer, visionData) {
    if (!this.debug) return;

    const dirName = this.getDirectionName(observer.yaw);

    if (visionData.visibleNPCs.length > 0) {
      const targets = visionData.visibleNPCs
        .map((n) => `${n.id}(${n.role}) at ${n.distance.toFixed(1)}u`)
        .join(", ");

      console.log(
        `👁️ ${observer.userData.id} (${observer.role}) facing ${dirName} sees: ${targets}`
      );
    }

    const blockHits = visionData.raycastData.rays.filter(
      (r) => r.hit && !r.isPlayer
    ).length;
    const npcHits = visionData.raycastData.rays.filter(
      (r) => r.hit && r.isPlayer
    ).length;

    if (blockHits > 0 || npcHits > 0) {
      console.log(`   Rays: ${blockHits} blocks, ${npcHits} NPCs`);
    }
  }

  drawDebugRays(observer, visionData, scene) {
    const npcId = observer.userData.id;

    if (this.debugLines.has(npcId)) {
      this.debugLines.get(npcId).forEach((line) => scene.remove(line));
      this.debugLines.set(npcId, []);
    }

    const newLines = [];
    const startPos = new THREE.Vector3(
      observer.position.x,
      observer.position.y + 1,
      observer.position.z
    );

    visionData.raycastData.rays.forEach((ray) => {
      const endPos = new THREE.Vector3(
        startPos.x + ray.direction.x * ray.distance,
        startPos.y + ray.direction.y * ray.distance,
        startPos.z + ray.direction.z * ray.distance
      );

      const color = ray.isPlayer ? 0x00ff00 : ray.hit ? 0xff0000 : 0x444444;

      const geometry = new THREE.BufferGeometry().setFromPoints([
        startPos,
        endPos,
      ]);
      const material = new THREE.LineBasicMaterial({ color });
      const line = new THREE.Line(geometry, material);

      scene.add(line);
      newLines.push(line);
    });
    this.debugLines.set(npcId, newLines);
  }
}

export default NPCVisionSystem;
