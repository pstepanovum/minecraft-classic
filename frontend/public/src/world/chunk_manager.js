// ==============================================================
// FILE: src/world/chunk_manager.js
// ==============================================================


//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//

import * as GameState from '../core/game-state.js';
export class ChunkManager {
    constructor(scene, worldConfig = {}, clientConfig) {
        this.scene = scene;

        if (GameState && !GameState.chunkManager) {
            GameState.setScene(scene);
        }

        this.CHUNK_SIZE = clientConfig.CHUNK_SIZE;
        this.RENDER_DISTANCE = clientConfig.RENDER_DISTANCE;
        this.WORLD_SIZE = worldConfig.SIZE;
        this.MAX_HEIGHT = worldConfig.MAX_HEIGHT;
        this.MAX_PROCESSING_TIME = clientConfig.MAX_PROCESSING_TIME || 30;

        this.maxChunks = this.WORLD_SIZE / this.CHUNK_SIZE;

        this.chunks = new Map();
        this.meshes = new Map();
        this.createMeshFunction = null;
        this.chunkWorker = null;
        this.lastPlayerChunkPos = null;

        // Add queues for processing different operations
        this.loadingQueue = [];
        this.unloadQueue = [];
        this.updateQueue = []; // Add update queue for block changes
        this.isProcessing = false;
        this.maxChunksPerFrame = 2;
        this.processingStartTime = 0;

        // Add network-related properties
        this.pendingNetworkUpdates = new Map();
        this.lastNetworkSync = Date.now();
        this.syncInterval = 100; // ms between network syncs

        this.bufferPool = new BufferPool(this.CHUNK_SIZE);
    }

    setMeshCreationFunction(fn) {
        this.createMeshFunction = fn;
    }

    setChunkWorker(worker) {
        this.chunkWorker = worker;
        if (GameState) {
            GameState.setChunkWorker(worker);
        }
    }

    isChunkInBounds(chunkX, chunkZ) {
        const worldSizeInChunks = Math.floor(this.WORLD_SIZE / this.CHUNK_SIZE);
        return chunkX >= 0 && chunkX < worldSizeInChunks && 
               chunkZ >= 0 && chunkZ < worldSizeInChunks;
    }

    generateInitialChunk() {
        if (!this.lastPlayerChunkPos) return;
    
        const { x: playerChunkX, z: playerChunkZ } = this.lastPlayerChunkPos;
        const worldSizeInChunks = Math.floor(this.WORLD_SIZE / this.CHUNK_SIZE);
        
        for (let dx = -this.RENDER_DISTANCE; dx <= this.RENDER_DISTANCE; dx++) {
            for (let dz = -this.RENDER_DISTANCE; dz <= this.RENDER_DISTANCE; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                
                if (chunkX >= 0 && chunkX < worldSizeInChunks && 
                    chunkZ >= 0 && chunkZ < worldSizeInChunks) {
                    this.generateChunk(chunkX, chunkZ);
                }
            }
        }
    }

    updateChunk(playerPosition) {
        if (!playerPosition) return;

        // Calculate current chunk position
        const currentChunkX = Math.floor(playerPosition.x / this.CHUNK_SIZE);
        const currentChunkZ = Math.floor(playerPosition.z / this.CHUNK_SIZE);

        // Don't update if we're in the same chunk
        if (this.lastPlayerChunkPos && 
            currentChunkX === this.lastPlayerChunkPos.x && 
            currentChunkZ === this.lastPlayerChunkPos.z) {
            return;
        }

        this.lastPlayerChunkPos = { x: currentChunkX, z: currentChunkZ };
        const chunksToKeep = new Set();
        const chunkDistances = [];

        // Calculate which chunks should be loaded/unloaded
        for (let dx = -this.RENDER_DISTANCE; dx <= this.RENDER_DISTANCE; dx++) {
            for (let dz = -this.RENDER_DISTANCE; dz <= this.RENDER_DISTANCE; dz++) {
                const chunkX = currentChunkX + dx;
                const chunkZ = currentChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // Only keep chunks that are within bounds
                if (this.isChunkInBounds(chunkX, chunkZ)) {
                    chunksToKeep.add(key);
                    
                    if (!this.chunks.has(key)) {
                        chunkDistances.push({ chunkX, chunkZ, distance });
                    }
                }
            }
        }

        // Sort chunks by distance from player
        chunkDistances.sort((a, b) => a.distance - b.distance);
        this.loadingQueue.push(...chunkDistances);

        // Queue chunks for unloading if they're out of range or out of bounds
        for (const [key, chunk] of this.chunks.entries()) {
            if (!chunksToKeep.has(key)) {
                this.unloadQueue.push(key);
            }
        }

        // Start processing if not already running
        if (!this.isProcessing) {
            this.processQueues();
        }
        
        // Process network updates on a regular interval
        const now = Date.now();
        if (now - this.lastNetworkSync > this.syncInterval) {
            this.processPendingNetworkUpdates();
            this.lastNetworkSync = now;
        }
    }

