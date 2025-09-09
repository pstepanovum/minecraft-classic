// ==============================================================
// FILE: src/web-worker/trees/schematic_loader.js
// ==============================================================

const SCHEMATIC_CONFIG = {
    defaultPatterns: ['tree'],
    fileExtensions: ['.schem'],
    minSize: 8,
    maxSize: 1024 * 1024 * 5, // 5MB limit
    requiredTags: ['Width', 'Height', 'Length', 'Palette', 'BlockData']
};

export function createTreePatternPath(treeName, options = {}) {
    const {
        basePath = '/src/web-worker/trees/patterns',
        extension = '.schem',
        variant = ''
    } = options;

    const variantPath = variant ? `/${variant}` : '';
    return `${basePath}${variantPath}/${treeName}${extension}`;
}

export function getDefaultPatterns() {
    return SCHEMATIC_CONFIG.defaultPatterns.map(name => ({
        name,
        path: createTreePatternPath(name),
        type: 'tree',
        variant: 'default'
    }));
}

export function validateSchematic(buffer) {
    try {
        if (!buffer || buffer.byteLength === 0) {
            return { valid: false, error: 'Empty buffer received' };
        }

        const view = new Uint8Array(buffer);
        const dataView = new DataView(buffer);
        
        // If it's GZIP compressed, we can't read the NBT directly
        if (view[0] === 0x1f && view[1] === 0x8b) {
            if (buffer.byteLength < 10) {
                return { valid: false, error: 'Invalid GZIP header size' };
            }
            console.log('Detected GZIP format - NBT data is compressed');
            // Note: We can't reliably read compressed data structures
            return { valid: true, compressed: true };
        }

        // For uncompressed NBT, try to read and log the basic structure
        if (buffer.byteLength < 3) {
            return { valid: false, error: 'Buffer too small for NBT header' };
        }

        // Print NBT data for uncompressed files
        console.log('Schematic Data:', {
            TagType: dataView.getInt8(0),
            NameLength: dataView.getInt16(1),
            // Basic header info
            Width: dataView.getInt16(13),
            Height: dataView.getInt16(11),
            Length: dataView.getInt16(9)
        });

        const tagType = dataView.getInt8(0);
        if (tagType !== 10) {
            return { valid: false, error: `Invalid NBT root tag type: ${tagType}` };
        }

        return { valid: true, compressed: false };
    } catch (error) {
        console.error('Schematic validation failed:', error);
        return { valid: false, error: error.message };
    }
}

export async function loadTreeSchematics(schematics, worker) {
    if (!worker) {
        console.error('Worker not initialized');
        return {
            success: false,
            loadedPatterns: [],
            errors: ['Worker not initialized']
        };
    }

    const loadedPatterns = new Set();
    const errors = [];
    const pendingLoads = new Map();

    async function loadSchematic(schematic) {
        try {
            console.log(`Attempting to load ${schematic.name} from ${schematic.path}`);
            
            // Ensure the path starts with a slash
            const path = schematic.path.startsWith('/') ? schematic.path : `/${schematic.path}`;
            
            const response = await fetch(path, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}, path: ${path}`);
            }
            
            const buffer = await response.arrayBuffer();
            console.log(`Loaded buffer size: ${buffer.byteLength} bytes`);
            
            if (!buffer || buffer.byteLength === 0) {
                throw new Error('Empty schematic file');
            }

            // Validate schematic
            const validationResult = validateSchematic(buffer);
            console.log(`Validation result:`, validationResult);
            
            if (!validationResult.valid) {
                throw new Error(`Invalid schematic format: ${validationResult.error}`);
            }

            // Clone buffer before sending
            const clonedBuffer = buffer.slice(0);
            
            return new Promise((resolve) => {
                const messageHandler = (e) => {
                    if (e.data.type === 'schematicLoaded' && 
                        e.data.patternName === schematic.name) {
                        worker.removeEventListener('message', messageHandler);
                        if (e.data.success) {
                            loadedPatterns.add(schematic.name);
                            console.log(`Successfully loaded ${schematic.name}`);
                        }
                        resolve(e.data.success);
                    }
                };
                
                worker.addEventListener('message', messageHandler);
                
                // Send to worker
                worker.postMessage({
                    type: 'loadSchematic',
                    buffer: clonedBuffer,
                    patternName: schematic.name,
                    metadata: {
                        type: 'tree',
                        variant: 'default',
                        compressed: validationResult.compressed
                    }
                }, [clonedBuffer]);
            });

        } catch (error) {
            errors.push({
                name: schematic.name,
                error: error.message,
                path: schematic.path
            });
            console.warn(`Failed to load tree pattern ${schematic.name}:`, error);
            return false;
        }
    }

    // Load schematics sequentially
    for (const schematic of schematics) {
        await loadSchematic(schematic);
    }

    return {
        success: loadedPatterns.size > 0,
        loadedPatterns: Array.from(loadedPatterns),
        errors,
        stats: {
            totalAttempted: schematics.length,
            successfulLoads: loadedPatterns.size,
            failedLoads: errors.length,
            timestamp: new Date().toISOString()
        }
    };
}
