import * as GameState from '../core/game-state.js';
import * as Physics from '../player/physics/physics-engine.js';

const { JUMP_SPEED, GRAVITY, TERMINAL_VELOCITY, PLAYER_WIDTH, PLAYER_HEIGHT, 
    WALK_SPEED, SPRINT_SPEED, SNEAK_SPEED, FLY_SPEED } = Physics.PHYSICS_CONSTANTS;

const MOUSE_LOOK_SENSITIVITY = 0.002;

// Reusable vectors
const moveVector = new THREE.Vector3();

//-------------------------- Player Constants --------------------------//
const HEAD_SIZE = 0.5;
const BODY_WIDTH = 0.6;
const BODY_HEIGHT = 0.8;
const BODY_DEPTH = 0.3;
const LIMB_WIDTH = 0.3;
const LIMB_HEIGHT = 0.8;
const LIMB_DEPTH = 0.3;

const TEXTURE_SIZE = 64;
const UV_UNIT = 1 / TEXTURE_SIZE;
const UV_PADDING = 0.001;

const textureCache = new Map();

function createPaddedUVs(uvCoords) {
    const [x, y, width, height] = uvCoords;
    
    // Convert pixel coordinates to UV coordinates (0-1 range) with padding
    const u1 = (x * UV_UNIT) + UV_PADDING;
    const v1 = 1 - ((y + height) * UV_UNIT) + UV_PADDING;
    const u2 = ((x + width) * UV_UNIT) - UV_PADDING;
    const v2 = 1 - (y * UV_UNIT) - UV_PADDING;
    
    // Front face UVs with proper orientation
    return [
        u1, v2,  // bottom-left
        u2, v2,  // bottom-right
        u1, v1,  // top-left
        u2, v1   // top-right
    ];
}

// Improved UV maps with slight insets to prevent bleeding
const UV_MAPS = {
    head: {
        front:  [8.1, 8.1, 7.8, 7.8],    // Slightly inset from edges
        back:   [24.1, 8.1, 7.8, 7.8],
        top:    [8.1, 0.1, 7.8, 7.8],
        bottom: [16.1, 0.1, 7.8, 7.8],
        right:  [0.1, 8.1, 7.8, 7.8],
        left:   [16.1, 8.1, 7.8, 7.8]
    },
    body: {
        front:  [20.1, 20.1, 7.8, 11.8],
        back:   [32.1, 20.1, 7.8, 11.8],
        top:    [20.1, 16.1, 7.8, 3.8],
        bottom: [28.1, 16.1, 7.8, 3.8],
        right:  [16.1, 20.1, 3.8, 11.8],
        left:   [28.1, 20.1, 3.8, 11.8]
    },
    arm: {
        front:  [44.1, 20.1, 3.8, 11.8],
        back:   [52.1, 20.1, 3.8, 11.8],
        top:    [44.1, 16.1, 3.8, 3.8],
        bottom: [48.1, 16.1, 3.8, 3.8],
        right:  [40.1, 20.1, 3.8, 11.8],
        left:   [48.1, 20.1, 3.8, 11.8]
    },
    leg: {
        front:  [4.1, 20.1, 3.8, 11.8],
        back:   [12.1, 20.1, 3.8, 11.8],
        top:    [4.1, 16.1, 3.8, 3.8],
        bottom: [8.1, 16.1, 3.8, 3.8],
        right:  [0.1, 20.1, 3.8, 11.8],
        left:   [8.1, 20.1, 3.8, 11.8]
    }
};

