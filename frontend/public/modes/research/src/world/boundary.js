// ==============================================================
// FILE: frontend/public/modes/research/src/world/boundary.js
// ==============================================================

import WorldBoundarySystem from "../../../../src/world/world-boundaries.js";

/**
 * Research Mode Visible Boundary Walls
 * Creates visible and solid barriers that NPCs cannot pass through
 * Supports three display modes: solid, wireframe, and hidden
 * Uses THREE.js meshes for clear visualization during development/testing
 */
export class ResearchBoundaryWalls extends WorldBoundarySystem {
  constructor(scene, worldConfig) {
    super(scene, worldConfig);

    // Research-specific configuration
    this.BOUNDARY_HEIGHT = worldConfig.MAX_HEIGHT || 256;
    this.BOUNDARY_THICKNESS = 2;
    this.BOUNDARY_BLOCK_TYPE = 9999;
    this.WALL_BUFFER = 0;

    // Initialize boundary blocks Map for collision detection
    this.boundaryBlocks = new Map();

    // Visual properties
    this.WALL_OPACITY = 0.3;
    this.WALL_COLORS = {
      north: 0xff4444, // Red
      south: 0x44ff44, // Green
      west: 0x4444ff, // Blue
      east: 0xffff44, // Yellow
    };

    // Mesh storage
    this.boundaryMeshes = new Map(); // Solid meshes
    this.wireframeMeshes = new Map(); // Wireframe meshes
    this.boundaryGroup = null;
    this.initialized = false;

    // Display state: 0 = hidden, 1 = solid, 2 = wireframe
    this.displayState = 1;

    console.log("Research Mode Visible Boundary Walls initialized");
  }

  /**
   * Create visible boundary wall meshes around the world perimeter
   */
  createBoundaryMeshes() {
    this.removeBoundaryMeshes(); // Clean up existing

    const worldSize = this.worldConfig.SIZE;
    const wallHeight = this.BOUNDARY_HEIGHT;
    const halfThickness = this.BOUNDARY_THICKNESS / 2;

    // Create boundary group
    this.boundaryGroup = new THREE.Group();
    this.boundaryGroup.name = "researchBoundaryWalls";

    // Wall configurations
    const wallConfigs = [
      {
        name: "north",
        position: [
          worldSize / 2,
          wallHeight / 2,
          -halfThickness - this.WALL_BUFFER,
        ],
        size: [
          worldSize + this.BOUNDARY_THICKNESS * 2,
          wallHeight,
          this.BOUNDARY_THICKNESS,
        ],
        color: this.WALL_COLORS.north,
      },
      {
        name: "south",
        position: [
          worldSize / 2,
          wallHeight / 2,
          worldSize + halfThickness + this.WALL_BUFFER,
        ],
        size: [
          worldSize + this.BOUNDARY_THICKNESS * 2,
          wallHeight,
          this.BOUNDARY_THICKNESS,
        ],
        color: this.WALL_COLORS.south,
      },
      {
        name: "west",
        position: [
          -halfThickness - this.WALL_BUFFER,
          wallHeight / 2,
          worldSize / 2,
        ],
        size: [
          this.BOUNDARY_THICKNESS,
          wallHeight,
          worldSize + this.BOUNDARY_THICKNESS * 2,
        ],
        color: this.WALL_COLORS.west,
      },
      {
        name: "east",
        position: [
          worldSize + halfThickness + this.WALL_BUFFER,
          wallHeight / 2,
          worldSize / 2,
        ],
        size: [
          this.BOUNDARY_THICKNESS,
          wallHeight,
          worldSize + this.BOUNDARY_THICKNESS * 2,
        ],
        color: this.WALL_COLORS.east,
      },
    ];

    // Create each wall (solid + wireframe)
    wallConfigs.forEach((config) => {
      const solidMesh = this.createSingleWallMesh(config, "solid");
      const wireframeMesh = this.createSingleWallMesh(config, "wireframe");

      this.boundaryMeshes.set(config.name, solidMesh);
      this.wireframeMeshes.set(config.name, wireframeMesh);

      this.boundaryGroup.add(solidMesh);
      this.boundaryGroup.add(wireframeMesh);

      // Populate collision data
      this.populateBlockDataForWall(config);
    });

    // Set initial display state
    this.updateDisplayState();

    // Add to scene
    this.scene.add(this.boundaryGroup);

    console.log(
      `Created ${wallConfigs.length} boundary walls with solid/wireframe variants`
    );
  }

