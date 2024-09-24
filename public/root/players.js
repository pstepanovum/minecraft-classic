const PLAYER_HEIGHT = 1.90;
const PLAYER_WIDTH = 0.9;
const COLLISION_EPSILON = 0.01;
const JUMP_SPEED = 0.089;
const GRAVITY = 0.003;
const TERMINAL_VELOCITY = -3;
const GROUND_LEVEL = 1;
const MOVE_SPEED = 0.09;
const MOUSE_LOOK_SENSITIVITY = 0.002;

let isJumping = false;
let yVelocity = 0;
let isPointerLocked = false;
let yaw = 0;
let pitch = 0;



export function createOtherPlayer(scene, id, position) {
    const geometry = new THREE.BoxGeometry(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH);
    const material = new THREE.MeshLambertMaterial({ color: 0x0000ff });
    const otherPlayer = new THREE.Mesh(geometry, material);
    otherPlayer.position.set(position.x, position.y, position.z);
    otherPlayer.name = id;
    otherPlayer.castShadow = true;
    otherPlayer.receiveShadow = true;
    scene.add(otherPlayer);
}

export function createPlayer(scene) {
    const geometry = new THREE.BoxGeometry(PLAYER_WIDTH, PLAYER_HEIGHT, 0.9);
    const material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const player = new THREE.Mesh(geometry, material);

    function isPositionValid(position) {
        const playerBox = new THREE.Box3().setFromObject(player);
        playerBox.translate(position);
        return !scene.children.some(object => 
            object !== player && object.isMesh && 
            playerBox.intersectsBox(new THREE.Box3().setFromObject(object))
        );
    }

    let spawnPosition = new THREE.Vector3(0, 20, 0);
    while (!isPositionValid(spawnPosition)) {
        spawnPosition.y += 10;
    }

    player.position.copy(spawnPosition);
    player.castShadow = true;
    player.receiveShadow = true;
    scene.add(player);
    return player;
}

export function addPlayerControls(player, camera, scene, canvas) {
    const controls = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
    };

    function handleKeyEvent(event, isKeyDown) {
        const keyMap = {
            'w': 'forward',
            's': 'backward',
            'a': 'left',
            'd': 'right',
            ' ': 'jump'
        };
        if (keyMap[event.key]) {
            controls[keyMap[event.key]] = isKeyDown;
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
        const moveVector = new THREE.Vector3(
            (controls.right ? 1 : 0) - (controls.left ? 1 : 0),
            0,
            (controls.backward ? 1 : 0) - (controls.forward ? 1 : 0)
        ).normalize().multiplyScalar(MOVE_SPEED);

        moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        movePlayerWithCollisions(player, moveVector, scene);
        applyVerticalPhysics(controls, player, scene);

        camera.position.copy(player.position).add(new THREE.Vector3(0, 0.5, 0));
    }

    return updatePlayerMovement;
}

function applyVerticalPhysics(controls, player, scene) {
    if (controls.jump && !isJumping) {
        isJumping = true;
        yVelocity = JUMP_SPEED;
    }

    if (isJumping) {
        yVelocity = Math.max(yVelocity - GRAVITY, TERMINAL_VELOCITY);
        player.position.y += yVelocity;

        const collisionObject = checkCollisions(player, scene);
        if (collisionObject) {
            const objectBox = new THREE.Box3().setFromObject(collisionObject);
            if (yVelocity > 0) {
                player.position.y = objectBox.min.y - PLAYER_HEIGHT / 2 - COLLISION_EPSILON;
                yVelocity = 0;
            } else {
                player.position.y = objectBox.max.y + PLAYER_HEIGHT / 2 + COLLISION_EPSILON;
                isJumping = false;
                yVelocity = 0;
            }
        }
    } else {
        yVelocity = Math.max(yVelocity - GRAVITY, TERMINAL_VELOCITY);
        player.position.y += yVelocity;

        const collisionObject = checkCollisions(player, scene);
        if (collisionObject) {
            player.position.y -= yVelocity;
            yVelocity = 0;
        }
    }

    if (player.position.y <= GROUND_LEVEL) {
        player.position.y = GROUND_LEVEL;
        isJumping = false;
        yVelocity = 0;
    }
}

function movePlayerWithCollisions(player, moveVector, scene) {
    ['x', 'z', 'y'].forEach(axis => {
        const axisMove = new THREE.Vector3().setComponent(
            ['x', 'y', 'z'].indexOf(axis),
            moveVector[axis]
        );
        player.position.add(axisMove);
        if (checkCollisions(player, scene)) {
            player.position.sub(axisMove);
        }
    });
}

export function checkCollisions(player, scene) {
    const playerBox = new THREE.Box3().setFromObject(player);
    return scene.children.find(object => 
        object !== player && object.isMesh && 
        playerBox.intersectsBox(new THREE.Box3().setFromObject(object))
    ) || null;
}