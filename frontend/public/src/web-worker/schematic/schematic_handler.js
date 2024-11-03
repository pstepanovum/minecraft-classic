// web-worker/schematic/schematic_handler.js
importScripts('https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako.min.js');

(function(global) {
    class SchematicHandler {
        constructor(blockTypes) {
            this.worldConfig = null;
            this.blockTypes = blockTypes;
            this.patterns = new Map();
            this.initialized = false;
            this.patternMetadata = new Map();

            this.NBT_TYPES = {
                END: 0,
                BYTE: 1,
                SHORT: 2,
                INT: 3,
                LONG: 4,
                FLOAT: 5,
                DOUBLE: 6,
                BYTE_ARRAY: 7,
                STRING: 8,
                LIST: 9,
                COMPOUND: 10,
                INT_ARRAY: 11,
                LONG_ARRAY: 12
            };

            this.BLOCK_MAPPING = {
                'minecraft:spruce_wood[axis=z]': this.blockTypes.LOG,
                'minecraft:spruce_wood[axis=y]': this.blockTypes.LOG,
                'minecraft:spruce_leaves[distance=3,persistent=false]': this.blockTypes.LEAVES,
                'minecraft:spruce_wood[axis=x]': this.blockTypes.LOG,
                'minecraft:spruce_fence[east=true,north=false,south=false,waterlogged=false,west=false]': 0,
                'minecraft:spruce_fence[east=false,north=true,south=false,waterlogged=false,west=false]': 0,
                'minecraft:dirt': this.blockTypes.DIRT,
                'minecraft:spruce_leaves[distance=5,persistent=true]': this.blockTypes.LEAVES,
                'minecraft:spruce_leaves[distance=2,persistent=false]': this.blockTypes.LEAVES,
                'minecraft:spruce_leaves[distance=1,persistent=true]': this.blockTypes.LEAVES,
                'minecraft:spruce_fence[east=false,north=false,south=true,waterlogged=false,west=false]': 0,
                'minecraft:spruce_leaves[distance=5,persistent=false]': this.blockTypes.LEAVES,
                'minecraft:spruce_fence[east=false,north=true,south=true,waterlogged=false,west=false]': 0,
                'minecraft:spruce_log[axis=z]': this.blockTypes.LOG,
                'minecraft:spruce_log[axis=y]': this.blockTypes.LOG,
                'minecraft:air': 0,
                'minecraft:spruce_log[axis=x]': this.blockTypes.LOG,
                'minecraft:spruce_leaves[distance=4,persistent=false]': this.blockTypes.LEAVES,
                'minecraft:spruce_leaves[distance=4,persistent=true]': this.blockTypes.LEAVES,
                'minecraft:spruce_leaves[distance=6,persistent=false]': this.blockTypes.LEAVES,
                'minecraft:spruce_leaves[distance=1,persistent=false]': this.blockTypes.LEAVES,
                'minecraft:spruce_fence[east=false,north=false,south=false,waterlogged=false,west=true]': 0
            };
        }

        setConfig(worldConfig) {
            this.worldConfig = worldConfig;
        }

        getAvailablePatterns() {
            return Array.from(this.patterns.keys());
        }

        getPatternMetadata(patternName = null) {
            if (patternName) {
                return this.patternMetadata.get(patternName) || null;
            }
            return Object.fromEntries(this.patternMetadata);
        }

        hasSchematics() {
            return this.patterns.size > 0;
        }

        getPattern(patternName) {
            return this.patterns.get(patternName);
        }

        async initialize() {
            if (this.initialized) return;
            
            try {
                const success = await this.loadDefaultPattern('tree');
                this.initialized = success;
                if (success) {
                    console.log('Tree patterns initialized successfully');
                }
            } catch (error) {
                console.error('Failed to initialize tree patterns:', error);
                this.initialized = false;
            }
        }

        async loadDefaultPattern(treeName) {
            try {
                const response = await fetch(`/src/web-worker/trees/patterns/${treeName}.schem`);
                if (!response.ok) {
                    console.warn(`${treeName} pattern not found, skipping...`);
                    return false;
                }
                const buffer = await response.arrayBuffer();
                return await this.loadSchematic(buffer, treeName);
            } catch (error) {
                console.error(`Failed to load ${treeName} pattern:`, error);
                return false;
            }
        }

        async loadSchematic(buffer, patternName) {
            try {
                console.log(`Loading schematic for pattern: ${patternName}`);
                const pattern = await this.parseModernSchematic(buffer);
                if (pattern) {
                    const optimized = this.optimizePattern(pattern, patternName); // Pass patternName here
                    this.patterns.set(patternName, optimized);
                    return optimized.blocks.length > 0;
                }
                return false;
            } catch (error) {
                console.error('Error loading schematic:', error);
                return false;
            }
        }

        async parseModernSchematic(buffer) {
            console.log('Starting to parse schematic file...');
            
            const firstByte = new DataView(buffer).getUint8(0);
            const secondByte = new DataView(buffer).getUint8(1);
            if (firstByte === 0x1F && secondByte === 0x8B) {
                console.log('Detected GZIP format, decompressing...');
                buffer = pako.ungzip(new Uint8Array(buffer)).buffer;
                console.log('Decompression complete');
            }

            const dataView = new DataView(buffer);
            let offset = 0;

            const readByte = () => dataView.getInt8(offset++);
            const readShort = () => {
                const val = dataView.getInt16(offset, false);
                offset += 2;
                return val;
            };
            const readInt = () => {
                const val = dataView.getInt32(offset, false);
                offset += 4;
                return val;
            };
            const readString = () => {
                const length = readShort();
                const bytes = new Uint8Array(buffer, offset, length);
                offset += length;
                return new TextDecoder().decode(bytes);
            };
            const readByteArray = () => {
                const length = readInt();
                const array = new Uint8Array(buffer, offset, length);
                offset += length;
                return array;
            };
            const readIntArray = () => {
                const length = readInt();
                const array = new Int32Array(length);
                for (let i = 0; i < length; i++) {
                    array[i] = readInt();
                }
                return array;
            };

            const readCompound = () => {
                const compound = {};
                while (true) {
                    const type = readByte();
                    if (type === this.NBT_TYPES.END) break;
                    const name = readString();
                    compound[name] = readTag(type);
                }
                return compound;
            };

            const readList = () => {
                const type = readByte();
                const length = readInt();
                const list = [];
                for (let i = 0; i < length; i++) {
                    list.push(readTag(type));
                }
                return list;
            };

            const readTag = (type) => {
                switch (type) {
                    case this.NBT_TYPES.BYTE: return readByte();
                    case this.NBT_TYPES.SHORT: return readShort();
                    case this.NBT_TYPES.INT: return readInt();
                    case this.NBT_TYPES.STRING: return readString();
                    case this.NBT_TYPES.LIST: return readList();
                    case this.NBT_TYPES.COMPOUND: return readCompound();
                    case this.NBT_TYPES.BYTE_ARRAY: return readByteArray();
                    case this.NBT_TYPES.INT_ARRAY: return readIntArray();
                    default: throw new Error(`Unsupported tag type: ${type}`);
                }
            };

            try {
                const rootType = readByte();
                if (rootType !== this.NBT_TYPES.COMPOUND) {
                    throw new Error('Invalid schematic format: Expected compound tag');
                }
                readString(); // Skip root name
                const schematic = readCompound();

                if (!schematic.Width || !schematic.Height || !schematic.Length || !schematic.Palette || !schematic.BlockData) {
                    throw new Error('Invalid schematic: Missing required fields');
                }

                return {
                    dimensions: {
                        width: schematic.Width,
                        height: schematic.Height,
                        length: schematic.Length
                    },
                    palette: schematic.Palette,
                    blockData: Array.from(schematic.BlockData),
                    offset: {
                        x: schematic.Metadata?.WEOffsetX || 0,
                        y: schematic.Metadata?.WEOffsetY || 0,
                        z: schematic.Metadata?.WEOffsetZ || 0
                    }
                };
            } catch (error) {
                console.error('Error parsing modern schematic:', error);
                throw error;
            }
        }

        optimizePattern(pattern, patternName) {
            const optimized = {
                dimensions: pattern.dimensions,
                blocks: [],
                centerOffset: {
                    x: Math.floor(pattern.dimensions.width / 2) + (pattern.offset?.x || 0),
                    y: pattern.offset?.y || 0,
                    z: Math.floor(pattern.dimensions.length / 2) + (pattern.offset?.z || 0)
                }
            };

            // Store metadata for debugging
            this.patternMetadata.set(patternName, {
                dimensions: pattern.dimensions,
                offset: pattern.offset,
                centerOffset: optimized.centerOffset,
                blockCount: pattern.blockData.length
            });

            for (let y = 0; y < pattern.dimensions.height; y++) {
                for (let z = 0; z < pattern.dimensions.length; z++) {
                    for (let x = 0; x < pattern.dimensions.width; x++) {
                        const index = x + (z * pattern.dimensions.width) + 
                                     (y * pattern.dimensions.width * pattern.dimensions.length);
                        const blockId = pattern.blockData[index];

                        if (blockId !== 0) {
                            const blockType = this.convertModernBlock(blockId, pattern.palette);
                            if (blockType) {
                                // Apply offset correction
                                const offsetX = x - optimized.centerOffset.x;
                                const offsetY = y - optimized.centerOffset.y;
                                const offsetZ = z - optimized.centerOffset.z;
                                
                                optimized.blocks.push({
                                    x: offsetX,
                                    y: offsetY,
                                    z: offsetZ,
                                    type: blockType,
                                    originalIndex: index
                                });
                            }
                        }
                    }
                }
            }

            return optimized;
        }

        convertModernBlock(paletteIndex, palette) {
            const blockEntry = Object.entries(palette).find(([_, index]) => index === paletteIndex);
            if (!blockEntry) return null;

            const [blockId, blockState] = blockEntry[0].split('[');
            const fullBlockId = blockState ? `${blockId}[${blockState}` : blockId;
            return this.BLOCK_MAPPING[fullBlockId] || this.BLOCK_MAPPING[blockId] || null;
        }
    }

    global.SchematicHandler = SchematicHandler;
})(self);