    async processQueues() {
        this.isProcessing = true;
        this.processingStartTime = performance.now();
    
        try {
            // Process a limited number of chunks per frame
            let processedCount = 0;
            
            // Process chunk loading
            while (this.loadingQueue.length > 0 && 
                   processedCount < this.maxChunksPerFrame && 
                   performance.now() - this.processingStartTime < this.MAX_PROCESSING_TIME) {
                
                const chunk = this.loadingQueue.shift();
                await this.generateChunk(chunk.chunkX, chunk.chunkZ);
                processedCount++;
            }
    
            // Process chunk unloading
            processedCount = 0;
            while (this.unloadQueue.length > 0 && 
                   processedCount < this.maxChunksPerFrame &&
                   performance.now() - this.processingStartTime < this.MAX_PROCESSING_TIME) {
                
                const key = this.unloadQueue.shift();
                this.unloadChunk(key);
                processedCount++;
            }
            
            // Process block updates (important for multiplayer)
            processedCount = 0;
            while (this.updateQueue.length > 0 && 
                   processedCount < this.maxChunksPerFrame * 5 && // Allow more block updates per frame
                   performance.now() - this.processingStartTime < this.MAX_PROCESSING_TIME) {
                
                const update = this.updateQueue.shift();
                this.updateBlock(update.x, update.y, update.z, update.blockType, update.fromNetwork);
                processedCount++;
            }
    
            // If there's more to process, schedule next frame
            if (this.loadingQueue.length > 0 || 
                this.unloadQueue.length > 0 || 
                this.updateQueue.length > 0) {
                
                requestAnimationFrame(() => this.processQueues());
            } else {
                this.isProcessing = false;
            }
        } catch (error) {
            console.error('Error processing chunks:', error);
            this.isProcessing = false;
        }
    }

    generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
    
        if (this.chunks.has(key) || !this.isChunkInBounds(chunkX, chunkZ)) {
            return;
        }
    
        const chunkBuffer = this.bufferPool.getBuffer();
        if (!chunkBuffer) {
            console.error(`Failed to generate chunk at (${chunkX}, ${chunkZ}) due to buffer allocation failure.`);
            return;
        }
    
        this.chunks.set(key, {
            position: { x: chunkX, z: chunkZ },
            meshes: new Map(),
            buffer: chunkBuffer,
            lastUpdateTime: Date.now()
        });
    
