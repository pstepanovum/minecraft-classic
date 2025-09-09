// ==============================================================
// FILE: src/player/inventory.js
// ==============================================================

import { BlockType } from '../world/textures.js';

/**
 * TODO List for Inventory System:
 * 
 * Priority Features:
 * - [ ] Implement drag and drop functionality
 *     - [ ] Add visual feedback during drag
 *     - [ ] Handle item stacking
 *     - [ ] Add swap functionality
 *     - [ ] Handle drag cancellation
 * 
 * Item Management:
 * - [ ] Add right-click to split stacks
 * - [ ] Implement shift-click for quick transfer between inventories
 * - [ ] Add double-click to collect similar items
 * - [ ] Implement max stack sizes (64 for most items)
 * 
 * UI Improvements:
 * - [ ] Add item tooltips on hover
 * - [ ] Improve visual feedback for empty slots
 * - [ ] Add animations for item movement
 * - [ ] Make inventory grid more responsive
 * 
 * New Features:
 * - [ ] Add crafting system
 *     - [ ] Create crafting grid
 *     - [ ] Implement recipe system
 *     - [ ] Add result slot
 * - [ ] Add armor slots
 * - [ ] Add offhand slot
 * - [ ] Implement creative mode inventory tabs
 * 
 * Technical Improvements:
 * - [ ] Add item data persistence
 * - [ ] Implement inventory serialization
 * - [ ] Add network sync for multiplayer
 * - [ ] Optimize UI updates
 * 
 * Polish:
 * - [ ] Add sound effects for inventory actions
 * - [ ] Improve drag and drop animations
 * - [ ] Add item rarity colors
 * - [ ] Implement proper item tooltips
 * 
 * Integration:
 * - [ ] Connect with save system
 * - [ ] Add multiplayer synchronization
 * - [ ] Implement creative mode tabs
 * - [ ] Add inventory events/hooks system
 */

/**
 * @fileoverview This file defines the Inventory class, which manages the player's inventory and hotbar in the game.
 * It includes methods for creating and updating the inventory UI, handling user interactions, and managing inventory slots.
 */

/**
 * Represents the player's inventory and hotbar.
 * @class
 */

class Inventory {
    constructor() {
        this.hotbarSize = 9;
        this.inventorySize = 27; // 3 rows of 9
        this.selectedSlot = 0;
        this.isInventoryOpen = false;

        // Initialize hotbar
        this.hotbar = [
            { blockType: BlockType.GRASS, count: 64 },
            { blockType: BlockType.STONE, count: 64 },
            { blockType: BlockType.DIRT, count: 64 },
            { blockType: BlockType.SAND, count: 64 },
            { blockType: BlockType.SNOW, count: 64 },
            { blockType: BlockType.BEDROCK, count: 64 },
            { blockType: BlockType.LOG, count: 64 },
            { blockType: BlockType.LEAVES, count: 64 },
            { blockType: BlockType.GRAVEL, count: 64 }
        ];

        /**
         * TODO: Additional Properties Needed:
         * - draggedItem: For drag and drop
         * - maxStackSize: For item stacking limits
         * - creativeMode: For creative inventory features
         * - selectedTab: For creative mode tabs
         */

        // Initialize main inventory
        this.inventory = new Array(this.inventorySize).fill(null).map(() => ({ blockType: null, count: 0 }));

        this.createHotbarUI();
        this.createInventoryUI();
        this.initializeEventListeners();

        /**
         * TODO: Required New Methods:
         * - handleDragStart(slot, event)
         * - handleDragEnd(slot, event)
         * - handleDragOver(slot, event)
         * - splitStack(slot, amount)
         * - quickTransfer(slot)
         * - collectSimilarItems(itemType)
         */
    }

    /**
     * TODO: Required New Classes:
     * 
     * class InventorySlot {
     *     - Handle individual slot logic
     *     - Manage item stacks
     *     - Handle slot restrictions
     * }
     * 
     * class CraftingGrid {
     *     - Manage crafting slots
     *     - Check recipes
     *     - Handle crafting result
     * }
     * 
     * class CreativeInventory {
     *     - Manage creative tabs
     *     - Handle infinite items
     *     - Filter items by category
     * }
     */

    createHotbarUI() {
        const hotbar = document.createElement('div');
        hotbar.id = 'hotbar';
        hotbar.className = 'hotbar';
        
        for (let i = 0; i < this.hotbarSize; i++) {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot';
            if (i === this.selectedSlot) {
                slot.classList.add('selected');
            }

            const item = this.hotbar[i];
            if (item) {
                // Create item icon
                const icon = document.createElement('div');
                icon.className = `block-icon block-type-${item.blockType}`;
                slot.appendChild(icon);

                // Create stack count
                const count = document.createElement('span');
                count.className = 'stack-count';
                count.textContent = item.count.toString();
                slot.appendChild(count);

                // Add keybind hint
                const keybind = document.createElement('span');
                keybind.className = 'keybind-hint';
                keybind.textContent = (i + 1).toString();
                slot.appendChild(keybind);
            }

            hotbar.appendChild(slot);
        }

        document.body.appendChild(hotbar);
        this.hotbarElement = hotbar;
    }