export function createPlayer(scene, playerData, textureAtlas, isLocalPlayer) {
    // Create the player group
    const player = new THREE.Group();
    player.isFlying = playerData.isFlying || false;
    player.collisionsEnabled = playerData.collisionsEnabled !== undefined ? playerData.collisionsEnabled : true;

    // Get spawn position
    const spawnPosition = GameState.spawn(playerData.position?.x, playerData.position?.z);
    
    // Set initial position
    player.position.set(
        playerData.position?.x || spawnPosition.x,
        playerData.position?.y || spawnPosition.y,
        playerData.position?.z || spawnPosition.z
    );
    
    // Set player ID and animation state
    player.userData.id = playerData.id;
    player.animationTime = 0;
    player.isMoving = false;
    player.lastPosition = player.position.clone();
    player.yaw = playerData.rotation || 0;
    player.pitch = 0;

    // Load texture only once per texture path (caching)
    let material;
    if (textureCache.has(textureAtlas)) {
        material = textureCache.get(textureAtlas);
    } else {
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(textureAtlas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        
        material = new THREE.MeshBasicMaterial({
            map: texture,
            alphaTest: 0.5,
            transparent: true,
            side: THREE.FrontSide
        });
        
        textureCache.set(textureAtlas, material);
    }

    // Create player model parts
    const parts = createPlayerParts(material);
    const playerModel = new THREE.Group();
    
    // Store references to limbs for animation
    player.head = parts[0];  // Assuming head is index 0
    player.body = parts[1];  // Assuming body is index 1
    player.leftArm = parts[2];  // Assuming arms are index 2 and 3
    player.rightArm = parts[3];
    player.leftLeg = parts[4];  // Assuming legs are index 4 and 5
    player.rightLeg = parts[5];

    // Add all parts to the model
    parts.forEach(part => playerModel.add(part));
    
    // Add the model to the player
    player.add(playerModel);
    
    // Position the model properly - FIXED POSITION
    // No longer offsetting by -PLAYER_HEIGHT/2, now it's centered
    playerModel.position.y = 0;
    
    // Set rotation of the model
    playerModel.rotation.y = player.yaw;

    Physics.initializePhysicsState(player);
    
    // Add the player to the scene
    scene.add(player);

    // Register the player with GameState
    if (isLocalPlayer) {
        GameState.setPlayer(player);
        GameState.setPlayerLoaded(true);
        
        // Hide player model from first-person view
        playerModel.visible = false;
    } else {
        // Add to other players in GameState
        if (player.userData.id) {
            GameState.addOtherPlayer(player.userData.id, player);
            
            // Add player label
            const label = createPlayerLabel(playerData.id);
            player.add(label);
        }
    }

    // Subscribe to movement events for animation
    GameState.subscribe(GameState.EVENTS.PLAYER_MOVED, (moveData) => {
        if (player.userData.id === moveData.id) {
            animatePlayer(player, moveData);
        }
    });

    return player;
}

function createPlayerLabel(playerId) {
    // Create canvas for the label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    // Draw the label text
    context.fillStyle = '#00000088';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '32px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(playerId, canvas.width / 2, canvas.height / 2);
    
    // Create the texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    // Create sprite material
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    // Position the label above the player
    sprite.position.set(0, 2, 0);
    sprite.scale.set(2, 0.5, 1);
    
    return sprite;
}

function createPlayerParts(material) {
    const playerParts = [];

    // Create head with improved UV mapping
    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE);
    const headUvs = [];
    headUvs.push(...createPaddedUVs(UV_MAPS.head.right));
    headUvs.push(...createPaddedUVs(UV_MAPS.head.left));
    headUvs.push(...createPaddedUVs(UV_MAPS.head.top));
    headUvs.push(...createPaddedUVs(UV_MAPS.head.bottom));
    headUvs.push(...createPaddedUVs(UV_MAPS.head.back));
    headUvs.push(...createPaddedUVs(UV_MAPS.head.front));
    headGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(headUvs, 2));
    
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = PLAYER_HEIGHT / 2 + HEAD_SIZE / 2;
    playerParts.push(head);

    // Create body with improved UV mapping
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH);
    const bodyUvs = [];
    bodyUvs.push(...createPaddedUVs(UV_MAPS.body.right));
    bodyUvs.push(...createPaddedUVs(UV_MAPS.body.left));
    bodyUvs.push(...createPaddedUVs(UV_MAPS.body.top));
    bodyUvs.push(...createPaddedUVs(UV_MAPS.body.bottom));
    bodyUvs.push(...createPaddedUVs(UV_MAPS.body.back));
    bodyUvs.push(...createPaddedUVs(UV_MAPS.body.front));
    bodyGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(bodyUvs, 2));
    
    const body = new THREE.Mesh(bodyGeometry, material);
    body.position.y = PLAYER_HEIGHT / 2 - BODY_HEIGHT / 2;
    playerParts.push(body);

    // Improved limb creation function with proper UV mapping
    function createLimb(uvMap, position) {
        const limbGeometry = new THREE.BoxGeometry(LIMB_WIDTH, LIMB_HEIGHT, LIMB_DEPTH);
        const limbUvs = [];
        limbUvs.push(...createPaddedUVs(uvMap.right));
        limbUvs.push(...createPaddedUVs(uvMap.left));
        limbUvs.push(...createPaddedUVs(uvMap.top));
        limbUvs.push(...createPaddedUVs(uvMap.bottom));
        limbUvs.push(...createPaddedUVs(uvMap.back));
        limbUvs.push(...createPaddedUVs(uvMap.front));
        limbGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(limbUvs, 2));
        
        const limb = new THREE.Mesh(limbGeometry, material);
        limb.position.copy(position);
        return limb;
    }

    // Create limbs with improved UV mapping
    const limbs = [
        {
            uvMap: UV_MAPS.arm,
            position: new THREE.Vector3(-BODY_WIDTH / 2 - LIMB_WIDTH / 2, PLAYER_HEIGHT / 2 - LIMB_HEIGHT / 2, 0)
        },
        {
            uvMap: UV_MAPS.arm,
            position: new THREE.Vector3(BODY_WIDTH / 2 + LIMB_WIDTH / 2, PLAYER_HEIGHT / 2 - LIMB_HEIGHT / 2, 0)
        },
        {
            uvMap: UV_MAPS.leg,
            position: new THREE.Vector3(-BODY_WIDTH / 4, PLAYER_HEIGHT / 2 - BODY_HEIGHT - LIMB_HEIGHT / 2, 0)
        },
        {
            uvMap: UV_MAPS.leg,
            position: new THREE.Vector3(BODY_WIDTH / 4, PLAYER_HEIGHT / 2 - BODY_HEIGHT - LIMB_HEIGHT / 2, 0)
        }
    ].map(({ uvMap, position }) => createLimb(uvMap, position));

    playerParts.push(...limbs);

    // Set improved shadow properties
    playerParts.forEach((part) => {
        part.castShadow = true;
        part.receiveShadow = true;
    });

    return playerParts;
}

