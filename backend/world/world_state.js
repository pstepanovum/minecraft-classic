// world/world_state.js
class BlockModificationTracker {
    constructor() {
        // Store modifications by absolute position instead of chunks
        // Format: "x,y,z" => blockType
        this.modifications = new Map();
    }

    trackModification(position, blockType) {
        // Round positions to integers to ensure consistent keys
        const x = Math.floor(position.x);
        const y = Math.floor(position.y);
        const z = Math.floor(position.z);
        
        const positionKey = `${x},${y},${z}`;

        if (blockType === 0) {
            // Store removed blocks
            this.modifications.set(positionKey, blockType);
        } else {
            // Store added/modified blocks
            this.modifications.set(positionKey, blockType);
        }
    }

    getModifications() {
        const modifications = [];
        
        this.modifications.forEach((blockType, positionKey) => {
            const [x, y, z] = positionKey.split(',').map(Number);
            
            modifications.push({
                position: { x, y, z },
                blockType
            });
        });

        return modifications;
    }

    // Optional: Get modifications within a region
    getModificationsInRegion(minPos, maxPos) {
        const modifications = [];
        
        this.modifications.forEach((blockType, positionKey) => {
            const [x, y, z] = positionKey.split(',').map(Number);
            
            if (x >= minPos.x && x <= maxPos.x &&
                y >= minPos.y && y <= maxPos.y &&
                z >= minPos.z && z <= maxPos.z) {
                modifications.push({
                    position: { x, y, z },
                    blockType
                });
            }
        });

        return modifications;
    }

    clear() {
        this.modifications.clear();
    }
}

const worldState = new BlockModificationTracker();
module.exports = {
    BlockModificationTracker,
    worldState
};