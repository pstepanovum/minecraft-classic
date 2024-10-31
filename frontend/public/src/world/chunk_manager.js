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
        
        this.chunks = new Map();
        this.meshes = new Map();
        this.createMeshFunction = null;
        this.chunkWorker = null;
        this.lastPlayerChunkPos = null;
        
        // Add loading queue for smoother chunk generation
        this.loadingQueue = [];
        this.unloadQueue = [];
        this.isProcessing = false;
        this.maxChunksPerFrame = 2; // Adjust this value based on performance
        
    }

    setMeshCreationFunction(fn) {
        this.createMeshFunction = fn;
    }

    setChunkWorker(worker) {
        this.chunkWorker = worker;
    }

    isChunkInBounds(chunkX, chunkZ) {
        const maxChunk = Math.floor(this.WORLD_SIZE / (2 * this.CHUNK_SIZE));
        return chunkX >= -maxChunk && chunkX <= maxChunk && 
               chunkZ >= -maxChunk && chunkZ <= maxChunk;
    }

    generateInitialChunk() {
        if (!this.lastPlayerChunkPos) return;

        const { x: playerChunkX, z: playerChunkZ } = this.lastPlayerChunkPos;
        
        // Load chunks within render distance
        for (let dx = -this.RENDER_DISTANCE; dx <= this.RENDER_DISTANCE; dx++) {
            for (let dz = -this.RENDER_DISTANCE; dz <= this.RENDER_DISTANCE; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                
                if (this.isChunkInBounds(chunkX, chunkZ)) {
                    this.generateChunk(chunkX, chunkZ);
                }
            }
        }
    }


    updateChunk(playerPosition) {
        if (!playerPosition) return;

        const currentChunkX = Math.floor(playerPosition.x / this.CHUNK_SIZE);
        const currentChunkZ = Math.floor(playerPosition.z / this.CHUNK_SIZE);

        if (this.lastPlayerChunkPos && 
            currentChunkX === this.lastPlayerChunkPos.x && 
            currentChunkZ === this.lastPlayerChunkPos.z) {
            return;
        }

        this.lastPlayerChunkPos = { x: currentChunkX, z: currentChunkZ };
        const chunksToKeep = new Set();

        // Calculate distances for all chunks for better prioritization
        const chunkDistances = [];

        for (let dx = -this.RENDER_DISTANCE; dx <= this.RENDER_DISTANCE; dx++) {
            for (let dz = -this.RENDER_DISTANCE; dz <= this.RENDER_DISTANCE; dz++) {
                const chunkX = currentChunkX + dx;
                const chunkZ = currentChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                chunksToKeep.add(key);

                if (this.isChunkInBounds(chunkX, chunkZ) && !this.chunks.has(key)) {
                    chunkDistances.push({ chunkX, chunkZ, distance });
                }
            }
        }

        // Sort chunks by distance from player
        chunkDistances.sort((a, b) => a.distance - b.distance);

        // Queue chunks for loading
        this.loadingQueue.push(...chunkDistances);

        // Queue far chunks for unloading
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
        
        if (this.chunks.has(key) || !this.isChunkInBounds(chunkX, chunkZ)) return;
    
        // console.log(`Generating chunk at ${chunkX},${chunkZ}`);
    
        this.chunks.set(key, {
            position: { x: chunkX, z: chunkZ },
            meshes: new Map()
        });
        
        if (this.chunkWorker) {
            // Calculate how many vertical chunks we need
            const verticalChunks = Math.ceil(this.MAX_HEIGHT / this.CHUNK_SIZE);
            
            // Generate chunks for each vertical section
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
    
        console.log(`Unloading chunk: ${key}`);
    
        // Enhanced cleanup
        try {
            chunk.meshes.forEach((meshData) => {
                if (meshData.mesh) {
                    // Remove from scene first
                    this.scene.remove(meshData.mesh);
                    
                    // Dispose geometries
                    if (meshData.mesh.geometry) {
                        meshData.mesh.geometry.dispose();
                    }
                    
                    // Dispose materials
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
    
                    // Clear any references
                    meshData.mesh.clear();
                }
            });
    
            // Clear all references
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