export function addPlayerControls(player, camera, scene, canvas) {
    const controls = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        up: false,
        down: false,
        sprint: false,
        sneak: false,
        toggleCollisions: true
    };

    player.yaw = 0;
    player.pitch = 0;
    player.isFlying = false;
    player.collisionsEnabled = true;

    let isPointerLocked = false;
    const touchPoints = {};

    const keyToButtonMap = {
        'w': 'up',
        'a': 'left',
        's': 'down',
        'd': 'right',
        ' ': 'jump',
        'f': 'fly'
    };

    function handleKeyEvent(event, isKeyDown) {
        const key = event.key.toLowerCase();
        const keyMap = {
            'w': 'forward',
            's': 'backward',
            'a': 'left',
            'd': 'right',
            ' ': 'jump',
            'q': 'down',
            'e': 'up',
            'shift': 'sprint',
            'control': 'sneak'
        };

        if (keyMap[key]) {
            controls[keyMap[key]] = isKeyDown;
        }

        if (keyToButtonMap[key]) {
            const button = document.getElementById(keyToButtonMap[key]);
            if (button) {
                if (isKeyDown) {
                    button.classList.add('highlight');
                } else {
                    button.classList.remove('highlight');
                }
            }
        }

        if (isKeyDown) {
            switch (key) {
                case 'f':
                    player.isFlying = !player.isFlying;
                    console.log(`Fly mode ${player.isFlying ? 'enabled' : 'disabled'}`);
                    break;
                case 'c':
                    player.collisionsEnabled = !player.collisionsEnabled;
                    console.log(`Collisions ${player.collisionsEnabled ? 'enabled' : 'disabled'}`);
                    break;
            }
        }
    }

    window.addEventListener('keydown', event => handleKeyEvent(event, true));
    window.addEventListener('keyup', event => handleKeyEvent(event, false));

    function updateCameraRotation() {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = player.yaw;
        camera.rotation.x = player.pitch;

        if (player.children[0]) {
            player.children[0].rotation.y = player.yaw;
        }
    }

    function onMouseMove(event) {
        if (!isPointerLocked) return;
        player.yaw -= event.movementX * MOUSE_LOOK_SENSITIVITY;
        player.pitch -= event.movementY * MOUSE_LOOK_SENSITIVITY;
        player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
        updateCameraRotation();
    }

    function onTouchStart(event) {
        for (let i = 0; i < event.touches.length; i++) {
            const touch = event.touches[i];
            touchPoints[touch.identifier] = {
                startX: touch.clientX,
                startY: touch.clientY,
                currentX: touch.clientX,
                currentY: touch.clientY
            };
        }
        event.preventDefault(); // Prevent default zoom behavior
    }

    function onTouchMove(event) {
        for (let i = 0; i < event.touches.length; i++) {
            const touch = event.touches[i];
            const point = touchPoints[touch.identifier];
            if (point) {
                const deltaX = touch.clientX - point.currentX;
                const deltaY = touch.clientY - point.currentY;

                // Determine if the touch point is for rotation or movement
                if (touch.target.classList.contains('control-button')) {
                    // Handle movement
                    if (touch.target.id === 'up') controls.forward = true;
                    if (touch.target.id === 'down') controls.backward = true;
                    if (touch.target.id === 'left') controls.left = true;
                    if (touch.target.id === 'right') controls.right = true;
                } else {
                    // Handle rotation
                    player.yaw -= deltaX * MOUSE_LOOK_SENSITIVITY;
                    player.pitch -= deltaY * MOUSE_LOOK_SENSITIVITY;
                    player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
                    updateCameraRotation();
                }

                point.currentX = touch.clientX;
                point.currentY = touch.clientY;
            }
        }
        event.preventDefault(); // Prevent default zoom behavior
    }

    function onTouchEnd(event) {
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            delete touchPoints[touch.identifier];
        }
        event.preventDefault(); // Prevent default zoom behavior
    }

    function onPointerLockChange() {
        isPointerLocked = document.pointerLockElement === canvas;
    }

    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('click', () => canvas.requestPointerLock());

    // Add event listeners for touch controls
    function handleTouchStart(buttonId, controlKey) {
        return (event) => {
            controls[controlKey] = true;
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.add('highlight');
            }
            event.preventDefault(); // Prevent default zoom behavior
        };
    }

    function handleTouchEnd(buttonId, controlKey) {
        return (event) => {
            controls[controlKey] = false;
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.remove('highlight');
            }
            event.preventDefault(); // Prevent default zoom behavior
        };
    }

    // Initialize touch controls
    try {
        document.getElementById('up')?.addEventListener('touchstart', handleTouchStart('up', 'forward'));
        document.getElementById('up')?.addEventListener('touchend', handleTouchEnd('up', 'forward'));
        document.getElementById('down')?.addEventListener('touchstart', handleTouchStart('down', 'backward'));
        document.getElementById('down')?.addEventListener('touchend', handleTouchEnd('down', 'backward'));
        document.getElementById('left')?.addEventListener('touchstart', handleTouchStart('left', 'left'));
        document.getElementById('left')?.addEventListener('touchend', handleTouchEnd('left', 'left'));
        document.getElementById('right')?.addEventListener('touchstart', handleTouchStart('right', 'right'));
        document.getElementById('right')?.addEventListener('touchend', handleTouchEnd('right', 'right'));
        document.getElementById('fly')?.addEventListener('touchstart', (event) => {
            player.isFlying = !player.isFlying;
            const button = document.getElementById('fly');
            if (button) {
                button.classList.add('highlight');
                setTimeout(() => button.classList.remove('highlight'), 200); // Brief highlight for feedback
            }
            event.preventDefault(); // Prevent default zoom behavior
        });
        document.getElementById('jump')?.addEventListener('touchstart', handleTouchStart('jump', 'jump'));
        document.getElementById('jump')?.addEventListener('touchend', handleTouchEnd('jump', 'jump'));
    } catch (e) {
        console.warn('Touch controls could not be initialized:', e);
    }

    function updatePlayerMovement() {
        // Check if the player is moving
        const isMoving = controls.forward || controls.backward || controls.left || controls.right || 
                         controls.jump || controls.up || controls.down;
        
        // Set movement flag for animation
        player.isMoving = isMoving;
        
        // Calculate movement speed
        const isSprinting = controls.sprint;
        const isSneaking = controls.sneak;
    
        let currentSpeed = WALK_SPEED;
        if (player.isFlying) {
            currentSpeed = FLY_SPEED;
        } else if (isSprinting) {
            currentSpeed = SPRINT_SPEED;
        } else if (isSneaking) {
            currentSpeed = SNEAK_SPEED;
        }
    
        // Calculate movement vector
        moveVector.set(
            (controls.right ? 1 : 0) - (controls.left ? 1 : 0),
            0,
            (controls.backward ? 1 : 0) - (controls.forward ? 1 : 0)
        ).normalize().multiplyScalar(currentSpeed);
    
        // Apply flying or walking movement
        if (player.isFlying) {
            moveVector.y = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);
            moveVector.normalize().multiplyScalar(currentSpeed);
            moveVector.applyQuaternion(camera.quaternion);
        } else {
            moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
        }
    
        // Apply movement with collision detection
        if (moveVector.lengthSq() > 0) {
            Physics.handleMovement(player, moveVector, scene);
        }
    
        // Apply physics only if not flying
        if (!player.isFlying) {
            Physics.applyVerticalPhysics(player, controls, scene);
        }
    
        // Update camera position 
        camera.position.copy(player.position).add(new THREE.Vector3(0, PLAYER_HEIGHT * 0.6, 0));
    
        // Network code and event publishing remains the same
        if (GameState.isOnline && GameState.socket && player.userData.id === GameState.socket.id) {
            GameState.socket.emit('playerMove', {
                position: player.position.clone(),
                rotation: player.yaw,
                isFlying: player.isFlying, 
                collisionsEnabled: player.collisionsEnabled
            });
        }
        
        // Publish local movement event
        GameState.publish(GameState.EVENTS.PLAYER_MOVED, {
            id: player.userData.id,
            position: player.position.clone(),
            rotation: player.yaw,
            isFlying: player.isFlying, 
            collisionsEnabled: player.collisionsEnabled,
            isMoving: player.isMoving
        });
        
        // Animate the player model
        animatePlayer(player, {
            isMoving: player.isMoving,
            rotation: player.yaw
        });
    }

    // Store player controls in GameState
    const playerControlsFunction = updatePlayerMovement;
    GameState.setPlayerControls(playerControlsFunction);

    return updatePlayerMovement;
}