    updateInventoryUI() {
        // Update inventory slots
        const slots = this.inventoryElement.getElementsByClassName('inventory-slot');
        for (let i = 0; i < this.inventorySize; i++) {
            const slot = slots[i];
            const item = this.inventory[i];
            
            slot.innerHTML = '';
            if (item && item.blockType !== null) {
                // Create item icon
                const icon = document.createElement('div');
                icon.className = `block-icon block-type-${item.blockType}${item.count === 0 ? ' empty' : ''}`;
                slot.appendChild(icon);

                if (item.count > 0) {
                    const count = document.createElement('span');
                    count.className = 'stack-count';
                    count.textContent = item.count.toString();
                    slot.appendChild(count);
                }
            }
        }

        // Update hotbar reference
        const hotbarSlots = this.inventoryElement.getElementsByClassName('hotbar-ref');
        for (let i = 0; i < this.hotbarSize; i++) {
            const slot = hotbarSlots[i];
            const item = this.hotbar[i];
            
            slot.innerHTML = '';
            if (item) {
                const icon = document.createElement('div');
                icon.className = `block-icon block-type-${item.blockType}${item.count === 0 ? ' empty' : ''}`;
                slot.appendChild(icon);

                if (item.count > 0) {
                    const count = document.createElement('span');
                    count.className = 'stack-count';
                    count.textContent = item.count.toString();
                    slot.appendChild(count);
                }
            }
        }
    }

    createInventoryUI() {
        // Create inventory container
        const inventoryContainer = document.createElement('div');
        inventoryContainer.id = 'inventory-container';
        inventoryContainer.className = 'inventory-container';
        inventoryContainer.style.display = 'none';

        // Create inventory grid
        const grid = document.createElement('div');
        grid.className = 'inventory-grid';

        // Create inventory slots
        for (let i = 0; i < this.inventorySize; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.index = i;

            // Add click event for inventory management
            slot.addEventListener('click', (e) => this.handleInventoryClick(i));

            grid.appendChild(slot);
        }

        // Add hotbar reference at the bottom
        const hotbarRef = document.createElement('div');
        hotbarRef.className = 'inventory-hotbar-ref';
        for (let i = 0; i < this.hotbarSize; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot hotbar-ref';
            slot.dataset.index = `hotbar-${i}`;
            hotbarRef.appendChild(slot);
        }

        inventoryContainer.appendChild(grid);
        inventoryContainer.appendChild(hotbarRef);
        document.body.appendChild(inventoryContainer);
        this.inventoryElement = inventoryContainer;
    }

    toggleInventory() {
        this.isInventoryOpen = !this.isInventoryOpen;
        this.inventoryElement.style.display = this.isInventoryOpen ? 'flex' : 'none';
        
        // Handle pointer lock
        if (this.isInventoryOpen) {
            document.exitPointerLock();
        }
        
        this.updateInventoryUI();
    }


    handleInventoryClick(index) {
        // Implement inventory management logic here
        console.log(`Clicked inventory slot ${index}`);
    }

    initializeEventListeners() {
        // Handle scroll wheel
        window.addEventListener('wheel', (e) => {
            if (document.pointerLockElement && !this.isInventoryOpen) {
                if (e.deltaY < 0) {
                    this.selectPreviousSlot();
                } else {
                    this.selectNextSlot();
                }
            }
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                this.toggleInventory();
            } else if (!this.isInventoryOpen) {
                const num = parseInt(e.key);
                if (num >= 1 && num <= 9) {
                    this.selectSlot(num - 1);
                }
            }
        });

        // Close inventory on escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isInventoryOpen) {
                this.toggleInventory();
            }
        });
    }

    selectSlot(index) {
        if (index < 0 || index >= this.hotbarSize) return;

        // Remove selected class from current slot
        const currentSlot = this.hotbarElement.children[this.selectedSlot];
        currentSlot.classList.remove('selected');

        // Add selected class to new slot
        this.selectedSlot = index;
        const newSlot = this.hotbarElement.children[this.selectedSlot];
        newSlot.classList.add('selected');
    }

    selectNextSlot() {
        this.selectSlot((this.selectedSlot + 1) % this.hotbarSize);
    }

    selectPreviousSlot() {
        this.selectSlot((this.selectedSlot - 1 + this.hotbarSize) % this.hotbarSize);
    }

    getSelectedBlockType() {
        const selectedSlot = this.hotbar[this.selectedSlot];
        return selectedSlot && selectedSlot.count > 0 ? selectedSlot.blockType : null;
    }


    updateSlot(index, blockType, count) {
        if (index < 0 || index >= this.hotbarSize) return;

        // Ensure count doesn't go negative
        const validCount = Math.max(0, count);

        this.hotbar[index] = { blockType, count: validCount };
        
        // Update UI
        const slot = this.hotbarElement.children[index];
        slot.innerHTML = ''; // Clear slot

        // Only show slot contents if count > 0
        if (validCount > 0) {
            // Add icon
            const icon = document.createElement('div');
            icon.className = `block-icon block-type-${blockType}`;
            slot.appendChild(icon);

            // Add stack count
            const stackCount = document.createElement('span');
            stackCount.className = 'stack-count';
            stackCount.textContent = validCount.toString();
            slot.appendChild(stackCount);

            // Add keybind hint
            const keybind = document.createElement('span');
            keybind.className = 'keybind-hint';
            keybind.textContent = (index + 1).toString();
            slot.appendChild(keybind);
        }
    }
}

