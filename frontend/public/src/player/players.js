import { spawn, CLIENT_WORLD_CONFIG, camera, scene, chunkManager, chunkWorker } from '../script.js';


const JUMP_SPEED = 0.15;
const GRAVITY = 0.008;
const TERMINAL_VELOCITY = -3;

const WALK_SPEED = 0.0797;
const SPRINT_SPEED = 0.112;
const SNEAK_SPEED = 0.03;
const FLY_SPEED = 1.5;

const MOUSE_LOOK_SENSITIVITY = 0.002;

let yVelocity = 0;
let isPointerLocked = false;
let isSprinting = false;
let isSneaking = false;
let isOnGround = false;
let lastTargetBlock = null;




// Reusable vectors
const moveVector = new THREE.Vector3();
const newPosition = new THREE.Vector3();
const slideVector = new THREE.Vector3();
const slidePosition = new THREE.Vector3();
const collisionNormal = new THREE.Vector3();
const groundCheck = new THREE.Vector3();
const playerBox = new THREE.Box3();
const blockBox = new THREE.Box3();
const blockPosition = new THREE.Vector3();
const matrix = new THREE.Matrix4();

//-------------------------- Player Constants --------------------------//
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.6;
const HEAD_SIZE = 0.5;
const BODY_WIDTH = 0.6;
const BODY_HEIGHT = 0.8;
const BODY_DEPTH = 0.3;
const LIMB_WIDTH = 0.3;
const LIMB_HEIGHT = 0.8;
const LIMB_DEPTH = 0.3;

// UV mapping constants (assuming 64x64 texture)
const TEXTURE_SIZE = 64;
const UV_UNIT = 1 / TEXTURE_SIZE;
const UV_PADDING = 0.001; // Small padding to prevent texture bleeding

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
    const player = new THREE.Group();
    player.isFlying = false;
    player.collisionsEnabled = true;

    // Get spawn position
    const spawnPosition = spawn(playerData.position?.x, playerData.position?.z);
    
    // Set initial position
    player.position.set(
        spawnPosition.x,
        playerData.position?.y || spawnPosition.y,
        spawnPosition.z
    );
    
    player.userData.id = playerData.id;
    player.animationTime = 0;
    player.isMoving = false;
    player.lastPosition = player.position.clone();

    // Rest of the createPlayer code...
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load(textureAtlas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        alphaTest: 0.5,
        transparent: true,
        side: THREE.FrontSide
    });

    const parts = createPlayerParts(material);
    const playerModel = new THREE.Group();
    
    // Store references to limbs for animation
    player.leftArm = parts[2];  // Assuming arms are index 2 and 3
    player.rightArm = parts[3];
    player.leftLeg = parts[4];  // Assuming legs are index 4 and 5
    player.rightLeg = parts[5];

    parts.forEach(part => playerModel.add(part));

    if (isLocalPlayer) {
        playerModel.visible = false;
    }

    player.add(playerModel);
    scene.add(player);
    return player;
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

    document.getElementById('up').addEventListener('touchstart', handleTouchStart('up', 'forward'));
    document.getElementById('up').addEventListener('touchend', handleTouchEnd('up', 'forward'));
    document.getElementById('down').addEventListener('touchstart', handleTouchStart('down', 'backward'));
    document.getElementById('down').addEventListener('touchend', handleTouchEnd('down', 'backward'));
    document.getElementById('left').addEventListener('touchstart', handleTouchStart('left', 'left'));
    document.getElementById('left').addEventListener('touchend', handleTouchEnd('left', 'left'));
    document.getElementById('right').addEventListener('touchstart', handleTouchStart('right', 'right'));
    document.getElementById('right').addEventListener('touchend', handleTouchEnd('right', 'right'));
    document.getElementById('fly').addEventListener('touchstart', (event) => {
        player.isFlying = !player.isFlying;
        const button = document.getElementById('fly');
        if (button) {
            button.classList.add('highlight');
            setTimeout(() => button.classList.remove('highlight'), 200); // Brief highlight for feedback
        }
        event.preventDefault(); // Prevent default zoom behavior
    });
    document.getElementById('jump').addEventListener('touchstart', handleTouchStart('jump', 'jump'));
    document.getElementById('jump').addEventListener('touchend', handleTouchEnd('jump', 'jump'));

    function updatePlayerMovement() {
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

        const moveVector = new THREE.Vector3(
            (controls.right ? 1 : 0) - (controls.left ? 1 : 0),
            0,
            (controls.backward ? 1 : 0) - (controls.forward ? 1 : 0)
        ).normalize().multiplyScalar(currentSpeed);

        if (player.isFlying) {
            moveVector.y = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);
            moveVector.normalize().multiplyScalar(currentSpeed);
            moveVector.applyQuaternion(camera.quaternion);
        } else {
            moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
        }

        const newPosition = player.position.clone().add(moveVector);
        const collisionResult = checkCollision(newPosition, scene, player);
        if (!collisionResult.collides) {
            player.position.copy(newPosition);
        } else {
            const slideVector = moveVector.clone().projectOnPlane(collisionResult.normal);
            const slidePosition = player.position.clone().add(slideVector);
            if (!checkCollision(slidePosition, scene, player).collides) {
                player.position.copy(slidePosition);
            }
        }

        applyMovementWithCollision(player, moveVector, scene);

        if (!player.isFlying) {
            applyVerticalPhysics(controls, player, scene);
        }

        camera.position.copy(player.position).add(new THREE.Vector3(0, player.isFlying ? 0 : 0.9, 0));
    }

    return updatePlayerMovement;
}