//-------------------------- Player Movement --------------------------//

function animatePlayer(player, moveData) {
    // Make sure the player has limbs to animate
    if (!player || !player.children[0]) return;
    
    const isMoving = moveData.isMoving || false;
    const yaw = moveData.rotation || 0;
    
    // Update model rotation
    if (player.children[0]) {
        player.children[0].rotation.y = yaw;
    }
    
    // Animation parameters
    const walkingSpeed = 1;
    const swingAmount = 0.04;
    
    // Increment animation time if moving
    if (isMoving) {
        player.animationTime = (player.animationTime || 0) + 0.1;
    } else {
        // Reset to default position if not moving
        if (player.leftArm) player.leftArm.rotation.x = 0;
        if (player.rightArm) player.rightArm.rotation.x = 0;
        if (player.leftLeg) player.leftLeg.rotation.x = 0;
        if (player.rightLeg) player.rightLeg.rotation.x = 0;
        return;
    }
    
    // Calculate animation values
    const swing = Math.sin(player.animationTime * walkingSpeed) * swingAmount;
    
    // Apply animations to limbs
    if (player.leftArm) player.leftArm.rotation.x = -swing;
    if (player.rightArm) player.rightArm.rotation.x = swing;
    if (player.leftLeg) player.leftLeg.rotation.x = swing;
    if (player.rightLeg) player.rightLeg.rotation.x = -swing;
}