        if (this.chunkWorker) {
            const verticalChunks = Math.ceil(this.MAX_HEIGHT / this.CHUNK_SIZE);
    
            for (let chunkY = 0; chunkY < verticalChunks; chunkY++) {
                this.chunkWorker.postMessage({
                    type: 'generateChunk',
                    chunkX,
                    chunkY,
                    chunkZ
                });
            }
        }
    }

    getBlockType(chunkX, chunkY, chunkZ, localX, localY, localZ) {
        const key = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(key);
        
        if (!chunk || !chunk.meshes.has(chunkY)) {
            return 0; // Return air if chunk doesn't exist
        }

        // Get block index in the chunk data array
        const index = localX + 
                    (localY * this.CHUNK_SIZE) + 
                    (localZ * this.CHUNK_SIZE * this.CHUNK_SIZE);
        
        return chunk.meshes.get(chunkY).data[index] || 0;
    }

    unloadChunk(key) {
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        try {
            chunk.meshes.forEach((meshData) => {
                if (meshData.mesh) {
                    this.scene.remove(meshData.mesh);

                    if (meshData.mesh.geometry) {
                        meshData.mesh.geometry.dispose();
                    }

                    if (meshData.mesh.material) {
                        if (Array.isArray(meshData.mesh.material)) {
                            meshData.mesh.material.forEach(m => {
                                if (m.map) m.map.dispose();
                                m.dispose();
                            });
                        } else {
                            if (meshData.mesh.material.map) {
                                meshData.mesh.material.map.dispose();
                            }
                            meshData.mesh.material.dispose();
                        }
                    }

                    meshData.mesh.clear();
                }
            });

            this.bufferPool.releaseBuffer(chunk.buffer);
            chunk.meshes.clear();
            this.chunks.delete(key);

        } catch (error) {
            console.error(`Error unloading chunk ${key}:`, error);
        }
    }

    handleChunkData(chunk, chunkX, chunkY, chunkZ) {
        if (!this.createMeshFunction || !this.isChunkInBounds(chunkX, chunkZ)) return;

        const key = `${chunkX},${chunkZ}`;
        if (!this.chunks.has(key)) return;

        const chunkData = this.chunks.get(key);
        const oldMeshData = chunkData.meshes.get(chunkY);

        // Remove old mesh if it exists
        if (oldMeshData && oldMeshData.mesh) {
            this.scene.remove(oldMeshData.mesh);
            this.bufferPool.releaseBuffer(oldMeshData.data);
        }

        // Create new mesh
        const meshData = this.createMeshFunction(chunk, chunkX, chunkY, chunkZ);
        if (meshData) {
            chunkData.meshes.set(chunkY, {
                mesh: meshData.mesh,
                data: chunk
            });
            
            // Update timestamp for last chunk update
            chunkData.lastUpdateTime = Date.now();
            
            // Publish chunk loaded event
            if (GameState) {
                GameState.publish(GameState.EVENTS.CHUNK_LOADED, {
                    chunkX, chunkY, chunkZ,
                    timestamp: chunkData.lastUpdateTime
                });
            }
        }
    }

    dispose() {
        // Clear loading queues
        this.loadingQueue = [];
        this.unloadQueue = [];
        this.updateQueue = [];
        this.isProcessing = false;

        // Dispose all chunks
        for (const [key, chunk] of this.chunks.entries()) {
            this.unloadChunk(key);
        }
        
        this.chunks.clear();
        this.meshes.clear();
        this.pendingNetworkUpdates.clear();
    }

    updateBlock(worldX, worldY, worldZ, blockType, fromNetwork = false) {
        const chunkX = Math.floor(worldX / this.CHUNK_SIZE);
        const chunkY = Math.floor(worldY / this.CHUNK_SIZE);
        const chunkZ = Math.floor(worldZ / this.CHUNK_SIZE);
        
        const localX = ((worldX % this.CHUNK_SIZE) + this.CHUNK_SIZE) % this.CHUNK_SIZE;
        const localY = ((worldY % this.CHUNK_SIZE) + this.CHUNK_SIZE) % this.CHUNK_SIZE;
        const localZ = ((worldZ % this.CHUNK_SIZE) + this.CHUNK_SIZE) % this.CHUNK_SIZE;

        if (this.chunkWorker) {
            this.chunkWorker.postMessage({
                type: 'updateBlock',
                chunkX,
                chunkY,
                chunkZ,
                localX,
                localY,
                localZ,
                blockType
            });
            
            // If the update came from the player (not network)
            // Add it to the pending network updates
            if (!fromNetwork && GameState.isOnline && GameState.socket) {
                const updateKey = `${worldX},${worldY},${worldZ}`;
                
                this.pendingNetworkUpdates.set(updateKey, {
                    position: { x: worldX, y: worldY, z: worldZ },
                    type: blockType === 0 ? 'remove' : blockType,
                    timestamp: Date.now()
                });
            }
            
            // Publish block update event
            if (GameState) {
                GameState.publish(GameState.EVENTS.BLOCK_UPDATED, {
                    position: { x: worldX, y: worldY, z: worldZ },
                    type: blockType === 0 ? 'remove' : blockType,
                    fromNetwork
                });
            }
        }
    }
    
    // THIS IS THE MISSING FUNCTION THAT CAUSED THE ERROR
    queueBlockUpdate(worldX, worldY, worldZ, blockType, fromNetwork = false) {
        // Add block update to queue
        this.updateQueue.push({
            x: worldX,
            y: worldY,
            z: worldZ,
            blockType,
            fromNetwork
        });
        
        // Ensure queue processing is running
        if (!this.isProcessing) {
            this.processQueues();
        }
    }
    
    // Process network updates in batches
    processPendingNetworkUpdates() {
        if (!GameState.isOnline || !GameState.socket || this.pendingNetworkUpdates.size === 0) {
            return;
        }
        
        // Convert pending updates to array
        const updates = Array.from(this.pendingNetworkUpdates.values());
        
        // Send to server if there are updates
        if (updates.length > 0) {
            if (updates.length === 1) {
                // Single update
                GameState.socket.emit('blockUpdate', updates[0]);
            } else {
                // Bulk update
                GameState.socket.emit('bulkBlockUpdate', updates);
            }
            
            // Clear pending updates after sending
            this.pendingNetworkUpdates.clear();
        }
    }
    
    // Apply modifications from other players
    applyNetworkModifications(modifications) {
        if (!modifications || modifications.length === 0) {
            return;
        }
        
        // Queue each modification for processing
        modifications.forEach(mod => {
            this.queueBlockUpdate(
                mod.position.x,
                mod.position.y,
                mod.position.z,
                mod.type === 'remove' ? 0 : mod.type,
                true // mark as from network
            );
        });
    }
}

class BufferPool {
    constructor(chunkSize) {
        this.chunkSize = chunkSize;
        this.pool = [];
        this.maxPoolSize = 50; // Limit pool size to prevent memory leaks
        this.maxBufferSize = 1024 * 1024 * 1024; // 1 GB limit for example
    }

    getBuffer() {
        const bufferSize = this.chunkSize * this.chunkSize * this.chunkSize;
        if (bufferSize > this.maxBufferSize) {
            console.error(`Requested buffer size ${bufferSize} exceeds maximum allowed size ${this.maxBufferSize}`);
            return null;
        }

        if (this.pool.length > 0) {
            return this.pool.pop();
        }

        try {
            return new Float32Array(bufferSize);
        } catch (error) {
            console.error('Error allocating buffer:', error);
            return null;
        }
    }

    releaseBuffer(buffer) {
        if (!buffer) return;
        
        // Only keep buffers up to the maximum pool size
        if (this.pool.length < this.maxPoolSize) {
            this.pool.push(buffer);
        }
        // Otherwise let the buffer be garbage collected
    }
}