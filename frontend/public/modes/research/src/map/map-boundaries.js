// map-boundaries.js
// Create invisible boundaries for the training world

import { TRAINING_WORLD_CONFIG } from '../config-training-world.js';

// Map boundary settings
export const BOUNDARY_CONFIG = {
    // Use the same size as defined in TRAINING_WORLD_CONFIG
    SIZE: TRAINING_WORLD_CONFIG.SIZE,
    
    // Buffer zone near edges (makes the effective area slightly smaller)
    BOUNDARY_BUFFER: 2,
    
    // How strongly to push entities back when they approach boundaries
    PUSH_STRENGTH: 0.05,
    
    // How far from the boundary to start applying pushing force
    INFLUENCE_DISTANCE: 3,
    
    // Whether to make boundaries completely solid (true) or use a soft push (false)
    SOLID_BOUNDARIES: true,
    
    // Visual debug mode (only for development)
    DEBUG_BOUNDARIES: false
};

/**
 * Check if a position is within the valid map boundaries
 * @param {THREE.Vector3} position - The position to check
 * @returns {boolean} - True if position is within boundaries
 */
export function isWithinBoundaries(position) {
    const minBoundary = -BOUNDARY_CONFIG.SIZE + BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    const maxBoundary = BOUNDARY_CONFIG.SIZE - BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    
    return (
        position.x > minBoundary && 
        position.x < maxBoundary && 
        position.z > minBoundary && 
        position.z < maxBoundary
    );
}

/**
 * Check if a position is near the boundary and should be pushed back
 * @param {THREE.Vector3} position - The position to check
 * @returns {boolean} - True if position is near boundaries
 */
export function isNearBoundary(position) {
    const minBoundary = -BOUNDARY_CONFIG.SIZE + BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    const maxBoundary = BOUNDARY_CONFIG.SIZE - BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    const influenceDistance = BOUNDARY_CONFIG.INFLUENCE_DISTANCE;
    
    return (
        position.x < minBoundary + influenceDistance || 
        position.x > maxBoundary - influenceDistance || 
        position.z < minBoundary + influenceDistance || 
        position.z > maxBoundary - influenceDistance
    );
}

/**
 * Apply boundary constraints to a position
 * @param {THREE.Vector3} position - The position to constrain
 * @returns {THREE.Vector3} - The constrained position
 */
export function applyBoundaryConstraints(position) {
    const minBoundary = -BOUNDARY_CONFIG.SIZE + BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    const maxBoundary = BOUNDARY_CONFIG.SIZE - BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    
    // For solid boundaries, simply clamp the position
    if (BOUNDARY_CONFIG.SOLID_BOUNDARIES) {
        position.x = Math.max(minBoundary, Math.min(maxBoundary, position.x));
        position.z = Math.max(minBoundary, Math.min(maxBoundary, position.z));
        return position;
    }
    
    // For soft boundaries, calculate push force
    const influenceDistance = BOUNDARY_CONFIG.INFLUENCE_DISTANCE;
    const pushStrength = BOUNDARY_CONFIG.PUSH_STRENGTH;
    
    // Check and apply X axis boundary constraints
    if (position.x < minBoundary + influenceDistance) {
        const distance = position.x - minBoundary;
        const force = (influenceDistance - distance) / influenceDistance * pushStrength;
        position.x += force;
    } else if (position.x > maxBoundary - influenceDistance) {
        const distance = maxBoundary - position.x;
        const force = (influenceDistance - distance) / influenceDistance * pushStrength;
        position.x -= force;
    }
    
    // Check and apply Z axis boundary constraints
    if (position.z < minBoundary + influenceDistance) {
        const distance = position.z - minBoundary;
        const force = (influenceDistance - distance) / influenceDistance * pushStrength;
        position.z += force;
    } else if (position.z > maxBoundary - influenceDistance) {
        const distance = maxBoundary - position.z;
        const force = (influenceDistance - distance) / influenceDistance * pushStrength;
        position.z -= force;
    }
    
    return position;
}

/**
 * Create visual boundary markers for debugging (optional)
 * @param {THREE.Scene} scene - The scene to add boundary markers to
 */
export function createBoundaryMarkers(scene) {
    if (!BOUNDARY_CONFIG.DEBUG_BOUNDARIES) return;
    
    const size = BOUNDARY_CONFIG.SIZE;
    const buffer = BOUNDARY_CONFIG.BOUNDARY_BUFFER;
    const effectiveSize = size - buffer;
    
    // Create a wireframe box to represent the boundaries
    const geometry = new THREE.BoxGeometry(
        effectiveSize * 2, 
        50, // Height of boundaries
        effectiveSize * 2
    );
    const material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    
    const boundaryBox = new THREE.Mesh(geometry, material);
    boundaryBox.position.y = 25; // Center vertically
    scene.add(boundaryBox);
    
    return boundaryBox;
}

export default {
    BOUNDARY_CONFIG,
    isWithinBoundaries,
    isNearBoundary,
    applyBoundaryConstraints,
    createBoundaryMarkers
};