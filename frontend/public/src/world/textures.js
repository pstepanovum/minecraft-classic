export class Texture {
    constructor(maxInstances, chunkSize) {
        this.textureLoader = new THREE.TextureLoader();
        this.textureAtlas = null;
        this.blockTextures = {};
        this.blockMaterials = {};
        this.MAX_INSTANCES = maxInstances;
        this.CHUNK_SIZE = chunkSize;
        
        // Reusable objects for mesh creation
        this.matrix = new THREE.Matrix4();
        this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        this.frustum = new THREE.Frustum();
        this.camera = null; // Assume camera is set later
    }

    setCamera(camera) {
        this.camera = camera;
    }

    createChunkMesh(chunk, chunkX, chunkY, chunkZ, scene) {
        if (!this.textureAtlas) {
            console.error('Textures not loaded yet');
            return null;
        }
    
        // Update frustum based on the camera
        if (this.camera) {
            const cameraViewProjectionMatrix = new THREE.Matrix4();
            cameraViewProjectionMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);
        }
    
        const chunkGroup = new THREE.Group();
        chunkGroup.name = `${chunkX},${chunkY},${chunkZ}`;
        const instances = this.createInstancedMeshes();
        const instanceCounts = this.processChunkData(chunk, chunkX, chunkY, chunkZ, instances);
    
        // Finalize and add the chunk mesh to the scene if there are visible blocks
        this.finalizeChunkMeshes(instances, instanceCounts, chunkGroup);
        if (Object.values(instanceCounts).reduce((a, b) => a + b, 0) > 0) {
            scene.add(chunkGroup);
            return { mesh: chunkGroup, data: chunk };
        }
    
        return null; // Skip adding empty or out-of-view chunks
    }
    

    createInstancedMeshes() {
        const instances = {};
        const materials = this.getAllMaterials();
    
        // Create a map for block type to material name
        const blockToMaterial = {
            // Basic Blocks
            [BlockType.GRASS]: 'grass',
            [BlockType.STONE]: 'stone',
            [BlockType.DIRT]: 'dirt',
            [BlockType.SAND]: 'sand',
            [BlockType.SNOW]: 'snow',
            [BlockType.WATER]: 'water',
            [BlockType.GRAVEL]: 'gravel',
            [BlockType.BEDROCK]: 'bedrock',
        
            // Ores
            [BlockType.COAL_ORE]: 'coal_ore',
            [BlockType.IRON_ORE]: 'iron_ore',
            [BlockType.GOLD_ORE]: 'gold_ore',
            [BlockType.DIAMOND_ORE]: 'diamond_ore',
            [BlockType.EMERALD_ORE]: 'emerald_ore',
            [BlockType.REDSTONE_ORE]: 'redstone_ore',
            [BlockType.LAPIS_ORE]: 'lapis_ore',
        
            // Nature
            [BlockType.SEAGRASS]: 'seagrass',
            [BlockType.LOG]: 'log',  
            [BlockType.WOOD]: 'wood',
            [BlockType.LEAVES]: 'leaves',
            [BlockType.PODZOL]: 'podzol',
            [BlockType.SEAGRASS]: 'seagrass',
        };
    
        // Ensure MAX_INSTANCES is within a reasonable range
        const MAX_SAFE_INSTANCES = 10000; // Adjust this value based on your application's needs
        if (this.MAX_INSTANCES > MAX_SAFE_INSTANCES) {
            console.warn(`MAX_INSTANCES (${this.MAX_INSTANCES}) exceeds safe limit (${MAX_SAFE_INSTANCES}). Limiting to ${MAX_SAFE_INSTANCES}.`);
            this.MAX_INSTANCES = MAX_SAFE_INSTANCES;
        }
    
        for (const [blockType, materialName] of Object.entries(blockToMaterial)) {
            if (!materials[materialName]) {
                console.warn(`Missing material for block type ${blockType}: ${materialName}`);
                continue;
            }
            instances[blockType] = new THREE.InstancedMesh(
                this.boxGeometry,
                materials[materialName],
                this.MAX_INSTANCES
            );
        }
    
        return instances;
    }

    processChunkData(chunk, chunkX, chunkY, chunkZ, instances) {
        const instanceCounts = {};
    
        for (let i = 0; i < chunk.length; i++) {
            const blockType = chunk[i];
            if (blockType !== BlockType.AIR && instances[blockType]) {
                const [x, y, z] = this.calculateBlockPosition(i);
                const worldPosition = this.calculateWorldPosition(x, y, z, chunkX, chunkY, chunkZ);
    
                // Check visibility of each face
                if (this.isBlockVisible(chunk, x, y, z)) {
                    this.matrix.setPosition(...worldPosition);
                    instances[blockType].setMatrixAt(instanceCounts[blockType] || 0, this.matrix);
                    instanceCounts[blockType] = (instanceCounts[blockType] || 0) + 1;
                }
            }
        }
    
        return instanceCounts;
    }

    isBlockVisible(chunk, x, y, z) {
        const size = this.CHUNK_SIZE;
    
        // Check each face for visibility
        if (x === 0 || chunk[(x - 1) + y * size + z * size * size] === BlockType.AIR) return true;
        if (x === size - 1 || chunk[(x + 1) + y * size + z * size * size] === BlockType.AIR) return true;
        if (y === 0 || chunk[x + (y - 1) * size + z * size * size] === BlockType.AIR) return true;
        if (y === size - 1 || chunk[x + (y + 1) * size + z * size * size] === BlockType.AIR) return true;
        if (z === 0 || chunk[x + y * size + (z - 1) * size * size] === BlockType.AIR) return true;
        if (z === size - 1 || chunk[x + y * size + (z + 1) * size * size] === BlockType.AIR) return true;
    
        return false;
    }

    calculateBlockPosition(index) {
        return [
            index % this.CHUNK_SIZE,
            Math.floor(index / this.CHUNK_SIZE) % this.CHUNK_SIZE,
            Math.floor(index / (this.CHUNK_SIZE * this.CHUNK_SIZE))
        ];
    }

    calculateWorldPosition(x, y, z, chunkX, chunkY, chunkZ) {
        // Offset by 0.5 to center blocks on grid lines
        return [
            chunkX * this.CHUNK_SIZE + x + 0.5,
            chunkY * this.CHUNK_SIZE + y + 0.5,
            chunkZ * this.CHUNK_SIZE + z + 0.5
        ];
    }

    finalizeChunkMeshes(instances, instanceCounts, chunkGroup) {
        for (const [blockType, mesh] of Object.entries(instances)) {
            mesh.count = instanceCounts[blockType] || 0;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.receiveShadow = true;
            mesh.castShadow = true;
            chunkGroup.add(mesh);
        }
    }

    async loadTextureAtlas(atlasPath) {
        return new Promise((resolve) => {
            this.textureLoader.load(
                atlasPath,
                (loadedTexture) => {
                    this.textureAtlas = loadedTexture;
                    this.initializeTextures();
                    this.initializeMaterials();
                    resolve();
                },
                undefined
            );
        });
    }

    createTextureFromAtlas(x, y, width, height) {
        const texture = this.textureAtlas.clone();
        const padding = 0.2;
        
        texture.repeat.set(
            (width - 2*padding) / this.textureAtlas.image.width, 
            (height - 2*padding) / this.textureAtlas.image.height
        );
        
        texture.offset.set(
            (x + padding) / this.textureAtlas.image.width, 
            1 - (y + height - padding) / this.textureAtlas.image.height
        );
        
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        
        // Special handling for leaves
        if (x === 64 && y === 48) {
            texture.premultiplyAlpha = true;
        }
        
        texture.needsUpdate = true;
        return texture;
    }

    initializeTextures() {
        this.blockTextures = {
            // Basic Blocks
            grass: {
                top: (() => {
                    const grassTopTexture = this.createTextureFromAtlas(0, 0, 16, 16);
                    grassTopTexture.colorSpace = THREE.SRGBColorSpace;
                    return grassTopTexture;
                })(),
                side: this.createTextureFromAtlas(48, 0, 16, 16),
                bottom: this.createTextureFromAtlas(32, 0, 16, 16)
            },
            stone: this.createTextureFromAtlas(16, 0, 16, 16),
            dirt: this.createTextureFromAtlas(32, 0, 16, 16),
            sand: this.createTextureFromAtlas(32, 16, 16, 16),
            snow: this.createTextureFromAtlas(32, 64, 16, 16),
            water: this.createTextureFromAtlas(224, 192, 16, 16),
            gravel: this.createTextureFromAtlas(48, 16, 16, 16),
            bedrock: this.createTextureFromAtlas(16, 16, 16, 16),

            // Ores
            coal_ore: this.createTextureFromAtlas(32, 32, 16, 16),
            iron_ore: this.createTextureFromAtlas(16, 32, 16, 16),
            gold_ore: this.createTextureFromAtlas(0, 32, 16, 16),
            diamond_ore: this.createTextureFromAtlas(48, 32, 16, 16),
            emerald_ore: this.createTextureFromAtlas(64, 32, 16, 16),
            redstone_ore: this.createTextureFromAtlas(80, 32, 16, 16),
            lapis_ore: this.createTextureFromAtlas(96, 32, 16, 16),

            // Terrain Variants
            podzol: this.createTextureFromAtlas(10, 352, 16, 16),
            seagrass: this.createTextureFromAtlas(0, 48, 16, 16),

            // Nature
            wood: this.createTextureFromAtlas(64, 16, 16, 16),
            log: { 
                top: (() => {
                    const logTopTexture = this.createTextureFromAtlas(80, 16, 16, 16);
                    logTopTexture.colorSpace = THREE.SRGBColorSpace;
                    return logTopTexture;
                })(),
                side: this.createTextureFromAtlas(64, 16, 16, 16),
                bottom: this.createTextureFromAtlas(80, 16, 16, 16)
            },
            leaves: (() => {
                const leafTexture = this.createTextureFromAtlas(64, 48, 16, 16);
                leafTexture.colorSpace = THREE.SRGBColorSpace;
                return leafTexture;
            })(),
        };
    }

    initializeMaterials() {
        this.blockMaterials = {};
        
        for (const [blockName, texture] of Object.entries(this.blockTextures)) {
            if (typeof texture === 'object' && texture.top) {
                if(blockName === 'grass') {
                    this.blockMaterials[blockName] = [
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ 
                            map: texture.top,
                            color: new THREE.Color(0x5E9D34),
                        }),
                        new THREE.MeshLambertMaterial({ map: texture.bottom}),
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.side })
                    ];
                } else if(blockName === 'log') {
                    this.blockMaterials[blockName] = [
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.top }),
                        new THREE.MeshLambertMaterial({ map: texture.bottom }),
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.side })
                    ];
                } else {
                    this.blockMaterials[blockName] = [
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.top }),
                        new THREE.MeshLambertMaterial({ map: texture.bottom || texture.top }),
                        new THREE.MeshLambertMaterial({ map: texture.side }),
                        new THREE.MeshLambertMaterial({ map: texture.side })
                    ];
                }
            } else {
                const materialOptions = { map: texture };
                
                if (blockName === 'leaves') {
                    materialOptions.transparent = true;
                    materialOptions.opacity = 0.8;
                    materialOptions.alphaTest = 0.1;
                    materialOptions.side = THREE.DoubleSide;
                    
                    this.blockMaterials[blockName] = new THREE.MeshLambertMaterial({
                        ...materialOptions,
                        color: new THREE.Color(0x80cf5a),
                    });
                    
                    this.blockMaterials[blockName].blending = THREE.CustomBlending;
                    this.blockMaterials[blockName].blendSrc = THREE.SrcAlphaFactor;
                    this.blockMaterials[blockName].blendDst = THREE.OneMinusSrcAlphaFactor;
                    
                } else if (blockName === 'water') {
                    materialOptions.transparent = true;
                    materialOptions.opacity = 0.3;
                    this.blockMaterials[blockName] = new THREE.MeshLambertMaterial(materialOptions);
                } else {
                    this.blockMaterials[blockName] = new THREE.MeshLambertMaterial(materialOptions);
                }
            }
        }
    }

    getBlockMaterial(blockType) {
        return this.blockMaterials[blockType];
    }

    getAllMaterials() {
        return this.blockMaterials;
    }

    dispose() {
        Object.values(this.blockTextures).forEach(texture => {
            if (texture instanceof THREE.Texture) {
                texture.dispose();
            } else if (texture.top) {
                texture.top.dispose();
                texture.side.dispose();
                texture.bottom?.dispose();
            }
        });

        Object.values(this.blockMaterials).forEach(material => {
            if (Array.isArray(material)) {
                material.forEach(m => m.dispose());
            } else {
                material.dispose();
            }
        });
    }
}


export const BlockType = {
    // Special Blocks
    AIR: 0,
    BEDROCK: 1,
    
    // Basic Blocks
    GRASS: 2,
    STONE: 3,
    DIRT: 4,
    SAND: 5,
    SNOW: 6,
    WATER: 7,

    // Ores
    COAL_ORE: 8,
    IRON_ORE: 9,
    GOLD_ORE: 10,
    DIAMOND_ORE: 11,
    EMERALD_ORE: 12,
    REDSTONE_ORE: 13,
    LAPIS_ORE: 14,

    // Terrain Variants
    PODZOL: 15,
    MUD: 16,
    RED_SAND: 17,
    GRAVEL: 18,
    CLAY: 19,
    
    // Grass Variants
    JUNGLE_GRASS: 20,
    SAVANNA_GRASS: 21,
    SNOW_GRASS: 22,
    
    // Nature
    SEAGRASS: 23,
    ICE: 24,
    LOG: 25,
    LEAVES: 26,
    WOOD: 27,
};