const style = document.createElement('style');
style.textContent = `
    /* Base inventory styling */
    .inventory-container {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #727272;
        padding: min(1vw, 5px);
        border-radius: min(1vw, 5px);
        display: flex;
        flex-direction: column;
        gap: min(2vw, 10px);
        z-index: 1001;
        width: min(90vw, 600px); /* Maximum width */
        box-sizing: border-box;
    }

    .inventory-grid {
        display: grid;
        grid-template-columns: repeat(9, 1fr);
        gap: min(0.8vw, 4px);
        padding: min(2vw, 10px);
        background: #727272;
        border-radius: min(0.2vw, 1px);
        width: 100%;
        box-sizing: border-box;
    }

    .inventory-slot {
        width: min(10vw, 50px);
        height: min(10vw, 50px);
        background: #8b8b8b;
        border: min(0.4vw, 2px) solid #373737;
        border-radius: min(0.8vw, 4px);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        aspect-ratio: 1;
    }

    .inventory-slot:hover {
        border-color: #fff;
        background: #a8a8a8;
    }

    .inventory-hotbar-ref {
        display: grid;
        grid-template-columns: repeat(9, 1fr);
        gap: min(0.8vw, 4px);
        padding: min(2vw, 10px);
        background: #727272;
        border-radius: min(0.8vw, 4px);
        margin-top: min(2vw, 10px);
        width: 100%;
        box-sizing: border-box;
    }

    /* Hotbar styling */
    .hotbar {
        position: fixed;
        bottom: min(6vh, 30px);
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: min(0.8vw, 4px);
        padding: min(0.8vw, 4px);
        background: #727272;
        border-radius: min(1.6vw, 8px);
        z-index: 1000;
    }

    .hotbar-slot {
        width: min(10vw, 50px);
        height: min(10vw, 50px);
        background: #8b8b8b;
        border: min(0.4vw, 2px) solid #8b8b8b;
        border-radius: min(0.8vw, 4px);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        aspect-ratio: 1;
    }

    .hotbar-slot.selected {
        border-color: #fff;
        background: #a8a8a8;
    }

    /* Block icons */
    .block-icon {
        width: 80%;
        height: 80%;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        image-rendering: pixelated;
    }

    /* Text elements */
    .stack-count {
        position: absolute;
        bottom: min(0.4vw, 2px);
        right: min(0.4vw, 2px);
        color: white;
        font-size: min(2vw, 10px);
        text-shadow: min(0.4vw, 2px) min(0.4vw, 2px) 0 #000;
        font-weight: bold;
    }

    .keybind-hint {
        position: absolute;
        top: min(0.4vw, 2px);
        left: min(0.4vw, 2px);
        color: #aaa;
        font-size: min(2vw, 10px);
        opacity: 0.7;
    }

    /* Media queries for different screen sizes */
    @media (max-width: 768px) {
        .inventory-container {
            width: 95vw;
        }
        
        .stack-count {
            font-size: min(2.5vw, 10px);
        }
        
        .keybind-hint {
            font-size: min(2.5vw, 10px);
        }
    }

    @media (max-height: 600px) {
        .inventory-container {
            height: 90vh;
            overflow-y: auto;
        }
    }

    /* Block type classes remain the same */
    .block-type-${BlockType.GRASS} { background-image: url('/src/player/texture-inventory/grass.png'); }
    .block-type-${BlockType.STONE} { background-image: url('/src/player/texture-inventory/stone.png'); }
    .block-type-${BlockType.DIRT} { background-image: url('/src/player/texture-inventory/dirt.png'); }
    .block-type-${BlockType.SAND} { background-image: url('/src/player/texture-inventory/sand.png'); }
    .block-type-${BlockType.SNOW} { background-image: url('/src/player/texture-inventory/snow.png'); }
    .block-type-${BlockType.BEDROCK} { background-image: url('/src/player/texture-inventory/bedrock.png'); }
    .block-type-${BlockType.LOG} { background-image: url('/src/player/texture-inventory/log.png'); }
    .block-type-${BlockType.LEAVES} { background-image: url('/src/player/texture-inventory/leaves.png'); }
    .block-type-${BlockType.GRAVEL} { background-image: url('/src/player/texture-inventory/gravel.png'); }
`;
document.head.appendChild(style);

export { Inventory };