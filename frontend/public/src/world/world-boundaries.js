// ==============================================================
// FILE: /src/world/world-boundaries.js
// ==============================================================

import * as GameState from "../../../../src/core/game-state.js";

export class WorldBoundarySystem {
  constructor(scene, worldConfig) {
    this.scene = scene;
    this.worldConfig = worldConfig;
    this.boundaryBlocks = new Map(); // Store boundary block positions
    this.initialized = false;

    // Boundary configuration
    this.BOUNDARY_HEIGHT = 999; // How tall the invisible walls should be
    this.BOUNDARY_THICKNESS = 0; // How thick the boundary wall is
    this.BOUNDARY_BLOCK_TYPE = 999; // Special block type for boundaries

    console.log(
      "WorldBoundarySystem initialized for world size:",
      worldConfig.SIZE
    );
  }

  /**
   * Initialize the boundary system
   */
  initialize() {
    if (this.initialized) return;

    this.createBoundaryBlocks();
    this.initialized = true;
    console.log("World boundaries created successfully");
  }

  /**
   * Create invisible boundary blocks around the world perimeter
   */
  createBoundaryBlocks() {
    const worldSize = this.worldConfig.SIZE;
    const minX = 0 - this.BOUNDARY_THICKNESS;
    const maxX = (worldSize - 1) + this.BOUNDARY_THICKNESS;
    const minZ = 0 - this.BOUNDARY_THICKNESS;
    const maxZ = (worldSize - 1) + this.BOUNDARY_THICKNESS;

    // Create boundary walls on all four sides
    for (let y = 0; y < this.BOUNDARY_HEIGHT; y++) {
      // North wall (min Z)
      for (let x = minX; x <= maxX; x++) {
        for (
          let thickness = 0;
          thickness < this.BOUNDARY_THICKNESS;
          thickness++
        ) {
          const z = minZ + thickness;
          this.addBoundaryBlock(x, y, z);
        }
      }

      // South wall (max Z)
      for (let x = minX; x <= maxX; x++) {
        for (
          let thickness = 0;
          thickness < this.BOUNDARY_THICKNESS;
          thickness++
        ) {
          const z = maxZ - thickness;
          this.addBoundaryBlock(x, y, z);
        }
      }

      // West wall (min X)
      for (let z = minZ; z <= maxZ; z++) {
        for (
          let thickness = 0;
          thickness < this.BOUNDARY_THICKNESS;
          thickness++
        ) {
          const x = minX + thickness;
          this.addBoundaryBlock(x, y, z);
        }
      }

      // East wall (max X)
      for (let z = minZ; z <= maxZ; z++) {
        for (
          let thickness = 0;
          thickness < this.BOUNDARY_THICKNESS;
          thickness++
        ) {
          const x = maxX - thickness;
          this.addBoundaryBlock(x, y, z);
        }
      }
    }

    console.log(`Created ${this.boundaryBlocks.size} boundary blocks`);
  }

  /**
   * Add a boundary block at the specified position
   */
  addBoundaryBlock(x, y, z) {
    const key = `${x},${y},${z}`;
    this.boundaryBlocks.set(key, {
      x,
      y,
      z,
      blockType: this.BOUNDARY_BLOCK_TYPE,
      isVisible: false, // Invisible boundaries
    });
  }

  /**
   * Check if a position contains a boundary block
   */
  isBoundaryBlock(x, y, z) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    return this.boundaryBlocks.has(key);
  }

  /**
   * Get the block type at a position, including boundary blocks
   * This extends the normal block checking to include our invisible boundaries
   */
  getBlockTypeWithBoundaries(x, y, z) {
    // First check if it's a boundary block
    if (this.isBoundaryBlock(x, y, z)) {
      return this.BOUNDARY_BLOCK_TYPE;
    }

    // Otherwise, get the normal block type
    try {
      return GameState.getBlockType(x, y, z);
    } catch (e) {
      // If we can't get the block type, assume it's air
      return 0;
    }
  }

  /**
   * Check if an entity is trying to move outside the world boundaries
   */
  isPositionOutOfBounds(position) {
    const worldSize = this.worldConfig.SIZE;

    return (
      position.x < 0 ||
      position.x > (worldSize - 1) ||
      position.z < 0 ||
      position.z > (worldSize - 1) ||
      position.y < -10 || // Also prevent falling too far below ground
      position.y > this.BOUNDARY_HEIGHT
    );
  }

  /**
   * Clamp a position to stay within world boundaries
   */
  clampPositionToBounds(position) {
    const worldSize = this.worldConfig.SIZE;
    const buffer = 1; // Small buffer to keep entities inside

    const clampedPosition = position.clone();

    clampedPosition.x = Math.max(
      0 + buffer,
      Math.min((worldSize - 1) - buffer, clampedPosition.x)
    );
    clampedPosition.z = Math.max(
      0 + buffer,
      Math.min((worldSize - 1) - buffer, clampedPosition.z)
    );
    clampedPosition.y = Math.max(
      0,
      Math.min(this.BOUNDARY_HEIGHT - 10, clampedPosition.y)
    );

    return clampedPosition;
  }

  /**
   * Create visual debug markers for boundaries (optional)
   */
  createDebugVisualization() {
    const worldSize = this.worldConfig.SIZE;

    // Create wireframe boxes to show boundary areas
    const geometry = new THREE.BoxGeometry(
      worldSize + this.BOUNDARY_THICKNESS * 2,
      this.BOUNDARY_HEIGHT,
      worldSize + this.BOUNDARY_THICKNESS * 2
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });

    const boundaryMesh = new THREE.Mesh(geometry, material);
    boundaryMesh.position.set(worldSize / 2, this.BOUNDARY_HEIGHT / 2, worldSize / 2);
    boundaryMesh.name = "worldBoundaryDebug";

    this.scene.add(boundaryMesh);
    console.log("Debug boundary visualization created");
  }

  /**
   * Remove debug visualization
   */
  removeDebugVisualization() {
    const debugMesh = this.scene.getObjectByName("worldBoundaryDebug");
    if (debugMesh) {
      this.scene.remove(debugMesh);
    }
  }

  /**
   * Clean up the boundary system
   */
  destroy() {
    this.boundaryBlocks.clear();
    this.removeDebugVisualization();
    this.initialized = false;
  }
}

// Export the boundary system
export default WorldBoundarySystem;