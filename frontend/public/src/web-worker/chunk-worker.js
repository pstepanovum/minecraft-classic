// ==============================================================
// FILE: src/web-worker/chunk-worker.js
// ==============================================================

class TreeGenerator {
    constructor(worldConfig, clientConfig, blockTypes, schematicHandler, simplexNoise) {
        this.worldConfig = worldConfig;
        this.clientConfig = clientConfig;
        this.blockTypes = blockTypes;
        this.schematicHandler = schematicHandler;
        this.simplexNoise = simplexNoise;
    }

    generateTreesInChunk(chunk, chunkX, chunkY, chunkZ, heightMap, biomeMap) {
        const worldXStart = chunkX * this.clientConfig.CHUNK_SIZE;
        const worldZStart = chunkZ * this.clientConfig.CHUNK_SIZE;
        const worldYStart = chunkY * this.clientConfig.CHUNK_SIZE;

        // Track tree positions in this chunk
        const treePositions = new Set();

        // First pass: collect all valid tree positions
        const validPositions = [];
        for (let x = 0; x < this.clientConfig.CHUNK_SIZE; x++) {
            for (let z = 0; z < this.clientConfig.CHUNK_SIZE; z++) {
                const worldX = worldXStart + x;
                const worldZ = worldZStart + z;
                
                if (Math.abs(worldX) <= this.worldConfig.SIZE && Math.abs(worldZ) <= this.worldConfig.SIZE) {
                    const index = x + z * this.clientConfig.CHUNK_SIZE;
                    const height = heightMap[index];
                    const biomeType = biomeMap[index];

                    if (worldYStart <= height && 
                        worldYStart + this.clientConfig.CHUNK_SIZE > height &&
                        this.isValidTreePosition(worldX, worldZ, height, heightMap, x, z, biomeType) &&
                        this.shouldPlaceTree(worldX, worldZ, biomeType, height)) {
                        
                        validPositions.push({ x, z, height: height - worldYStart, biomeType });
                    }
                }
            }
        }

        // Second pass: randomly select positions while maintaining minimum spacing
        // Use seeded random based on position for consistency
        validPositions.sort((a, b) => {
            const seedA = this.getPositionSeed(worldXStart + a.x, worldZStart + a.z);
            const seedB = this.getPositionSeed(worldXStart + b.x, worldZStart + b.z);
            return seedA - seedB;
        });

        for (const pos of validPositions) {
            if (this.hasEnoughSpacing(pos.x, pos.z, treePositions)) {
                this.generateTree(chunk, pos.x, pos.height, pos.z, pos.biomeType);
                treePositions.add(`${pos.x},${pos.z}`);
            }
        }
    }

    getPositionSeed(worldX, worldZ) {
        // Simple but consistent pseudo-random number based on position and world seed
        return (worldX * 73856093 ^ worldZ * 19349663 ^ this.worldConfig.SEED) / Math.pow(2, 32);
    }