//----------------------------- Player Network ---------------------------//
// Function to handle when a new player joins
export function handleNewPlayer(scene, playerData, skinPath) {
    // Skip if this is our own player
    if (GameState.socket && playerData.id === GameState.socket.id) {
        return null;
    }

    console.log(`Creating new player with ID: ${playerData.id}`);
    
    // Check if player already exists
    if (GameState.otherPlayers[playerData.id]) {
        console.log(`Player ${playerData.id} already exists, updating position`);
        
        const existingPlayer = GameState.otherPlayers[playerData.id];
        
        // Update position
        if (playerData.position) {
            existingPlayer.position.set(
                playerData.position.x,
                playerData.position.y,
                playerData.position.z
            );
        }
        
        // Update rotation
        if (playerData.rotation !== undefined && existingPlayer.children[0]) {
            existingPlayer.yaw = playerData.rotation;
            existingPlayer.children[0].rotation.y = playerData.rotation;
        }
        
        return existingPlayer;
    }

    // If player doesn't exist yet, create a new one
    const player = createPlayer(scene, playerData, skinPath || '../../../images/skins/4.png', false);
    
    // Store the player in GameState
    GameState.addOtherPlayer(playerData.id, player);
    
    // Publish player connected event
    GameState.publish(GameState.EVENTS.PLAYER_CONNECTED, {
        ...playerData,
        playerObject: player
    });
    
    return player;
}

