import { CLIENT_WORLD_CONFIG, camera, scene, chunkManager, chunkWorker, socket, isOnline } from '../script.js';
import { Inventory } from '../player/inventory.js';


class BlockHighlighter {
    constructor(scene) {
        // Create geometries centered on grid cells
        const wireframeGeometry = new THREE.BoxGeometry(1.001, 1.001, 1.001);
        const cubeGeometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        const edges = new THREE.EdgesGeometry(wireframeGeometry);
        
        // Create materials
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x000000,
            linewidth: 1,
            transparent: true,
            opacity: 0.6,
            depthTest: true,    // Enable depth testing
            depthWrite: false   // Don't write to depth buffer
        });
        
        const cubeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false
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
        
        // Store last position for smooth transitions
        this.lastPosition = new THREE.Vector3();
    }

    update(raycastResult) {
        if (raycastResult && raycastResult.position) {
            // Calculate centered position
            const position = new THREE.Vector3(
                Math.floor(raycastResult.position.x) + 0.5,
                Math.floor(raycastResult.position.y) + 0.5,
                Math.floor(raycastResult.position.z) + 0.5
            );
            
            // Smooth transition to new position
            this.lastPosition.lerp(position, 1.0); // Use 1.0 for instant movement, or lower for smooth transition
            this.highlightGroup.position.copy(this.lastPosition);
            
            // Update visibility
            this.highlightGroup.visible = true;
            
            // Optional: Change color based on face being looked at
            if (raycastResult.hitFace) {
                this.setColorForFace(raycastResult.hitFace);
            }
        } else {
            this.highlightGroup.visible = false;
        }
    }

    setColorForFace(face) {
        // Optional: Different colors for different faces
        const faceColors = {
            'top': 0x00FF00,    // Green for top
            'bottom': 0xFF0000, // Red for bottom
            'north': 0x0000FF,  // Blue for north
            'south': 0xFFFF00,  // Yellow for south
            'east': 0xFF00FF,   // Magenta for east
            'west': 0x00FFFF    // Cyan for west
        };
        
        if (faceColors[face]) {
            this.setColor(faceColors[face]);
        } else {
            this.setColor(0x000000); // Default black
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
            this.wireframeMesh.material.opacity = opacity * 0.8;
        }
        if (this.cubeMesh.material) {
            this.cubeMesh.material.opacity = opacity * 0.15;
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

export class Raycaster {
    constructor() {
        this.maxDistance = 10;
        this.raycaster = new THREE.Raycaster();
        this.vectors = {
            direction: new THREE.Vector3(),
            position: new THREE.Vector3(),
            gridPosition: new THREE.Vector3(),
            normal: new THREE.Vector3()
        };
        this.faceDirections = [
            { normal: [-1, 0, 0], name: 'west' },
            { normal: [1, 0, 0], name: 'east' },
            { normal: [0, -1, 0], name: 'bottom' },
            { normal: [0, 1, 0], name: 'top' },
            { normal: [0, 0, -1], name: 'north' },
            { normal: [0, 0, 1], name: 'south' }
        ];
    }

    getBlockAt(x, y, z, chunkManager) {
        const size = CLIENT_WORLD_CONFIG.CHUNK_SIZE;
        const chunkX = Math.floor(x / size);
        const chunkY = Math.floor(y / size);
        const chunkZ = Math.floor(z / size);
        const localX = ((x % size) + size) % size;
        const localY = ((y % size) + size) % size;
        const localZ = ((z % size) + size) % size;
    
        // Get block type from chunk manager
        const blockType = chunkManager.getBlockType(chunkX, chunkY, chunkZ, localX, localY, localZ);
        
        // Return proper block object structure
        return {
            blockType: blockType,
            chunkCoords: { x: chunkX, y: chunkY, z: chunkZ },
            localCoords: { x: localX, y: localY, z: localZ }
        };
    }
    

    getFaceFromNormal(normal) {
        if (!normal) return 'unknown';

        const hitDirection = this.faceDirections.find(dir => 
            dir.normal[0] === normal.x && 
            dir.normal[1] === normal.y && 
            dir.normal[2] === normal.z
        );
        
        return hitDirection ? hitDirection.name : 'unknown';
    }

    castRay(camera, chunkManager) {
        const { direction, position, gridPosition, normal } = this.vectors;
        
        camera.getWorldDirection(direction);
        position.copy(camera.position);
        gridPosition.copy(position).floor();
        
        const stepX = direction.x >= 0 ? 1 : -1;
        const stepY = direction.y >= 0 ? 1 : -1;
        const stepZ = direction.z >= 0 ? 1 : -1;
        
        const tDeltaX = Math.abs(1 / direction.x) || Infinity;
        const tDeltaY = Math.abs(1 / direction.y) || Infinity;
        const tDeltaZ = Math.abs(1 / direction.z) || Infinity;
        
        const xOffset = direction.x >= 0 ? 1 - (position.x - Math.floor(position.x)) : position.x - Math.floor(position.x);
        const yOffset = direction.y >= 0 ? 1 - (position.y - Math.floor(position.y)) : position.y - Math.floor(position.y);
        const zOffset = direction.z >= 0 ? 1 - (position.z - Math.floor(position.z)) : position.z - Math.floor(position.z);
        
        let tMaxX = direction.x !== 0 ? tDeltaX * xOffset : Infinity;
        let tMaxY = direction.y !== 0 ? tDeltaY * yOffset : Infinity;
        let tMaxZ = direction.z !== 0 ? tDeltaZ * zOffset : Infinity;
        
        let distance = 0;
        let lastNormal = new THREE.Vector3();
        let previousPosition = gridPosition.clone();
        
        while (distance <= this.maxDistance) {
            const block = this.getBlockAt(
                Math.floor(gridPosition.x),
                Math.floor(gridPosition.y),
                Math.floor(gridPosition.z),
                chunkManager
            );
            
            if (block && block.blockType !== 0) {
                const hitDistance = Math.min(tMaxX, tMaxY, tMaxZ);
                const intersectionPoint = position.clone().addScaledVector(direction, hitDistance);
                
                return {
                    position: gridPosition.clone(),
                    normal: lastNormal.clone(),
                    blockType: block.blockType,
                    distance,
                    chunkCoords: block.chunkCoords,
                    localCoords: block.localCoords,
                    previousPosition: previousPosition,
                    intersectionPoint: intersectionPoint,
                    hitFace: this.getFaceFromNormal(lastNormal)
                };
            }
            
            previousPosition.copy(gridPosition);
            
            if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                distance = tMaxX;
                tMaxX += tDeltaX;
                gridPosition.x += stepX;
                lastNormal.set(-stepX, 0, 0);
            } else if (tMaxY < tMaxZ) {
                distance = tMaxY;
                tMaxY += tDeltaY;
                gridPosition.y += stepY;
                lastNormal.set(0, -stepY, 0);
            } else {
                distance = tMaxZ;
                tMaxZ += tDeltaZ;
                gridPosition.z += stepZ;
                lastNormal.set(0, 0, -stepZ);
            }
        }
        
        return null;
    }
}

class BlockInteractionManager {
    constructor() {
        // Existing properties
        this.camera = camera;
        this.player = null;
    
        this.raycaster = new Raycaster();
        this.inventory = new Inventory();
        
        // Add properties for continuous placement
        this.isRightMouseDown = false;
        this.isLeftMouseDown = false;
        this.lastPlaceTime = 0;
        this.placeInterval = 350; // Minimum time (ms) between block placements
        this.initialClickDelay = 350; // Delay before continuous action starts
        this.rightMouseDownTime = 0;
        this.leftMouseDownTime = 0;
        
        // Bind methods
        this.handleKeyDown = (e) => e.key.toLowerCase() === 'q' && this.tryRemoveBlock();
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);

        this.highlighter = new BlockHighlighter(scene);
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('mousedown', this.handleMouseDown);
        document.addEventListener('mouseup', this.handleMouseUp);
        document.addEventListener('touchstart', this.handleTouchStart);
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

    handleTouchStart(event) {
        if (event.touches.length === 1) {
            this.tryRemoveBlock();
        }
    }

    castRay() {
        return this.raycaster.castRay(this.camera, chunkManager);
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
        
        // First check the currently selected hotbar slot
        const currentSlot = this.inventory.hotbar[this.inventory.selectedSlot];
        if (currentSlot && 
            (currentSlot.blockType === blockType || !currentSlot.blockType || currentSlot.count === 0) && 
            (!currentSlot.count || currentSlot.count < 64)) {
            // Add to current slot
            this.inventory.updateSlot(
                this.inventory.selectedSlot,
                blockType,
                (currentSlot.count || 0) + 1
            );
        } else {
            // Then check other hotbar slots with the same block type
            const hotbarSlot = this.inventory.hotbar.findIndex(s => 
                s.blockType === blockType && s.count < 64
            );
            
            if (hotbarSlot !== -1) {
                // Add to existing hotbar stack
                this.inventory.updateSlot(
                    hotbarSlot, 
                    blockType, 
                    this.inventory.hotbar[hotbarSlot].count + 1
                );
            } else {
                // Try to find empty hotbar slot
                const emptyHotbarSlot = this.inventory.hotbar.findIndex(s => 
                    s.blockType === null || s.count === 0
                );
                
                if (emptyHotbarSlot !== -1) {
                    // Add to empty hotbar slot
                    this.inventory.updateSlot(emptyHotbarSlot, blockType, 1);
                } else {
                    // Try to add to main inventory
                    const inventorySlot = this.inventory.inventory.findIndex(s => 
                        (s.blockType === blockType && s.count < 64) || 
                        (s.blockType === null || s.count === 0)
                    );
                    
                    if (inventorySlot !== -1) {
                        // Update inventory slot
                        const currentItem = this.inventory.inventory[inventorySlot];
                        this.inventory.inventory[inventorySlot] = {
                            blockType: blockType,
                            count: (currentItem.blockType === blockType ? currentItem.count : 0) + 1
                        };
                        this.inventory.updateInventoryUI();
                    } else {
                        // Inventory is full, can't pick up block
                        console.log("Inventory full!");
                        return;
                    }
                }
            }
        }
    
        // Remove the block from the world
        this.updateBlock(position, 0, true);
    }

    
    tryPlaceBlock() {
        const hit = this.castRay();
        if (!hit) {
            console.log("No hit detected for placement");
            return;
        }
    
        const currentSlot = this.inventory.hotbar[this.inventory.selectedSlot];
        if (!currentSlot?.count) {
            console.log("No blocks in selected slot or zero count");
            return;
        }
    
        const placePos = hit.position.clone().add(hit.normal);
        console.log("Attempting to place block at:", placePos);
        
        // Create collision boxes for more thorough checking
        const playerBox = new THREE.Box3();
        const blockBox = new THREE.Box3();
        const playerHeadBox = new THREE.Box3();
        const playerFeetBox = new THREE.Box3();
        
        // Main player hitbox
        playerBox.setFromCenterAndSize(
            this.player.position,
            new THREE.Vector3(0.6, 1.8, 0.6)
        );
        
        // Additional check for head level
        playerHeadBox.setFromCenterAndSize(
            new THREE.Vector3(
                this.player.position.x,
                this.player.position.y + 0.8,
                this.player.position.z
            ),
            new THREE.Vector3(0.6, 0.4, 0.6)
        );
    
        // Additional check for feet level
        playerFeetBox.setFromCenterAndSize(
            new THREE.Vector3(
                this.player.position.x,
                this.player.position.y - 0.8,
                this.player.position.z
            ),
            new THREE.Vector3(0.6, 0.4, 0.6)
        );
        
        // Block hitbox
        blockBox.setFromCenterAndSize(
            new THREE.Vector3(
                Math.floor(placePos.x) + 0.5,
                Math.floor(placePos.y) + 0.5,
                Math.floor(placePos.z) + 0.5
            ),
            new THREE.Vector3(1, 1, 1)
        );
        
        // Check all collision boxes
        if (playerBox.intersectsBox(blockBox) || 
            playerHeadBox.intersectsBox(blockBox) || 
            playerFeetBox.intersectsBox(blockBox)) {
            console.log("Block placement blocked by player collision");
            return;
        }
    
        // Extra safety check for placing blocks directly under player
        if (Math.abs(placePos.x - this.player.position.x) < 0.8 &&
            Math.abs(placePos.z - this.player.position.z) < 0.8 &&
            placePos.y < this.player.position.y) {
            const heightDiff = this.player.position.y - placePos.y;
            if (heightDiff < 1.8) {
                console.log("Block placement too close under player");
                return;
            }
        }
    
        console.log("Updating inventory and placing block");
        // If all checks pass, update inventory and place block
        this.inventory.updateSlot(
            this.inventory.selectedSlot, 
            currentSlot.blockType, 
            currentSlot.count - 1
        );
    
        this.updateBlock(placePos, currentSlot.blockType);
        this.lastPlaceTime = Date.now();
    }


    update() {
        const raycastResult = this.castRay();
        
        // Update highlighter
        this.highlighter.update(raycastResult);
        
        const now = Date.now();
        
        // Handle continuous block placement/removal with initial delay
        if (this.isRightMouseDown) {
            if (now - this.rightMouseDownTime >= this.initialClickDelay && now - this.lastPlaceTime >= this.placeInterval) {
                this.tryPlaceBlock();
            }
        }
        if (this.isLeftMouseDown) {
            if (now - this.leftMouseDownTime >= this.initialClickDelay && now - this.lastPlaceTime >= this.placeInterval) {
                this.tryRemoveBlock();
            }
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
            this.isLeftMouseDown = false;
        }
    }

    handleMouseDown(event) {
        if (document.pointerLockElement !== document.querySelector('canvas')) return;
        
        if (event.button === 0) {
            this.isLeftMouseDown = true;
            this.leftMouseDownTime = Date.now();
            this.tryRemoveBlock();
        } else if (event.button === 2) {
            this.isRightMouseDown = true;
            this.rightMouseDownTime = Date.now();
            this.tryPlaceBlock();
        }
    }

    dispose() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('touchstart', this.handleTouchStart);
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