    hasEnoughSpacing(x, z, treePositions) {
        for (let dx = -this.worldConfig.TREES.INFLUENCE_RADIUS; dx <= this.worldConfig.TREES.INFLUENCE_RADIUS; dx++) {
            for (let dz = -this.worldConfig.TREES.INFLUENCE_RADIUS; dz <= this.worldConfig.TREES.INFLUENCE_RADIUS; dz++) {
                const checkX = x + dx;
                const checkZ = z + dz;
                
                if (checkX < 0 || checkX >= this.clientConfig.CHUNK_SIZE || 
                    checkZ < 0 || checkZ >= this.clientConfig.CHUNK_SIZE) {
                    continue;
                }

                if (treePositions.has(`${checkX},${checkZ}`)) {
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    if (distance < this.worldConfig.TREES.MIN_SPACING) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    shouldPlaceTree(worldX, worldZ, biomeType, surfaceHeight) {
        if (surfaceHeight <= this.worldConfig.WATER_LEVEL + this.worldConfig.TREES.BEACH_BUFFER) {
            return false;
        }

        const treeNoise = this.simplexNoise.noise2D(
            worldX * this.worldConfig.TREES.NOISE_SCALE, 
            worldZ * this.worldConfig.TREES.NOISE_SCALE
        );
        const normalizedNoise = (treeNoise + 1) / 2; // Normalize to 0-1

        const biomeConfig = this.worldConfig.TREES.BIOMES[biomeType.toUpperCase()];
        return biomeConfig && normalizedNoise > biomeConfig.NOISE_THRESHOLD;
    }

    isValidTreePosition(worldX, worldZ, height, heightMap, localX, localZ, biomeType) {
        if (height <= this.worldConfig.WATER_LEVEL + this.worldConfig.TREES.BEACH_BUFFER) {
            return false;
        }

        const requiredFlatRadius = this.worldConfig.TREES.PLACEMENT.REQUIRED_FLAT_RADIUS;
        const maxHeightDiff = this.worldConfig.TREES.PLACEMENT.MAX_HEIGHT_DIFFERENCE;

        for (let dx = -requiredFlatRadius; dx <= requiredFlatRadius; dx++) {
            for (let dz = -requiredFlatRadius; dz <= requiredFlatRadius; dz++) {
                const checkX = localX + dx;
                const checkZ = localZ + dz;
                
                if (checkX < 0 || checkX >= this.clientConfig.CHUNK_SIZE || 
                    checkZ < 0 || checkZ >= this.clientConfig.CHUNK_SIZE) {
                    continue;
                }
                
                const neighborHeight = heightMap[checkX + checkZ * this.clientConfig.CHUNK_SIZE];
                if (Math.abs(height - neighborHeight) > maxHeightDiff) {
                    return false;
                }
            }
        }

        return true;
    }

    generateTree(chunk, x, y, z, biomeType) {
        const biomeConfig = this.worldConfig.TREES.BIOMES[biomeType.toUpperCase()];
        if (!biomeConfig) return;

        const leafConfig = biomeConfig.LEAF_CONFIG;
        if (x < leafConfig.MAX_RADIUS || x >= this.clientConfig.CHUNK_SIZE - leafConfig.MAX_RADIUS || 
            z < leafConfig.MAX_RADIUS || z >= this.clientConfig.CHUNK_SIZE - leafConfig.MAX_RADIUS || 
            y < 1 || y >= this.clientConfig.CHUNK_SIZE - (biomeConfig.TRUNK_HEIGHT.MAX + leafConfig.LAYERS.length)) {
            return;
        }

        // Use position-based seed for consistent height
        const randValue = this.getPositionSeed(x, z);
        const heightRange = biomeConfig.TRUNK_HEIGHT.MAX - biomeConfig.TRUNK_HEIGHT.MIN;
        const height = biomeConfig.TRUNK_HEIGHT.MIN + Math.floor(randValue * heightRange);

        // Select tree shape based on biome or other criteria
        const treeShape = biomeConfig.TREE_SHAPE || 'default';

        switch (treeShape) {
            case 'default':
                this.generateDefaultTree(chunk, x, y, z, height, leafConfig);
                break;
            case 'pine':
                this.generatePineTree(chunk, x, y, z, height, leafConfig);
                break;
            case 'oak':
                this.generateOakTree(chunk, x, y, z, height, leafConfig);
                break;
            // Add more tree shapes here
            default:
                this.generateDefaultTree(chunk, x, y, z, height, leafConfig);
                break;
        }
    }

    generateDefaultTree(chunk, x, y, z, height, leafConfig) {
        this.generateTrunk(chunk, x, y, z, height);
        this.generateLeaves(chunk, x, y + height, z, leafConfig);
    }

    generatePineTree(chunk, x, y, z, height, leafConfig) {
        this.generateTrunk(chunk, x, y, z, height);
        for (let i = 0; i < height; i++) {
            const radius = Math.max(1, Math.floor((height - i) / 3));
            this.generateLeafLayer(chunk, x, y + height - i, z, radius, true);
        }
    }

    generateOakTree(chunk, x, y, z, height, leafConfig) {
        this.generateTrunk(chunk, x, y, z, height);
        const branchHeight = Math.floor(height / 2);
        for (let i = 0; i < branchHeight; i++) {
            const radius = Math.max(1, Math.floor((branchHeight - i) / 2));
            this.generateLeafLayer(chunk, x, y + branchHeight + i, z, radius, true);
        }
    }

    // Existing methods...

    generateTrunk(chunk, x, y, z, height) {
        for (let dy = 0; dy < height; dy++) {
            this.setBlockInChunk(chunk, x, y + dy, z, this.blockTypes.LOG);
        }
    }

    generateLeaves(chunk, centerX, topY, centerZ, leafConfig) {
        leafConfig.LAYERS.forEach((layer, index) => {
            this.generateLeafLayer(
                chunk, 
                centerX, 
                topY - layer.height, 
                centerZ, 
                layer.radius, 
                layer.full
            );
        });
    }

    generateLeafLayer(chunk, centerX, y, centerZ, radius, isFull) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                if (distance > radius) continue;
                if (!isFull && distance > radius - 0.5) continue;
    
                this.setBlockInChunk(chunk, centerX + dx, y, centerZ + dz, this.blockTypes.LEAVES);
            }
        }
    }

    getBlockIndex(x, y, z) {
        if (x < 0 || x >= this.clientConfig.CHUNK_SIZE || 
            y < 0 || y >= this.clientConfig.CHUNK_SIZE || 
            z < 0 || z >= this.clientConfig.CHUNK_SIZE) {
            return -1;
        }
        return x + y * this.clientConfig.CHUNK_SIZE + z * this.clientConfig.CHUNK_SIZE * this.clientConfig.CHUNK_SIZE;
    }

    setBlockInChunk(chunk, x, y, z, blockType) {
        const index = this.getBlockIndex(x, y, z);
        if (index !== -1 && chunk[index] === 0) {
            chunk[index] = blockType;
        }
    }
}

class CaveGenerator {
    constructor(worldConfig, simplexNoise) {
        this.worldConfig = worldConfig;
        this.simplexNoise = simplexNoise;
    }