// Function to handle player position updates
export function handlePlayerMove(playerData) {
    // Skip if this is our own movement (we already updated locally)
    if (GameState.socket && playerData.id === GameState.socket.id) {
        return;
    }
    
    const otherPlayer = GameState.otherPlayers[playerData.id];
    
    // If player doesn't exist in our state, it might be a new one
    if (!otherPlayer) {
        console.warn(`Received movement for unknown player: ${playerData.id}`);
        return;
    }
    
    // Update player position
    if (playerData.position) {
        otherPlayer.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
    }
    
    // Update player rotation and model
    if (playerData.rotation !== undefined) {
        otherPlayer.yaw = playerData.rotation;
        if (otherPlayer.children[0]) {
            otherPlayer.children[0].rotation.y = playerData.rotation;
        }
    }
    
    // Update player state
    otherPlayer.isFlying = playerData.isFlying !== undefined ? playerData.isFlying : otherPlayer.isFlying;
    otherPlayer.collisionsEnabled = playerData.collisionsEnabled !== undefined ? playerData.collisionsEnabled : otherPlayer.collisionsEnabled;
    
    // Set player as moving for animation
    otherPlayer.isMoving = true;
    
    // Reset move timer
    if (!otherPlayer.moveTimer) {
        otherPlayer.moveTimer = setTimeout(() => {
            otherPlayer.isMoving = false;
            otherPlayer.moveTimer = null;
        }, 200);
    } else {
        clearTimeout(otherPlayer.moveTimer);
        otherPlayer.moveTimer = setTimeout(() => {
            otherPlayer.isMoving = false;
            otherPlayer.moveTimer = null;
        }, 200);
    }
    
    // Publish player moved event
    GameState.publish(GameState.EVENTS.PLAYER_MOVED, {
        id: playerData.id,
        position: otherPlayer.position.clone(),
        rotation: otherPlayer.yaw,
        isFlying: otherPlayer.isFlying,
        collisionsEnabled: otherPlayer.collisionsEnabled,
        isMoving: otherPlayer.isMoving
    });
}

export function handlePlayerDisconnected(scene, playerId) {
    if (!playerId || !GameState.otherPlayers[playerId]) {
        return;
    }
    
    console.log(`Player disconnected: ${playerId}`);
    
    const player = GameState.otherPlayers[playerId];
    
    // Remove from scene
    if (scene && player) {
        scene.remove(player);
    }
    
    // Remove from GameState
    GameState.removeOtherPlayer(playerId);
    
    // Publish player disconnected event
    GameState.publish(GameState.EVENTS.PLAYER_DISCONNECTED, playerId);
}

// Function to set up socket handlers for player management
export function setupPlayerNetworkHandlers(scene, socket, skinPath) {
    if (!socket) {
        console.warn('Cannot set up player network handlers: Socket not available');
        return;
    }
    
    // Handle new player joining
    socket.on('newPlayer', (playerData) => {
        handleNewPlayer(scene, playerData, skinPath);
    });
    
    // Handle player movements
    socket.on('playerMove', (playerData) => {
        handlePlayerMove(playerData);
    });
    
    // Handle player disconnections
    socket.on('playerDisconnected', (playerId) => {
        handlePlayerDisconnected(scene, playerId);
    });
    
    // Request current players on connection
    socket.on('connect', () => {
        socket.emit('requestPlayers');
    });
    
    // Handle receiving current players list
    socket.on('currentPlayers', (players) => {
        console.log(`Received ${players.length} current players`);
        players.forEach(playerData => {
            if (playerData.id !== socket.id) {
                handleNewPlayer(scene, playerData, skinPath);
            }
        });
    });
}

// Export Player Management API
export const PlayerManager = {
    createPlayer,
    addPlayerControls,
    handleNewPlayer,
    handlePlayerMove,
    handlePlayerDisconnected,
    setupPlayerNetworkHandlers,

};