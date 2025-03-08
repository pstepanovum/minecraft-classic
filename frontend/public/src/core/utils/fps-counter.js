// src/core/utils/fps-counter.js

export function getFPSCounter() {
    // Create a simple FPS display element
    const fpsDisplay = document.createElement('div');
    fpsDisplay.id = 'fps-counter';
    fpsDisplay.style.position = 'fixed';
    fpsDisplay.style.top = '100px'; // Position below notifications
    fpsDisplay.style.left = '10px';
    fpsDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    fpsDisplay.style.color = '#00FF00';
    fpsDisplay.style.fontFamily = 'monospace';
    fpsDisplay.style.fontSize = '14px'; // Slightly smaller font
    fpsDisplay.style.padding = '6px 12px';
    fpsDisplay.style.borderRadius = '5px';
    fpsDisplay.style.zIndex = '999'; // Below notifications but above other elements
    fpsDisplay.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    fpsDisplay.style.border = '1px solid rgba(0, 255, 0, 0.3)';
    fpsDisplay.textContent = 'FPS: --';
    document.body.appendChild(fpsDisplay);

    // FPS calculation variables
    let frames = 0;
    let lastTime = performance.now();
    
    // Return the update function
    return function update() {
        // Count frames
        frames++;
        
        // Calculate FPS every second
        const now = performance.now();
        const elapsed = now - lastTime;
        
        if (elapsed >= 1000) {
            const fps = Math.round((frames * 1000) / elapsed);
            
            // Color-code the FPS value based on performance
            let fpsColor = '#00FF00'; // Default green for good performance
            if (fps < 30) {
                fpsColor = '#FF0000'; // Red for poor performance
            } else if (fps < 50) {
                fpsColor = '#FFFF00'; // Yellow for medium performance
            }
            
            fpsDisplay.innerHTML = `FPS: <span style="color: ${fpsColor}">${fps}</span>`;
            
            // Reset counters
            frames = 0;
            lastTime = now;
        }
    };
}