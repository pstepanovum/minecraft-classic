export function createMiniMap(scene, player) {
    const MINIMAP_SIZE = 250;
    const MINIMAP_PADDING = 20;
    const PLAYER_DOT_SIZE = 8;
    const BORDER_RADIUS = '10px';
    const BACKGROUND_COLOR = 'rgba(0, 0, 0, 0.5)';
    const BORDER_COLOR = '#ffffff';

    let isMinimapVisible = true;

    // Create minimap camera
    const miniMapCamera = new THREE.OrthographicCamera(
        -75, 75, 75, -75, 1, 1000
    );
    miniMapCamera.position.set(0, 150, 0);
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

    // Add minimap renderer to container
    minimapContainer.appendChild(miniMapRenderer.domElement);
    document.body.appendChild(minimapContainer);

    // Create player dot
    const playerDot = document.createElement('div');
    playerDot.style.width = `${PLAYER_DOT_SIZE}px`;
    playerDot.style.height = `${PLAYER_DOT_SIZE}px`;
    playerDot.style.borderRadius = '50%';
    playerDot.style.backgroundColor = '#ff0000';
    playerDot.style.position = 'absolute';
    playerDot.style.transform = 'translate(-50%, -50%)';
    minimapContainer.appendChild(playerDot);

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

    // Function to update player position on minimap
    function updatePlayerPosition() {
        const x = (player.position.x / 150 + 0.5) * MINIMAP_SIZE;
        const z = (player.position.z / 150 + 0.5) * MINIMAP_SIZE;
        playerDot.style.left = `${x}px`;
        playerDot.style.top = `${z}px`;
    }

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

    // Add event listener for 'M' key press
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'm') {
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
        updatePlayerPosition();
        updateCompass();
    }

    return updateMiniMap;
}