  /**
   * Create a single wall mesh (solid or wireframe)
   */
  createSingleWallMesh(config, type = "solid") {
    const geometry = new THREE.BoxGeometry(...config.size);
    let mesh;

    if (type === "wireframe") {
      const wireframeGeometry = new THREE.EdgesGeometry(geometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: config.color,
        linewidth: 2,
        transparent: true,
        opacity: 0.8,
      });

      mesh = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      mesh.name = `boundary_wireframe_${config.name}`;
      mesh.userData.wireframeGeometry = wireframeGeometry;
    } else {
      const material = new THREE.MeshLambertMaterial({
        color: config.color,
        transparent: true,
        opacity: this.WALL_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
      });

      mesh = new THREE.Mesh(geometry, material);
      mesh.name = `boundary_wall_${config.name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    mesh.position.set(...config.position);
    mesh.userData = {
      ...mesh.userData,
      wallSide: config.name,
      isBoundaryWall: true,
      meshType: type,
      boundingBox: new THREE.Box3().setFromObject(mesh),
    };

    return mesh;
  }

  /**
   * Populate block data for collision detection
   */
  populateBlockDataForWall(config) {
    const [centerX, centerY, centerZ] = config.position;
    const [sizeX, sizeY, sizeZ] = config.size;

    const minX = Math.floor(centerX - sizeX / 2);
    const maxX = Math.ceil(centerX + sizeX / 2);
    const minY = Math.floor(centerY - sizeY / 2);
    const maxY = Math.ceil(centerY + sizeY / 2);
    const minZ = Math.floor(centerZ - sizeZ / 2);
    const maxZ = Math.ceil(centerZ + sizeZ / 2);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          this.addBoundaryBlock(x, y, z, config.name);
        }
      }
    }
  }

  /**
   * Add boundary block for collision
   */
  addBoundaryBlock(x, y, z, wallSide = "unknown") {
    const key = `${x},${y},${z}`;
    this.boundaryBlocks.set(key, {
      x,
      y,
      z,
      blockType: this.BOUNDARY_BLOCK_TYPE,
      isVisible: true,
      isSolid: true,
      wallSide: wallSide,
    });
  }

  /**
   * Check if a block is a boundary block
   */
  isBoundaryBlock(x, y, z) {
    if (!this.boundaryBlocks) return false;
    const key = `${x},${y},${z}`;
    return this.boundaryBlocks.has(key);
  }

  /**
   * Toggle display state: solid → wireframe → hidden → solid
   */
  toggleDisplayState() {
    this.displayState = (this.displayState + 1) % 3;
    this.updateDisplayState();

    const stateNames = ["hidden", "solid", "wireframe"];
    console.log(
      `Boundary walls display state: ${stateNames[this.displayState]}`
    );

    return this.displayState;
  }

  /**
   * Set specific display state
   */
  setDisplayState(state) {
    if (state >= 0 && state <= 2) {
      this.displayState = state;
      this.updateDisplayState();

      const stateNames = ["hidden", "solid", "wireframe"];
      console.log(
        `Boundary walls display state set to: ${stateNames[this.displayState]}`
      );
    }
  }

  /**
   * Update mesh visibility based on display state
   */
  updateDisplayState() {
    if (!this.boundaryGroup) return;

    if (this.displayState === 0) {
      this.boundaryGroup.visible = false;
      return;
    }

    this.boundaryGroup.visible = true;

    // Show appropriate mesh type
    this.boundaryMeshes.forEach((solidMesh) => {
      solidMesh.visible = this.displayState === 1;
    });

    this.wireframeMeshes.forEach((wireframeMesh) => {
      wireframeMesh.visible = this.displayState === 2;
    });
  }

  /**
   * Get current display state
   */
  getDisplayState() {
    return this.displayState;
  }

  /**
   * Check if boundaries are visible
   */
  isVisible() {
    return this.displayState > 0;
  }

  /**
   * Mesh-based collision detection
   */
  checkMeshBoundaryCollision(
    position,
    entitySize = { width: 0.6, height: 1.8 }
  ) {
    if (!this.boundaryGroup) return { collides: false, boundaryWall: false };

    const entityBox = new THREE.Box3(
      new THREE.Vector3(
        position.x - entitySize.width / 2,
        position.y - entitySize.height / 2,
        position.z - entitySize.width / 2
      ),
      new THREE.Vector3(
        position.x + entitySize.width / 2,
        position.y + entitySize.height / 2,
        position.z + entitySize.width / 2
      )
    );

    for (const [wallName, mesh] of this.boundaryMeshes) {
      const meshBox = mesh.userData.boundingBox;

      if (entityBox.intersectsBox(meshBox)) {
        return {
          collides: true,
          boundaryWall: true,
          wallSide: wallName,
          mesh: mesh,
          position: position,
        };
      }
    }

    return this.checkResearchBoundaryCollision(position, entitySize);
  }

  /**
   * Traditional block-based collision detection
   */
  checkResearchBoundaryCollision(
    position,
    entitySize = { width: 0.6, height: 1.8 }
  ) {
    const halfWidth = entitySize.width / 2;
    const halfHeight = entitySize.height / 2;

    const minX = Math.floor(position.x - halfWidth);
    const maxX = Math.ceil(position.x + halfWidth);
    const minY = Math.floor(position.y - halfHeight);
    const maxY = Math.ceil(position.y + halfHeight);
    const minZ = Math.floor(position.z - halfWidth);
    const maxZ = Math.ceil(position.z + halfWidth);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isBoundaryBlock(x, y, z)) {
            return {
              collides: true,
              boundaryBlock: true,
              position: { x, y, z },
              wallSide:
                this.boundaryBlocks.get(`${x},${y},${z}`)?.wallSide ||
                "unknown",
            };
          }
        }
      }
    }

    return { collides: false, boundaryBlock: false };
  }

  /**
   * Correct movement for mesh boundaries
   */
  correctMovementForMeshBoundary(
    oldPosition,
    newPosition,
    entitySize = { width: 0.6, height: 1.8 }
  ) {
    const collision = this.checkMeshBoundaryCollision(newPosition, entitySize);

    if (!collision.collides) {
      return newPosition;
    }

    const correctedPosition = oldPosition.clone();
    const worldSize = this.worldConfig.SIZE;

    switch (collision.wallSide) {
      case "north":
        correctedPosition.x = newPosition.x;
        correctedPosition.y = newPosition.y;
        correctedPosition.z = Math.max(oldPosition.z, entitySize.width / 2 + 1);
        break;
      case "south":
        correctedPosition.x = newPosition.x;
        correctedPosition.y = newPosition.y;
        correctedPosition.z = Math.min(
          oldPosition.z,
          worldSize - entitySize.width / 2 - 1
        );
        break;
      case "west":
        correctedPosition.x = Math.max(oldPosition.x, entitySize.width / 2 + 1);
        correctedPosition.y = newPosition.y;
        correctedPosition.z = newPosition.z;
        break;
      case "east":
        correctedPosition.x = Math.min(
          oldPosition.x,
          worldSize - entitySize.width / 2 - 1
        );
        correctedPosition.y = newPosition.y;
        correctedPosition.z = newPosition.z;
        break;
      default:
        return this.correctMovementForBoundary(
          oldPosition,
          newPosition,
          entitySize
        );
    }

    return correctedPosition;
  }

  /**
   * Get movement correction (backward compatibility)
   */
  correctMovementForBoundary(
    oldPosition,
    newPosition,
    entitySize = { width: 0.6, height: 1.8 }
  ) {
    const collision = this.checkResearchBoundaryCollision(
      newPosition,
      entitySize
    );

    if (!collision.collides) {
      return newPosition;
    }

    const correctedPosition = oldPosition.clone();

    // Test X movement only
    const testX = new THREE.Vector3(
      newPosition.x,
      oldPosition.y,
      oldPosition.z
    );
    if (!this.checkResearchBoundaryCollision(testX, entitySize).collides) {
      correctedPosition.x = newPosition.x;
    }

    // Test Y movement only
    const testY = new THREE.Vector3(
      correctedPosition.x,
      newPosition.y,
      oldPosition.z
    );
    if (!this.checkResearchBoundaryCollision(testY, entitySize).collides) {
      correctedPosition.y = newPosition.y;
    }

    // Test Z movement only
    const testZ = new THREE.Vector3(
      correctedPosition.x,
      correctedPosition.y,
      newPosition.z
    );
    if (!this.checkResearchBoundaryCollision(testZ, entitySize).collides) {
      correctedPosition.z = newPosition.z;
    }

    return correctedPosition;
  }

  /**
   * Enforce NPC containment (main method)
   */
  enforceNPCContainment(npc) {
    return this.enforceNPCContainmentWithMeshes(npc);
  }

  /**
   * Enhanced NPC containment with mesh-aware boundaries
   */
  enforceNPCContainmentWithMeshes(npc) {
    if (!npc || !npc.position) return false;

    const position = npc.position;
    const worldSize = this.worldConfig.SIZE;
    const buffer = this.BOUNDARY_THICKNESS - 2;
    const minBound = buffer;
    const maxBound = worldSize - buffer;

    let wasContained = false;

    // Check and correct X boundary
    if (position.x < minBound) {
      position.x = minBound;
      if (npc.velocity) npc.velocity.x = Math.abs(npc.velocity.x) * 0.5;
      wasContained = true;
    } else if (position.x > maxBound) {
      position.x = maxBound;
      if (npc.velocity) npc.velocity.x = -Math.abs(npc.velocity.x) * 0.5;
      wasContained = true;
    }

    // Check and correct Z boundary
    if (position.z < minBound) {
      position.z = minBound;
      if (npc.velocity) npc.velocity.z = Math.abs(npc.velocity.z) * 0.5;
      wasContained = true;
    } else if (position.z > maxBound) {
      position.z = maxBound;
      if (npc.velocity) npc.velocity.z = -Math.abs(npc.velocity.z) * 0.5;
      wasContained = true;
    }

    // Check and correct Y boundary
    if (position.y < 0) {
      position.y = 1;
      if (npc.velocity) npc.velocity.y = 0;
      wasContained = true;
    } else if (position.y > this.BOUNDARY_HEIGHT - 10) {
      position.y = this.BOUNDARY_HEIGHT - 10;
      if (npc.velocity) npc.velocity.y = 0;
      wasContained = true;
    }

    if (wasContained) {
      console.log(
        `NPC contained by boundary walls at (${position.x.toFixed(
          2
        )}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`
      );
    }

    return wasContained;
  }

  /**
   * Update wall appearance
   */
  updateWallAppearance(wallName, properties = {}) {
    const solidMesh = this.boundaryMeshes.get(wallName);
    const wireframeMesh = this.wireframeMeshes.get(wallName);

    if (!solidMesh || !wireframeMesh) return;

    if (properties.color !== undefined) {
      solidMesh.material.color.setHex(properties.color);
      wireframeMesh.material.color.setHex(properties.color);
    }

    if (properties.opacity !== undefined) {
      solidMesh.material.opacity = properties.opacity;
      wireframeMesh.material.opacity = Math.min(properties.opacity + 0.2, 1.0);
    }

    if (properties.visible !== undefined) {
      if (this.displayState === 1) {
        solidMesh.visible = properties.visible;
      } else if (this.displayState === 2) {
        wireframeMesh.visible = properties.visible;
      }
    }

    console.log(`Updated ${wallName} wall appearance`);
  }

  /**
   * Get wall mesh by name and type
   */
  getWallMesh(wallName, type = "solid") {
    if (type === "wireframe") {
      return this.wireframeMeshes.get(wallName);
    }
    return this.boundaryMeshes.get(wallName);
  }

  /**
   * Get all wall meshes
   */
  getAllWallMeshes() {
    return {
      solid: Array.from(this.boundaryMeshes.values()),
      wireframe: Array.from(this.wireframeMeshes.values()),
      all: [
        ...Array.from(this.boundaryMeshes.values()),
        ...Array.from(this.wireframeMeshes.values()),
      ],
    };
  }

  /**
   * Clean up resources
   */
  removeBoundaryMeshes() {
    if (this.boundaryGroup) {
      this.boundaryGroup.traverse((child) => {
        if (child.isMesh || child.isLineSegments) {
          if (child.geometry) child.geometry.dispose();
          if (child.userData.wireframeGeometry)
            child.userData.wireframeGeometry.dispose();

          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });

      this.scene.remove(this.boundaryGroup);
      this.boundaryGroup = null;
    }

    this.boundaryMeshes.clear();
    this.wireframeMeshes.clear();

    console.log("Boundary meshes cleaned up");
  }

  /**
   * Initialize the boundary system
   */
  initialize() {
    this.createBoundaryMeshes();
    this.initialized = true;
    console.log("Research boundary walls initialized successfully");
  }

  /**
   * Cleanup method
   */
  dispose() {
    this.removeBoundaryMeshes();
    if (this.boundaryBlocks) {
      this.boundaryBlocks.clear();
    }
  }
}

export default ResearchBoundaryWalls;