    generateCaves(x, y, z) {
        if (y < this.worldConfig.CAVES.MIN_HEIGHT || y > this.worldConfig.CAVES.MAX_HEIGHT) {
            return false;
        }

        // Enhanced tunnel generation with multiple noise layers
        const tunnelNoise = this.generateTunnel(x, y, z);
        const spaghettiNoise = this.generateSpaghetti(x, y, z);

        // Check thresholds
        const isTunnelCave = tunnelNoise > this.worldConfig.CAVES.TUNNEL.THRESHOLD;
        const isSpaghettiCave = spaghettiNoise > this.worldConfig.CAVES.SPAGHETTI.THRESHOLD;

        return isTunnelCave || isSpaghettiCave;
    }

    generateTunnel(x, y, z) {
        const config = this.worldConfig.CAVES.TUNNEL;
        
        // Main tunnel noise
        const mainNoise = this.simplexNoise.noise3D(
            x * config.SCALE,
            y * config.SCALE * config.VERTICAL_SCALE,
            z * config.SCALE
        ) * config.AMPLITUDE;

        // Secondary noise for tunnel variation
        const variationNoise = this.simplexNoise.noise3D(
            x * config.SCALE * 2,
            y * config.SCALE * 2,
            z * config.SCALE * 2
        ) * config.VARIATION_AMPLITUDE;

        // Tunnel direction bias (creates more horizontal tunnels)
        const heightBias = Math.exp(-(y - config.PREFERRED_HEIGHT) * 
                                   (y - config.PREFERRED_HEIGHT) / 
                                   (2 * config.HEIGHT_VARIATION * config.HEIGHT_VARIATION));

        // Connect nearby tunnels (creates intersections)
        const connectionNoise = this.simplexNoise.noise3D(
            x * config.CONNECTION_SCALE,
            y * config.CONNECTION_SCALE,
            z * config.CONNECTION_SCALE
        ) * config.CONNECTION_STRENGTH;

        return (mainNoise + variationNoise + connectionNoise) * heightBias;
    }

