//--------------------------------------------------------------//
//                       Chunk Management
//--------------------------------------------------------------//
export class ChunkManager {
    constructor(scene, worldConfig = {}, clientConfig) {
        this.scene = scene;
        this.CHUNK_SIZE = clientConfig.CHUNK_SIZE;
        this.RENDER_DISTANCE = clientConfig.RENDER_DISTANCE;
        this.WORLD_SIZE = worldConfig.SIZE;
        this.MAX_HEIGHT = worldConfig.MAX_HEIGHT;

        this.maxChunks = this.WORLD_SIZE / this.CHUNK_SIZE;

        this.chunks = new Map();
        this.meshes = new Map();
        this.createMeshFunction = null;
        this.chunkWorker = null;
        this.lastPlayerChunkPos = null;

        this.loadingQueue = [];
        this.unloadQueue = [];
        this.isProcessing = false;
        this.maxChunksPerFrame = 2;

        this.bufferPool = new BufferPool(this.CHUNK_SIZE);
    }

    setMeshCreationFunction(fn) {
        this.createMeshFunction = fn;
    }

    setChunkWorker(worker) {
        this.chunkWorker = worker;
    }

    isChunkInBounds(chunkX, chunkZ) {
        return chunkX >= 0 && chunkX < this.maxChunks && 
               chunkZ >= 0 && chunkZ < this.maxChunks;
    }


    generateInitialChunk() {
        if (!this.lastPlayerChunkPos) return;

        const { x: playerChunkX, z: playerChunkZ } = this.lastPlayerChunkPos;
        
        // Load chunks within render distance, but only in valid bounds
        for (let dx = -this.RENDER_DISTANCE; dx <= this.RENDER_DISTANCE; dx++) {
            for (let dz = -this.RENDER_DISTANCE; dz <= this.RENDER_DISTANCE; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                
                // Only generate if within bounds (positive quadrant)
                if (this.isChunkInBounds(chunkX, chunkZ)) {
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
    }

    async processQueues() {
        this.isProcessing = true;
    
        try {
            // Process a limited number of chunks per frame
            for (let i = 0; i < this.maxChunksPerFrame && this.loadingQueue.length > 0; i++) {
                const chunk = this.loadingQueue.shift();
                await this.generateChunk(chunk.chunkX, chunk.chunkZ);
            }
    
            // Process some unloads per frame
            for (let i = 0; i < this.maxChunksPerFrame && this.unloadQueue.length > 0; i++) {
                const key = this.unloadQueue.shift();
                this.unloadChunk(key);
            }
    
            // If there's more to process, schedule next frame
            if (this.loadingQueue.length > 0 || this.unloadQueue.length > 0) {
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
            buffer: chunkBuffer
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
        }
    }

    dispose() {
        // Clear loading queues
        this.loadingQueue = [];
        this.unloadQueue = [];
        this.isProcessing = false;

        // Dispose all chunks
        for (const [key, chunk] of this.chunks.entries()) {
            this.unloadChunk(key);
        }
        
        this.chunks.clear();
        this.meshes.clear();
    }

    updateBlock(worldX, worldY, worldZ, blockType) {
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
        }
    }
    
}

class BufferPool {
    constructor(chunkSize) {
        this.chunkSize = chunkSize;
        this.pool = [];
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
        if (buffer) {
            this.pool.push(buffer);
        }
    }
}