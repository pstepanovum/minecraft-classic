import { findGroundLevel } from './script.js';


const JUMP_SPEED = 0.15;
const GRAVITY = 0.008;
const TERMINAL_VELOCITY = -3;

const WALK_SPEED = 0.0697;
const SPRINT_SPEED = 0.112;
const SNEAK_SPEED = 0.03;
const FLY_SPEED = 0.697;

const MOUSE_LOOK_SENSITIVITY = 0.002;

let isJumping = false;
let yVelocity = 0;
let isPointerLocked = false;
let yaw = 0;
let pitch = 0;
let isFlying = false;
let isSprinting = false;
let isSneaking = false;
let isOnGround = false; // Initialize isOnGround


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

//-------------------------- Player --------------------------//
const PLAYER_WIDTH = 0.6;
const PLAYER_HEIGHT = 1.6;
const HEAD_SIZE = 0.5;
const BODY_WIDTH = 0.6;
const BODY_HEIGHT = 0.8;
const BODY_DEPTH = 0.3;
const LIMB_WIDTH = 0.3;
const LIMB_HEIGHT = 0.8;
const LIMB_DEPTH = 0.3;

export function createPlayer(scene, playerData, isLocalPlayer = false) {
    const player = new THREE.Group();
    const groundLevel = findGroundLevel(playerData.position.x, playerData.position.z);
    player.position.set(playerData.position.x, groundLevel, playerData.position.z);
    player.userData.id = playerData.id;

    // Create player parts with colors
    const parts = createPlayerParts();

    // Create a new group for the player model
    const playerModel = new THREE.Group();
    parts.forEach(part => playerModel.add(part));

    // Add the player model to the player group
    player.add(playerModel);

    // Set visibility for local player
    if (isLocalPlayer) {
        playerModel.visible = false;
    }

    scene.add(player);
    return player;
}

function createPlayerParts() {
    const playerParts = [];

    // Create head (yellow)
    const headGeometry = new THREE.BoxGeometry(HEAD_SIZE, HEAD_SIZE, HEAD_SIZE);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = PLAYER_HEIGHT / 2 + HEAD_SIZE / 2;
    playerParts.push(head);

    // Create body (blue)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH);
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = PLAYER_HEIGHT / 2 - BODY_HEIGHT / 2;
    playerParts.push(body);

    // Create limbs (red)
    const limbGeometry = new THREE.BoxGeometry(LIMB_WIDTH, LIMB_HEIGHT, LIMB_DEPTH);
    const limbMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    
    // Left arm
    const leftArm = new THREE.Mesh(limbGeometry, limbMaterial);
    leftArm.position.set(-BODY_WIDTH / 2 - LIMB_WIDTH / 2, PLAYER_HEIGHT / 2 - LIMB_HEIGHT / 2, 0);
    playerParts.push(leftArm);

    // Right arm
    const rightArm = new THREE.Mesh(limbGeometry, limbMaterial);
    rightArm.position.set(BODY_WIDTH / 2 + LIMB_WIDTH / 2, PLAYER_HEIGHT / 2 - LIMB_HEIGHT / 2, 0);
    playerParts.push(rightArm);

    // Left leg
    const leftLeg = new THREE.Mesh(limbGeometry, limbMaterial);
    leftLeg.position.set(-BODY_WIDTH / 4, PLAYER_HEIGHT / 2 - BODY_HEIGHT - LIMB_HEIGHT / 2, 0);
    playerParts.push(leftLeg);

    // Right leg
    const rightLeg = new THREE.Mesh(limbGeometry, limbMaterial);
    rightLeg.position.set(BODY_WIDTH / 4, PLAYER_HEIGHT / 2 - BODY_HEIGHT - LIMB_HEIGHT / 2, 0);
    playerParts.push(rightLeg);

    // Set shadow properties
    playerParts.forEach((part) => {
        part.castShadow = true;
        part.receiveShadow = true;
    });

    return playerParts;
}

//-------------------------- Other Players --------------------------//