    generateSpaghetti(x, y, z) {
        const config = this.worldConfig.CAVES.SPAGHETTI;

        // Main spaghetti noise
        const mainNoise = this.simplexNoise.noise3D(
            x * config.SCALE,
            y * config.SCALE * config.VERTICAL_SQUEEZE,
            z * config.SCALE
        ) * config.AMPLITUDE;

        // Winding variation
        const windingNoise = this.simplexNoise.noise3D(
            x * config.SCALE * 3,
            y * config.SCALE * 3,
            z * config.SCALE * 3
        ) * config.WINDING_STRENGTH;

        // Branch noise (creates occasional branches)
        const branchNoise = this.simplexNoise.noise3D(
            x * config.BRANCH_SCALE,
            y * config.BRANCH_SCALE,
            z * config.BRANCH_SCALE
        ) * config.BRANCH_STRENGTH;

        return mainNoise + windingNoise + (branchNoise > config.BRANCH_THRESHOLD ? branchNoise : 0);
    }
}

class OreGenerator {
    constructor(worldConfig, simplexNoise) {
        this.worldConfig = worldConfig;
        this.simplexNoise = simplexNoise;
    }
    generateOre(x, y, z) {
        if (y >= worldConfig.ORES.COAL.MIN_HEIGHT && y <= worldConfig.ORES.COAL.MAX_HEIGHT) {
            const noiseCoal = simplexNoise.noise3D(x * worldConfig.ORES.COAL.SCALE, y * worldConfig.ORES.COAL.SCALE, z * worldConfig.ORES.COAL.SCALE);
            if (noiseCoal > worldConfig.ORES.COAL.THRESHOLD) return block_type.COAL_ORE;
        }
    
        if (y >= worldConfig.ORES.IRON.MIN_HEIGHT && y <= worldConfig.ORES.IRON.MAX_HEIGHT) {
            const noiseIron = simplexNoise.noise3D(x * worldConfig.ORES.IRON.SCALE, y * worldConfig.ORES.IRON.SCALE, z * worldConfig.ORES.IRON.SCALE);
            if (noiseIron > worldConfig.ORES.IRON.THRESHOLD) return block_type.IRON_ORE;
        }
    
        return null;
    }
}

let worldConfig;
let block_type;
let treeGenerator;
let client_config;
let simplexNoise;
// schemGenerationTree
let schematicHandler;

const TERRAIN_MODES = {
    BEAUTIFUL: true,
    FLAT: false
};

let currentMode = TERRAIN_MODES.BEAUTIFUL;

function setTerrainMode(mode) {
    currentMode = mode;
}


// Store chunks for block updates
const chunks = new Map();
const modifiedBlocks = new Map();
importScripts(
    './noise/simplex-noise.js',
    './schematic/schematic_handler.js'
);

self.onmessage = async function(e) {
    switch (e.data.type) {
        case 'init':
            try {
                worldConfig = e.data.server_config;
                client_config = e.data.client_config;
                block_type = e.data.block_type;
                simplexNoise = new self.SimplexNoise(e.data.seed);

                // Initialize schematic handler
                schematicHandler = new self.SchematicHandler(block_type);
                schematicHandler.setConfig(worldConfig, client_config.CHUNK_SIZE);

                // Load schematic file
                const response = await fetch('/src/web-worker/trees/patterns/tree.schem');
                const buffer = await response.arrayBuffer();

                const loadSuccess = await schematicHandler.loadSchematic(buffer, 'tree');

                // Initialize the handler
                await schematicHandler.initialize();
                console.log('5. SchematicHandler Initialization Complete');

                // Create tree generator
                console.log('6. Creating TreeGenerator');
                treeGenerator = new TreeGenerator(
                    worldConfig,
                    client_config,
                    block_type,
                    schematicHandler,
                    simplexNoise
                );

                caveGenerator = new CaveGenerator(worldConfig, simplexNoise);
                oreGenerator = new OreGenerator(worldConfig, simplexNoise);

                self.postMessage({
                    type: 'initialized',
                    success: true
                });
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    message: 'Failed to initialize worker: ' + error.message
                });
            }
            break;

