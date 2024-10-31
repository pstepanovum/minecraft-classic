import { CLIENT_WORLD_CONFIG, camera, scene, chunkManager, chunkWorker, socket, isOnline } from '../script.js';
import { Inventory } from '../player/inventory.js';

class BlockHighlighter {
    constructor(scene) {
        // Create two geometries: one for wireframe and one for the transparent cube
        const wireframeGeometry = new THREE.BoxGeometry(1.001, 1.001, 1.001);
        const cubeGeometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        const edges = new THREE.EdgesGeometry(wireframeGeometry);
        
        // Create materials
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000, // Changed to darker color
            linewidth: 1,
            transparent: true,
            opacity: 0.6
        });
        
        const cubeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, // Changed to darker color
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        
        // Create meshes
        this.wireframeMesh = new THREE.LineSegments(edges, wireframeMaterial);
        this.cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
        
        // Create a group to hold both meshes
        this.highlightGroup = new THREE.Group();
        this.highlightGroup.add(this.wireframeMesh);
        this.highlightGroup.add(this.cubeMesh);
        this.highlightGroup.visible = false;
        
        // Add to scene
        scene.add(this.highlightGroup);
    }

    update(raycastResult) {
        if (raycastResult && raycastResult.position) {
            // Update position and make visible
            this.highlightGroup.position.copy(raycastResult.position);
            this.highlightGroup.visible = true;
        } else {
            // Hide if no block is targeted
            this.highlightGroup.visible = false;
        }
    }

    setColor(color) {
        if (this.wireframeMesh.material) {
            this.wireframeMesh.material.color.set(color);
        }
        if (this.cubeMesh.material) {
            this.cubeMesh.material.color.set(color);
        }
    }

    setOpacity(opacity) {
        if (this.wireframeMesh.material) {
            this.wireframeMesh.material.opacity = opacity * 0.8; // Wireframe slightly more visible
        }
        if (this.cubeMesh.material) {
            this.cubeMesh.material.opacity = opacity * 0.15; // Keep cube very transparent
        }
    }

    dispose() {
        if (this.wireframeMesh) {
            if (this.wireframeMesh.geometry) {
                this.wireframeMesh.geometry.dispose();
            }
            if (this.wireframeMesh.material) {
                this.wireframeMesh.material.dispose();
            }
        }
        if (this.cubeMesh) {
            if (this.cubeMesh.geometry) {
                this.cubeMesh.geometry.dispose();
            }
            if (this.cubeMesh.material) {
                this.cubeMesh.material.dispose();
            }
        }
        this.highlightGroup.parent?.remove(this.highlightGroup);
    }
}

class BlockInteractionManager {
    constructor() {
        // Existing properties
        this.camera = camera;
        this.maxDistance = 5;
        this.EPSILON = 1e-12;
        this.player = null;
        
        this.vectors = {
            direction: new THREE.Vector3(),
            position: new THREE.Vector3(),
            gridPos: new THREE.Vector3(),
            step: new THREE.Vector3(),
            normal: new THREE.Vector3(),
            lastAir: new THREE.Vector3(),
            delta: new THREE.Vector3(),
            tMax: new THREE.Vector3()
        };
        
        this.inventory = new Inventory();
        
        // Add properties for continuous placement
        this.isRightMouseDown = false;
        this.isLeftMouseDown = false;
        this.lastPlaceTime = 0;
        this.placeInterval = 250; // Minimum time (ms) between block placements
        
        // Bind methods
        this.handleKeyDown = (e) => e.key.toLowerCase() === 'q' && this.tryRemoveBlock();
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);