function applyMovementWithCollision(player, moveVector, scene) {
    // Y-axis movement
    newPosition.copy(player.position).add(new THREE.Vector3(0, moveVector.y, 0));
    let collisionResult = checkCollision(newPosition, scene, player);
    if (!collisionResult.collides) {
        player.position.y = newPosition.y;
    } else {
        if (moveVector.y < 0) isOnGround = true;
        moveVector.y = 0;
    }

    // X-axis movement
    newPosition.copy(player.position).add(new THREE.Vector3(moveVector.x, 0, 0));
    collisionResult = checkCollision(newPosition, scene, player);
    if (!collisionResult.collides) {
        player.position.x = newPosition.x;
    } else {
        moveVector.x = 0;
    }

    // Z-axis movement
    newPosition.copy(player.position).add(new THREE.Vector3(0, 0, moveVector.z));
    collisionResult = checkCollision(newPosition, scene, player);
    if (!collisionResult.collides) {
        player.position.z = newPosition.z;
    } else {
        moveVector.z = 0;
    }
}

function applyVerticalPhysics(controls, player, scene) {
    if (controls.jump && isOnGround) {
        yVelocity = JUMP_SPEED;
        isOnGround = false;
    }

    yVelocity = Math.max(yVelocity - GRAVITY, TERMINAL_VELOCITY);
    newPosition.copy(player.position);
    newPosition.y += yVelocity;

    const collisionResult = checkCollision(newPosition, scene, player);
    if (!collisionResult.collides) {
        // Allow smooth vertical movement
        player.position.y = newPosition.y;
    } else {
        if (yVelocity < 0) {
            // Just stop vertical movement when hitting ground
            isOnGround = true;
        }
        yVelocity = 0;
    }

    // Ground check
    groundCheck.copy(player.position);
    groundCheck.y -= 0.1;
    if (!checkCollision(groundCheck, scene, player).collides) {
        isOnGround = false;
    }
}

function checkCollision(position, scene, player) {
    if (!player.collisionsEnabled) {
        return { collides: false, normal: new THREE.Vector3() };
    }

    // Adjust collision box to align with grid
    const adjustedPosition = position.clone();
    playerBox.setFromCenterAndSize(
        adjustedPosition,
        new THREE.Vector3(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH)
    );

    for (const chunkGroup of scene.children) {
        if (chunkGroup.isGroup) {
            for (const instancedMesh of chunkGroup.children) {
                if (instancedMesh.isInstancedMesh) {
                    for (let i = 0; i < instancedMesh.count; i++) {
                        instancedMesh.getMatrixAt(i, matrix);
                        blockPosition.setFromMatrixPosition(matrix);
                        
                        // Adjust block position to match grid
                        blockBox.setFromCenterAndSize(
                            blockPosition,
                            new THREE.Vector3(1, 1, 1)
                        );

                        if (playerBox.intersectsBox(blockBox)) {
                            collisionNormal.subVectors(adjustedPosition, blockPosition).normalize();
                            return { collides: true, normal: collisionNormal };
                        }
                    }
                }
            }
        }
    }
    return { collides: false, normal: new THREE.Vector3() };
}