        case 'applyModifications':
            const {
                modifications
            } = e.data;
            console.log(`Worker received ${modifications.length} modifications to apply`);

            modifications.forEach(mod => {
                const key = createModificationKey(mod.chunkX, mod.chunkY, mod.chunkZ, mod.localX, mod.localY, mod.localZ);
                if (key) {
                    modifiedBlocks.set(key, mod.blockType);

                    // Update existing chunk if loaded
                    const chunkKey = `${mod.chunkX},${mod.chunkY},${mod.chunkZ}`;
                    const chunk = chunks.get(chunkKey);
                    if (chunk) {
                        const index = getChunkIndex(mod.localX, mod.localY, mod.localZ);
                        if (index !== -1) {
                            chunk[index] = mod.blockType;
                            self.postMessage({
                                type: 'chunkUpdated',
                                chunk,
                                chunkX: mod.chunkX,
                                chunkY: mod.chunkY,
                                chunkZ: mod.chunkZ
                            });
                        }
                    }
                }
            });
            break;

        case 'generateChunk':
            const {
                chunkX: genChunkX, chunkY: genChunkY, chunkZ: genChunkZ
            } = e.data;
            const genChunk = generateChunk(genChunkX, genChunkY, genChunkZ);
            const genChunkKey = `${genChunkX},${genChunkY},${genChunkZ}`;

            // Store the chunk
            chunks.set(genChunkKey, genChunk);

            self.postMessage({
                type: 'chunkGenerated',
                chunk: genChunk,
                chunkX: genChunkX,
                chunkY: genChunkY,
                chunkZ: genChunkZ
            });
            break;

        case 'updateBlock':
            const {
                chunkX, chunkY, chunkZ, localX, localY, localZ, blockType
            } = e.data;
            const modKey = createModificationKey(chunkX, chunkY, chunkZ, localX, localY, localZ);

            if (modKey) { // Only proceed if the coordinates are valid
                modifiedBlocks.set(modKey, blockType);

                const chunkKey = `${chunkX},${chunkY},${chunkZ}`;
                const chunk = chunks.get(chunkKey);
                if (chunk) {
                    const index = getChunkIndex(localX, localY, localZ);
                    if (index !== -1) {
                        chunk[index] = blockType;
                        self.postMessage({
                            type: 'chunkUpdated',
                            chunk,
                            chunkX,
                            chunkY,
                            chunkZ
                        });
                    }
                }
            }
            break;


        case 'loadSchematic':
            if (schematicHandler) {
                try {
                    const {
                        buffer,
                        patternName,
                        metadata
                    } = e.data;
                    // Pass metadata directly to loadSchematic
                    const success = await schematicHandler.loadSchematic(buffer, patternName, metadata);

                    if (success) {
                        console.log(`Successfully loaded schematic: ${patternName}`);
                    }

                    self.postMessage({
                        type: 'schematicLoaded',
                        success,
                        patternName,
                        metadata: schematicHandler.getPatternMetadata(patternName)
                    });
                } catch (error) {
                    console.error('Error loading schematic:', error);
                    self.postMessage({
                        type: 'schematicError',
                        patternName: e.data.patternName,
                        error: error.message
                    });
                }
            }
            break;
    }
};

