const CHUNK_SIZE = 4;
const RENDER_DISTANCE = 1;

class ChunkManager {
    constructor(noise2D, maxHeight, baseHeight = 0, heightScale = 1) {
        this.chunks = new Map();
        this.loadedChunks = new Set();
        this.noise2D = noise2D;
        this.maxHeight = maxHeight;
        this.baseHeight = baseHeight;
        this.heightScale = heightScale;
        this.removedBlocks = new Set();
    }

    getChunkKey(chunkX, chunkZ) {
        return `${chunkX},${chunkZ}`;
    }

    generateChunk(chunkX, chunkZ) {
        const chunk = [];
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const worldX = chunkX * CHUNK_SIZE + x;
                const worldZ = chunkZ * CHUNK_SIZE + z;
                const noiseValue = this.noise2D(worldX * 0.1, worldZ * 0.1);
                const height = Math.floor(this.baseHeight + (noiseValue + 1) * 0.5 * this.maxHeight * this.heightScale);
                chunk.push({ x: worldX, z: worldZ, height });
            }
        }
        return chunk;
    }

    getChunksAroundPlayer(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerZ / CHUNK_SIZE);
        const chunksToSend = [];
        const newLoadedChunks = new Set();

        for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
            for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const chunkKey = this.getChunkKey(chunkX, chunkZ);

                if (!this.chunks.has(chunkKey)) {
                    const newChunk = this.generateChunk(chunkX, chunkZ);
                    this.chunks.set(chunkKey, newChunk);
                }

                newLoadedChunks.add(chunkKey);
                chunksToSend.push({
                    chunkX,
                    chunkZ,
                    blocks: this.chunks.get(chunkKey)
                });
            }
        }

        // Remove chunks that are no longer within the render distance
        for (const chunkKey of this.loadedChunks) {
            if (!newLoadedChunks.has(chunkKey)) {
                this.chunks.delete(chunkKey);
            }
        }

        this.loadedChunks = newLoadedChunks;

        return chunksToSend;
    }

    removeBlock(blockPosition) {
        const { x, y, z } = blockPosition;
        const blockKey = `${x},${y},${z}`;
        this.removedBlocks.add(blockKey);

        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const chunkKey = this.getChunkKey(chunkX, chunkZ);
        const chunk = this.chunks.get(chunkKey);
        if (chunk) {
            const columnIndex = chunk.findIndex(col => col.x === x && col.z === z);
            if (columnIndex !== -1 && chunk[columnIndex].height === y) {
                chunk[columnIndex].height = y - 1;
            }
        }

        return true;
    }

    getChunk(chunkKey) {
        return this.chunks.get(chunkKey);
    }

    updateChunk(chunkKey, updatedChunk) {
        this.chunks.set(chunkKey, updatedChunk);
    }

    getRemovedBlocks() {
        return Array.from(this.removedBlocks);
    }
}

module.exports = ChunkManager;