        this.highlighter = new BlockHighlighter(scene);
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mouseup', this.handleMouseUp);
        document.addEventListener('contextmenu', (e) => {
            document.pointerLockElement === document.querySelector('canvas') && e.preventDefault();
        });
    }

    handleMouseClick(event) {
        if (document.pointerLockElement !== document.querySelector('canvas')) return;
        
        if (event.button === 0) {
            this.tryRemoveBlock();
        } else if (event.button === 2) {
            this.tryPlaceBlock();
        }
    }

    getBlockAt(x, y, z) {
        const size = CLIENT_WORLD_CONFIG.CHUNK_SIZE;
        const chunkX = Math.floor(x / size);
        const chunkY = Math.floor(y / size);
        const chunkZ = Math.floor(z / size);
        
        return {
            blockType: chunkManager.getBlockType(
                chunkX, chunkY, chunkZ,
                ((x % size) + size) % size,
                ((y % size) + size) % size,
                ((z % size) + size) % size
            ),
            chunkCoords: { x: chunkX, y: chunkY, z: chunkZ },
            localCoords: {
                x: ((x % size) + size) % size,
                y: ((y % size) + size) % size,
                z: ((z % size) + size) % size
            }
        };
    }

    castRay() {
        const { direction, position, gridPos, step, normal, lastAir, delta, tMax } = this.vectors;
        
        // Setup initial ray state
        this.camera.getWorldDirection(direction);
        position.copy(this.camera.position);
        gridPos.copy(position).floor();
        
        // Calculate step directions
        step.set(
            Math.abs(direction.x) < this.EPSILON ? 0 : Math.sign(direction.x),
            Math.abs(direction.y) < this.EPSILON ? 0 : Math.sign(direction.y),
            Math.abs(direction.z) < this.EPSILON ? 0 : Math.sign(direction.z)
        );

        // Calculate delta distances
        delta.set(
            Math.abs(direction.x) < this.EPSILON ? Infinity : Math.abs(1 / direction.x),
            Math.abs(direction.y) < this.EPSILON ? Infinity : Math.abs(1 / direction.y),
            Math.abs(direction.z) < this.EPSILON ? Infinity : Math.abs(1 / direction.z)
        );

        // Calculate initial tMax values
        tMax.set(
            this.getTMax(position.x, direction.x, delta.x),
            this.getTMax(position.y, direction.y, delta.y),
            this.getTMax(position.z, direction.z, delta.z)
        );

        let distance = 0;
        normal.set(0, 0, 0);
        lastAir.copy(gridPos);

        // DDA loop
        while (distance <= this.maxDistance) {
            const block = this.getBlockAt(gridPos.x, gridPos.y, gridPos.z);
            
            if (block.blockType !== 0) {
                return {
                    position: gridPos.clone(),
                    normal: normal.clone(),
                    blockType: block.blockType,
                    distance,
                    chunkCoords: block.chunkCoords,
                    localCoords: block.localCoords,
                    previousPosition: lastAir.clone(),
                    face: this.getFaceFromNormal(normal)
                };
            }
            
            lastAir.copy(gridPos);
            
            // Advance to next block
            if (tMax.x < tMax.y && tMax.x < tMax.z) {
                distance = tMax.x;
                tMax.x += delta.x;
                gridPos.x += step.x;
                normal.set(-step.x, 0, 0);
            } else if (tMax.y < tMax.z) {
                distance = tMax.y;
                tMax.y += delta.y;
                gridPos.y += step.y;
                normal.set(0, -step.y, 0);
            } else {
                distance = tMax.z;
                tMax.z += delta.z;
                gridPos.z += step.z;
                normal.set(0, 0, -step.z);
            }
        }
        
        return null;
    }

    getTMax(pos, dir, delta) {
        if (Math.abs(dir) < this.EPSILON) return Infinity;
        return dir > 0 ? (Math.floor(pos + 1) - pos) * delta : (pos - Math.floor(pos)) * delta;
    }

    getFaceFromNormal(normal) {
        return normal.x !== 0 ? (normal.x > 0 ? 'px' : 'nx') :
               normal.y !== 0 ? (normal.y > 0 ? 'py' : 'ny') :
               normal.z !== 0 ? (normal.z > 0 ? 'pz' : 'nz') : null;
    }

    updateBlock(position, blockType, isRemoval = false) {
        const x = Math.floor(position.x);
        const y = Math.floor(position.y);
        const z = Math.floor(position.z);

        // Update local chunk
        chunkManager?.updateBlock(x, y, z, blockType);

        // Notify server if online
        if (isOnline && socket?.connected) {
            socket.emit('blockUpdate', {
                position: { x, y, z },
                type: isRemoval ? 'remove' : blockType
            });
        }
    }

    tryRemoveBlock() {
        const hit = this.castRay();
        if (!hit) return;

        const { position, blockType } = hit;
        
        // Update inventory
        const slot = this.inventory.hotbar.findIndex(s => s.blockType === blockType);
        if (slot !== -1 && this.inventory.hotbar[slot].count < 64) {
            this.inventory.updateSlot(slot, blockType, this.inventory.hotbar[slot].count + 1);
        }

        this.updateBlock(position, 0, true);
    }

    tryPlaceBlock() {
        const hit = this.castRay();
        if (!hit) return;

        const currentSlot = this.inventory.hotbar[this.inventory.selectedSlot];
        if (!currentSlot?.count) return;

        const placePos = hit.position.clone().add(hit.normal);
        
        // Check if the new block would intersect with the player
        const playerBox = new THREE.Box3();
        const blockBox = new THREE.Box3();
        
        playerBox.setFromCenterAndSize(
            this.player.position,
            new THREE.Vector3(0.6, 1.6, 0.6)
        );
        
        blockBox.setFromCenterAndSize(
            placePos,
            new THREE.Vector3(1, 1, 1)
        );
        
        if (playerBox.intersectsBox(blockBox)) {
            return;
        }

        // Update inventory
        this.inventory.updateSlot(
            this.inventory.selectedSlot, 
            currentSlot.blockType, 
            currentSlot.count - 1
        );

        this.updateBlock(placePos, currentSlot.blockType);
        this.lastPlaceTime = Date.now(); // Update last place time
    }

    update() {
        const raycastResult = this.castRay();
        
        // Update highlighter
        this.highlighter.update(raycastResult);
        
        // Handle continuous block placement
        if (this.isRightMouseDown && Date.now() - this.lastPlaceTime >= this.placeInterval) {
            this.tryPlaceBlock();
        }
        if (this.isLeftMouseDown && Date.now() - this.lastPlaceTime >= this.placeInterval) {
            this.tryRemoveBlock();
        }
        
        if (raycastResult) {
            if (!this.lastTargetBlock || 
                !raycastResult.position.equals(this.lastTargetBlock.position)) {
                this.lastTargetBlock = raycastResult;
            }
        } else {
            this.lastTargetBlock = null;
        }
    }

    handleMouseUp(event) {
        if (event.button === 2) {
            this.isRightMouseDown = false;
        }
        if (event.button === 0) {
            this.isLeftMouseDown = false;  // Fixed: now correctly handles left mouse button
        }
    }

    handleMouseDown(event) {
        if (document.pointerLockElement !== document.querySelector('canvas')) return;
        
        if (event.button === 0) {
            this.isLeftMouseDown = true;
            this.tryRemoveBlock();
        } else if (event.button === 2) {
            this.isRightMouseDown = true;
            this.tryPlaceBlock();
        }
    }

    dispose() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mouseup', this.handleMouseUp);
        this.highlighter.dispose();
    }

}

export function initializeBlockInteractions(player) {
    const manager = new BlockInteractionManager();
    manager.player = player;  // Set the player reference
    return manager;
}

export function handleBlockUpdate(data) {
    if (data.playerId === socket?.id) return;
    
    const { position, type } = data;
    const blockType = type === 'remove' ? 0 : type;
    const size = CLIENT_WORLD_CONFIG.CHUNK_SIZE;
    
    chunkWorker?.postMessage({
        type: 'updateBlock',
        chunkX: Math.floor(position.x / size),
        chunkY: Math.floor(position.y / size),
        chunkZ: Math.floor(position.z / size),
        localX: ((position.x % size) + size) % size,
        localY: ((position.y % size) + size) % size,
        localZ: ((position.z % size) + size) % size,
        blockType
    });
}