function createModificationKey(chunkX, chunkY, chunkZ, localX, localY, localZ) {
    // Validate coordinates before creating key
    if (localX < 0 || localX >= client_config.CHUNK_SIZE ||
        localY < 0 || localY >= client_config.CHUNK_SIZE ||
        localZ < 0 || localZ >= client_config.CHUNK_SIZE) {
        return null;
    }
    return `${chunkX},${chunkY},${chunkZ},${localX},${localY},${localZ}`;
}


function getChunkIndex(localX, localY, localZ) {
    if (localX < 0 || localX >= client_config.CHUNK_SIZE ||
        localY < 0 || localY >= client_config.CHUNK_SIZE ||
        localZ < 0 || localZ >= client_config.CHUNK_SIZE) {
        return -1;
    }
    return localX + 
           (localY * client_config.CHUNK_SIZE) + 
           (localZ * client_config.CHUNK_SIZE * client_config.CHUNK_SIZE);
}

function generateChunk(chunkX, chunkY, chunkZ) {
    const chunk = new Uint8Array(client_config.CHUNK_SIZE ** 3);
    
    const heightMap = new Array(client_config.CHUNK_SIZE * client_config.CHUNK_SIZE);
    const biomeMap = new Array(client_config.CHUNK_SIZE * client_config.CHUNK_SIZE);
    
    // Generate height and biome maps
    for (let x = 0; x < client_config.CHUNK_SIZE; x++) {
        for (let z = 0; z < client_config.CHUNK_SIZE; z++) {
            const worldX = chunkX * client_config.CHUNK_SIZE + x;
            const worldZ = chunkZ * client_config.CHUNK_SIZE + z;
            
            if (Math.abs(worldX) <= worldConfig.SIZE && Math.abs(worldZ) <= worldConfig.SIZE) {
                const index = x + z * client_config.CHUNK_SIZE;
                heightMap[index] = generateTerrainHeight(worldX, worldZ);
                biomeMap[index] = getBiomeType(worldX, worldZ);
            }
        }
    }

    const caveGenerator = new CaveGenerator(worldConfig, simplexNoise);

    // Generate caves within the chunk
    for (let x = 0; x < client_config.CHUNK_SIZE; x++) {
        for (let z = 0; z < client_config.CHUNK_SIZE; z++) {
            const worldX = chunkX * client_config.CHUNK_SIZE + x;
            const worldZ = chunkZ * client_config.CHUNK_SIZE + z;
            
            if (Math.abs(worldX) <= worldConfig.SIZE && Math.abs(worldZ) <= worldConfig.SIZE) {
                const heightMapIndex = x + z * client_config.CHUNK_SIZE;
                const height = heightMap[heightMapIndex];
                const biomeType = biomeMap[heightMapIndex];
    
                for (let y = 0; y < client_config.CHUNK_SIZE; y++) {
                    const worldY = chunkY * client_config.CHUNK_SIZE + y;
                    const index = x + y * client_config.CHUNK_SIZE + z * client_config.CHUNK_SIZE * client_config.CHUNK_SIZE;
    
                    if (worldY <= height) {
                        // Check for caves
                        if (!caveGenerator.generateCaves(worldX, worldY, worldZ)) {
                            const blockType = getBlockType(worldY, height, biomeType, worldConfig.WATER_LEVEL);
                            chunk[index] = blockType;
                        }
                    } else if (worldY <= worldConfig.WATER_LEVEL) {
                        chunk[index] = block_type.WATER;
                    }
                }
            }
        }
    }
    
    // Generate trees
    if (treeGenerator) {
        treeGenerator.generateTreesInChunk(chunk, chunkX, chunkY, chunkZ, heightMap, biomeMap);
    }

    applyStoredModifications(chunk, chunkX, chunkY, chunkZ);
    return chunk;
}

