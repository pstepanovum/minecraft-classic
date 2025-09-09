// ==============================================================
// FILE: src/player/map.js
// ==============================================================

export function createMiniMap(scene, player) {
    const MINIMAP_SIZE = 250;
    const MINIMAP_PADDING = 20;
    const BORDER_RADIUS = '10px';
    const BACKGROUND_COLOR = 'rgba(0, 0, 0, 0.5)';
    const BORDER_COLOR = '#ffffff';

    let isMinimapVisible = false; // Initially hidden

    // Create minimap camera
    const miniMapCamera = new THREE.OrthographicCamera(
        -10, 10, 10, -10, 1, 1000
    );
    miniMapCamera.position.set(0, 250, 0);
    miniMapCamera.lookAt(0, 0, 0);

    // Create minimap renderer
    const miniMapRenderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true 
    });
    miniMapRenderer.setSize(MINIMAP_SIZE, MINIMAP_SIZE);
    
    // Style minimap container
    const minimapContainer = document.createElement('div');
    minimapContainer.style.position = 'absolute';
    minimapContainer.style.top = `${MINIMAP_PADDING}px`;
    minimapContainer.style.right = `${MINIMAP_PADDING}px`;
    minimapContainer.style.width = `${MINIMAP_SIZE}px`;
    minimapContainer.style.height = `${MINIMAP_SIZE}px`;
    minimapContainer.style.backgroundColor = BACKGROUND_COLOR;
    minimapContainer.style.borderRadius = BORDER_RADIUS;
    minimapContainer.style.padding = '10px';
    minimapContainer.style.border = `2px solid ${BORDER_COLOR}`;
    minimapContainer.style.transition = 'opacity 0.3s ease-in-out';
    minimapContainer.style.opacity = '0'; // Initially hidden
    minimapContainer.style.pointerEvents = 'none'; // Initially not interactive

    // Add minimap renderer to container
    minimapContainer.appendChild(miniMapRenderer.domElement);
    document.body.appendChild(minimapContainer);

    // Create compass
    const compass = document.createElement('div');
    compass.style.position = 'absolute';
    compass.style.top = '10px';
    compass.style.left = '10px';
    compass.style.color = '#ffffff';
    compass.style.fontWeight = 'bold';
    compass.style.fontSize = '16px';
    compass.textContent = 'N';
    minimapContainer.appendChild(compass);

    // Function to update compass direction
    function updateCompass() {
        const direction = -player.rotation.y * (180 / Math.PI);
        compass.style.transform = `rotate(${direction}deg)`;
    }

    // Function to toggle minimap visibility
    function toggleMinimap() {
        isMinimapVisible = !isMinimapVisible;
        minimapContainer.style.opacity = isMinimapVisible ? '1' : '0';
        minimapContainer.style.pointerEvents = isMinimapVisible ? 'auto' : 'none';
    }

    // Add event listener for 'M' or 'N' key press
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'M' || event.key.toLowerCase() === 'n') {
            toggleMinimap();
        }
    });

    // Main update function
    function updateMiniMap() {
        if (!isMinimapVisible) return;

        miniMapCamera.position.set(
            player.position.x,
            miniMapCamera.position.y,
            player.position.z
        );
        miniMapRenderer.render(scene, miniMapCamera);
        updateCompass();
    }

    return updateMiniMap;
}