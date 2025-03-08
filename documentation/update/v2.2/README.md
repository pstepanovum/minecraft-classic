## Update v2.2

This update introduces several major improvements to our Minecraft-style training world, focusing on map containment, NPC behavior, physics systems, and performance optimization.

### Map Boundaries System

We've implemented a comprehensive boundary system that creates invisible barriers at map edges. The system effectively contains both NPCs and players within the intended play area while maintaining immersion.

### NPC Block Interaction

Fixed critical issues with the NPC block interaction system. NPCs can now successfully remove and place blocks in the game world with clear visual feedback.

### Physics System Refactoring

Improved our physics implementation with a centralized engine for shared functionality while maintaining specialized NPC physics for optimal behavior.

### Performance Optimization

Significantly enhanced rendering performance through memory management improvements and simplification of the rendering pipeline, resulting in dramatically improved framerates.

## Installation

1. Clone this repository
2. Run `npm install`
3. Start the server with `npm start`

## Configuration

Adjust the world settings in `TRAINING_WORLD_CONFIG.js` to customize your experience.

## Controls

- WASD: Movement
- Space: Jump
- E: Interact
- G: Debug NPC block interaction
- V: Test direct block manipulation
- B: Create test blocks

## License

MIT

## Contact

For issues or suggestions, please create an issue in this repository.