function generateTerrainHeight(x, z) {
    // Return base ground level if current mode is not set
    if (!currentMode) {
        return worldConfig.BASE_GROUND_LEVEL;
    }

    let noise = 0;
    let amplitude = worldConfig.TERRAIN.AMPLITUDE;
    let frequency = worldConfig.TERRAIN.FREQUENCY;
    const scale = worldConfig.TERRAIN.SCALE;
    const octaves = worldConfig.TERRAIN.OCTAVES;

    // Generate noise using multiple octaves
    for (let i = 0; i < octaves; i++) {
        noise += simplexNoise.noise2D(x * scale * frequency, z * scale * frequency) * amplitude;
        amplitude *= 0.5; // Halve the amplitude for each octave
        frequency *= 2;   // Double the frequency for each octave
    }

    // Normalize noise to range [0, 1]
    const normalizedNoise = (noise + 1) / 2;
    // Calculate surface height based on normalized noise
    const surfaceHeight = Math.floor(worldConfig.BASE_GROUND_LEVEL + normalizedNoise * worldConfig.TERRAIN_HEIGHT_RANGE);

    // Ensure the surface height does not exceed the maximum height
    return Math.min(surfaceHeight, worldConfig.MAX_HEIGHT);
}

function getBlockType(y, surfaceHeight, biomeType, waterLevel) {
    const isNearWater = Math.abs(surfaceHeight - waterLevel / 4) <= waterLevel; // Adjust this value to control beach size
    
    if (y <= waterLevel && y > surfaceHeight) {
        return block_type.WATER;
    }

    if (isNearWater && y >= surfaceHeight - 3 && y <= surfaceHeight) {
        return block_type.SAND;
    }

    switch (biomeType) {
        case 'forest':
            if (y === surfaceHeight) return block_type.GRASS;
            if (y > surfaceHeight - 4) return block_type.DIRT;
            return block_type.STONE; 
        case 'plains':
            if (y === surfaceHeight) return block_type.GRASS;
            if (y > surfaceHeight - 3) return block_type.DIRT;
            return block_type.STONE;
        case 'desert':
            if (y === surfaceHeight) return block_type.SAND;
            if (y > surfaceHeight - 3) return block_type.GRAVEL;
            return block_type.STONE;
        case 'mountains':
            if (y > surfaceHeight - 3) return block_type.STONE;
            if (y > surfaceHeight - 1) return block_type.SNOW;
            if (y > surfaceHeight - 5) return block_type.DIRT;
            return block_type.STONE;
        case 'swamp':
            if (y === surfaceHeight) return block_type.GRASS;
            if (y > surfaceHeight - 2) return block_type.DIRT;
            return block_type.STONE;
    }
}

function getBiomeType(x, z) {
    const biomeScale = 0.005;
    const biomeNoise = simplexNoise.noise2D(x * biomeScale, z * biomeScale);

    if (biomeNoise < -0.5) return 'desert';
    if (biomeNoise < 0) return 'forest';
    if (biomeNoise < 0.5) return 'plains';
    if (biomeNoise < 0.75) return 'swamp';
    return 'mountains';
}

//-----------------------------------------------------
//                      Server
//-----------------------------------------------------
// Function to apply stored modifications to a newly generated chunk
function applyStoredModifications(chunk, chunkX, chunkY, chunkZ) {
    const chunkPrefix = `${chunkX},${chunkY},${chunkZ}`;

    for (const [modKey, blockType] of modifiedBlocks.entries()) {
        if (modKey.startsWith(chunkPrefix)) {
            const [, , , localX, localY, localZ] = modKey.split(',').map(Number);
            const index = getChunkIndex(localX, localY, localZ);
            if (index !== -1) {
                chunk[index] = blockType;
            }
        }
    }
}

setTerrainMode(1);