//-------------------------- Player Controls --------------------------//
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
    };

    function handleKeyEvent(event, isKeyDown) {
        const keyMap = {
            'w': 'forward',
            's': 'backward',
            'a': 'left',
            'd': 'right',
            ' ': 'jump',
            'q': 'down',
            'e': 'up',
            'f': 'toggleFly',
            'Shift': 'sprint',
            'Control': 'sneak'
        };
        if (keyMap[event.key]) {
            if (keyMap[event.key] === 'toggleFly' && isKeyDown) {
                isFlying = !isFlying;
                console.log(`Fly mode ${isFlying ? 'enabled' : 'disabled'}`);
            } else {
                controls[keyMap[event.key]] = isKeyDown;
            }
        }
    }

    window.addEventListener('keydown', event => handleKeyEvent(event, true));
    window.addEventListener('keyup', event => handleKeyEvent(event, false));

    function updateCameraRotation() {
        camera.rotation.order = 'YXZ';
        camera.rotation.y = yaw;
        camera.rotation.x = pitch;
    }

    function onMouseMove(event) {
        if (!isPointerLocked) return;
        yaw -= event.movementX * MOUSE_LOOK_SENSITIVITY;
        pitch -= event.movementY * MOUSE_LOOK_SENSITIVITY;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
        updateCameraRotation();
    }

    function onPointerLockChange() {
        isPointerLocked = document.pointerLockElement === canvas;
    }

    canvas.addEventListener('click', () => canvas.requestPointerLock());
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    function updatePlayerMovement() {
        isSprinting = controls.sprint;
        isSneaking = controls.sneak;

        let currentSpeed = WALK_SPEED;
        if (isFlying) {
            currentSpeed = FLY_SPEED;
        } else if (isSprinting) {
            currentSpeed = SPRINT_SPEED;
        } else if (isSneaking) {
            currentSpeed = SNEAK_SPEED;
        }

        moveVector.set(
            (controls.right ? 1 : 0) - (controls.left ? 1 : 0),
            0,
            (controls.backward ? 1 : 0) - (controls.forward ? 1 : 0)
        ).normalize().multiplyScalar(currentSpeed);

        if (isFlying) {
            moveVector.y = (controls.up ? 1 : 0) - (controls.down ? 1 : 0);
            moveVector.normalize().multiplyScalar(currentSpeed);
            moveVector.applyQuaternion(camera.quaternion);
        } else {
            moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        }

        newPosition.copy(player.position).add(moveVector);
        const collisionResult = checkCollision(newPosition, scene);
        if (!collisionResult.collides) {
            player.position.copy(newPosition);
        } else {
            // Slide along the collision surface
            slideVector.copy(moveVector).projectOnPlane(collisionResult.normal);
            slidePosition.copy(player.position).add(slideVector);
            if (!checkCollision(slidePosition, scene).collides) {
                player.position.copy(slidePosition);
            }
        }

        // Apply movement in steps (Y, X, Z)
        applyMovementWithCollision(player, moveVector, scene);

        if (!isFlying) {
            applyVerticalPhysics(controls, player, scene);
        }

        // Update camera position
        camera.position.copy(player.position).add(new THREE.Vector3(0, isFlying ? 0 : 0.7, 0));
    }

    return updatePlayerMovement;
}

function applyMovementWithCollision(player, moveVector, scene) {
    // Y-axis movement
    newPosition.copy(player.position).add(new THREE.Vector3(0, moveVector.y, 0));
    let collisionResult = checkCollision(newPosition, scene);
    if (!collisionResult.collides) {
        player.position.y = newPosition.y;
    } else {
        if (moveVector.y < 0) isOnGround = true;
        moveVector.y = 0;
    }

    // X-axis movement
    newPosition.copy(player.position).add(new THREE.Vector3(moveVector.x, 0, 0));
    collisionResult = checkCollision(newPosition, scene);
    if (!collisionResult.collides) {
        player.position.x = newPosition.x;
    } else {
        moveVector.x = 0;
    }

    // Z-axis movement
    newPosition.copy(player.position).add(new THREE.Vector3(0, 0, moveVector.z));
    collisionResult = checkCollision(newPosition, scene);
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

    const collisionResult = checkCollision(newPosition, scene);
    if (!collisionResult.collides) {
        player.position.y = newPosition.y;
    } else {
        if (yVelocity < 0) {
            isOnGround = true;
        }
        yVelocity = 0;
    }

    // Ground check
    groundCheck.copy(player.position);
    groundCheck.y -= 0.1;
    if (!checkCollision(groundCheck, scene).collides) {
        isOnGround = false;
    }
}

function checkCollision(position, scene) {
    playerBox.setFromCenterAndSize(
        position,
        new THREE.Vector3(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH)
    );

    for (const chunkGroup of scene.children) {
        if (chunkGroup.isGroup) {
            for (const instancedMesh of chunkGroup.children) {
                if (instancedMesh.isInstancedMesh) {
                    for (let i = 0; i < instancedMesh.count; i++) {
                        instancedMesh.getMatrixAt(i, matrix);
                        blockPosition.setFromMatrixPosition(matrix);
                        blockBox.setFromCenterAndSize(
                            blockPosition,
                            new THREE.Vector3(1, 1, 1)
                        );
                        if (playerBox.intersectsBox(blockBox)) {
                            collisionNormal.subVectors(position, blockPosition).normalize();
                            return { collides: true, normal: collisionNormal };
                        }
                    }
                }
            }
        }
    }
    return { collides: false, normal: new THREE.Vector3() };
}