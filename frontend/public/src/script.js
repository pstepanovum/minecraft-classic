import { createPlayer, createOtherPlayer, addPlayerControls, checkCollisions } from './players.js';
import { createMiniMap } from './minimap.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';
import { io } from 'https://cdn.socket.io/4.5.0/socket.io.min.js';

// Constants
const CHUNK_SIZE = 16;
const RENDER_DISTANCE = 5;
const MAX_INTERACTION_DISTANCE = 4;
const UNKNOWN_BLOCK_COLOR = 0xFF00FF;

// Global variables
let scene, camera, renderer, player;
let lastPlayerPosition = new THREE.Vector3();
let socket;
const chunks = new Map();
const removedBlocks = new Set();

// Load textures
const textureLoader = new THREE.TextureLoader();
const blockTextures = {
    grass: {
        top: textureLoader.load('./texture-pack/grass-top.png'),
        bottom: textureLoader.load('./texture-pack/dirt.jpg'),
        side: textureLoader.load('./texture-pack/grass-side.jpg')
    },
    dirt: textureLoader.load('./texture-pack/dirt.jpg'),
    stone: textureLoader.load('./texture-pack/stone.webp'),
};

function init() {
    setupScene();
    setupLighting();
    setupPlayer();
    setupSocketConnection();
    setupEventListeners();

    animate();
}

function setupScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 20);

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0x87CEFA);
    document.body.appendChild(renderer.domElement);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xcccccc, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
}

function setupPlayer() {
    player = createPlayer(scene);
    const updatePlayerMovement = addPlayerControls(player, camera, scene, renderer.domElement, socket);
    const updateMiniMap = createMiniMap(scene, player);
    return { updatePlayerMovement, updateMiniMap };
}

function setupSocketConnection() {
    const serverUrl = process.env.NODE_ENV === 'production' 
        ? 'minecraft-classic-production.up.railway.app' 
        : 'http://localhost:3000';
    
    socket = io(serverUrl, {
        withCredentials: true,
        transports: ['websocket', 'polling']
    });

    socket.on('initialChunks', handleInitialChunks);
    socket.on('initialState', handleInitialState);
    socket.on('blockRemoved', handleBlockRemoved);
    socket.on('updateChunks', handleUpdateChunks);
    socket.on('currentPlayers', handleCurrentPlayers);
    socket.on('newPlayer', handleNewPlayer);
    socket.on('removePlayer', handleRemovePlayer);
    socket.on('updatePlayer', handleUpdatePlayer);
}

function setupEventListeners() {
    window.addEventListener('wheel', onScroll);
    window.addEventListener('click', removeBlock);
    window.addEventListener('resize', onWindowResize);
}

function animate() {
    const { updatePlayerMovement, updateMiniMap } = setupPlayer();

    renderer.setAnimationLoop(() => {
        updatePlayerMovement();
        updateMiniMap();
        renderer.render(scene, camera);
        sendPlayerPosition();
    });
}

function sendPlayerPosition() {
    if (player && player.position.distanceTo(lastPlayerPosition) > 0.01) {
        socket.emit('playerMoved', player.position);
        lastPlayerPosition.copy(player.position);
    }
}

// Socket event handlers
function handleInitialChunks(data) {
    console.log('Received initial chunks:', data);
    
    if (Array.isArray(data)) {
        data.forEach(renderChunk);
    } else if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data.removedBlocks)) {
            removedBlocks.clear();
            data.removedBlocks.forEach(block => removedBlocks.add(block));
        } else {
            console.warn('Received removedBlocks is not an array:', data.removedBlocks);
        }

        if (Array.isArray(data.chunks)) {
            data.chunks.forEach(renderChunk);
        } else {
            console.warn('Received chunks is not an array:', data.chunks);
        }
    } else {
        console.error('Received unexpected data format for initialChunks:', data);
    }
}

function handleInitialState(data) {
    removedBlocks.clear();
    data.removedBlocks.forEach(block => removedBlocks.add(block));
    data.chunks.forEach(renderChunk);
}

function handleBlockRemoved(blockPosition) {
    const blockKey = `${blockPosition.x},${blockPosition.y},${blockPosition.z}`;
    removedBlocks.add(blockKey);
    const blockToRemove = scene.children.find(child => 
        child.position.equals(new THREE.Vector3(blockPosition.x, blockPosition.y, blockPosition.z))
    );
    if (blockToRemove) {
        removeBlockFromScene(blockToRemove);
    }
}

function handleUpdateChunks(chunksToUpdate) {
    chunksToUpdate.forEach(chunk => {
        const chunkKey = `${chunk.chunkX},${chunk.chunkZ}`;
        if (!chunks.has(chunkKey)) {
            renderChunk(chunk);
        }
    });
}

function handleCurrentPlayers(players) {
    Object.entries(players).forEach(([id, playerData]) => {
        if (id !== socket.id) {
            createOtherPlayer(scene, id, playerData);
        }
    });
}

function handleNewPlayer(player) {
    createOtherPlayer(scene, player.id, player.position);
}

function handleRemovePlayer(id) {
    const playerToRemove = scene.getObjectByName(id);
    if (playerToRemove) {
        scene.remove(playerToRemove);
    }
}

function handleUpdatePlayer(player) {
    const playerObject = scene.getObjectByName(player.id);
    if (playerObject) {
        playerObject.position.set(player.position.x, player.position.y, player.position.z);
    }
}

// Chunk and block rendering functions
function renderChunk(chunk) {
    if (!isValidChunk(chunk)) {
        console.error('Invalid chunk data:', chunk);
        return;
    }

    const chunkKey = getChunkKey(chunk);
    removeExistingChunk(chunkKey);

    const chunkBlocks = [];
    chunk.blocks.forEach(columnData => {
        if (isValidColumnData(columnData)) {
            renderColumn(columnData, chunkBlocks);
        } else {
            console.warn('Invalid column data:', columnData);
        }
    });

    chunks.set(chunkKey, chunkBlocks);
}

function isValidChunk(chunk) {
    return chunk && 
           typeof chunk.chunkX === 'number' && 
           typeof chunk.chunkZ === 'number' && 
           Array.isArray(chunk.blocks);
}

function getChunkKey(chunk) {
    return `${chunk.chunkX},${chunk.chunkZ}`;
}

function removeExistingChunk(chunkKey) {
    if (chunks.has(chunkKey)) {
        const existingChunk = chunks.get(chunkKey);
        existingChunk.forEach(removeBlockFromScene);
        chunks.delete(chunkKey);
    }
}

function isValidColumnData(columnData) {
    return typeof columnData.x === 'number' && 
           typeof columnData.z === 'number' && 
           typeof columnData.height === 'number';
}

function renderColumn(columnData, chunkBlocks) {
    for (let y = 0; y <= columnData.height; y++) {
        const blockKey = getBlockKey(columnData.x, y, columnData.z);
        if (!removedBlocks.has(blockKey)) {
            const blockType = getBlockType(y, columnData.height);
            const blockMesh = createBlock(blockType);
            if (blockMesh) {
                addBlockToScene(blockMesh, columnData.x, y, columnData.z);
                chunkBlocks.push(blockMesh);
            }
        }
    }
}

function getBlockKey(x, y, z) {
    return `${x},${y},${z}`;
}

function addBlockToScene(blockMesh, x, y, z) {
    blockMesh.position.set(x, y, z);
    scene.add(blockMesh);

    const edges = new THREE.EdgesGeometry(blockMesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    line.position.copy(blockMesh.position);
    scene.add(line);

    blockMesh.userData.line = line;
}

function removeBlock(event) {
    event.preventDefault();

    const intersectedBlock = getIntersectedBlock();
    if (intersectedBlock && isBlockWithinReach(intersectedBlock)) {
        const blockPosition = intersectedBlock.position.clone().round();
        const blockKey = getBlockKey(blockPosition.x, blockPosition.y, blockPosition.z);
        removedBlocks.add(blockKey);
        socket.emit('removeBlock', blockPosition);
        removeBlockFromScene(intersectedBlock);
    } else if (intersectedBlock) {
        console.log('Block is too far away');
    }
}

function getIntersectedBlock() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const blockObjects = scene.children.filter(obj => obj.userData && obj.userData.blockType);
    const intersects = raycaster.intersectObjects(blockObjects, false);

    return intersects.length > 0 ? intersects[0].object : null;
}

function isBlockWithinReach(block) {
    return player.position.distanceTo(block.position) <= MAX_INTERACTION_DISTANCE;
}

function removeBlockFromScene(block) {
    scene.remove(block);
    if (block.userData && block.userData.line) {
        scene.remove(block.userData.line);
    }
}

function createBlock(blockType) {
    if (blockType === 'air') return null;

    const geometry = new THREE.BoxGeometry();
    const materials = getBlockMaterials(blockType);

    const cube = new THREE.Mesh(geometry, materials);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.userData.blockType = blockType;

    return cube;
}

function getBlockMaterials(blockType) {
    switch (blockType) {
        case 'grass':
            return [
                new THREE.MeshLambertMaterial({ map: blockTextures.grass.side }),
                new THREE.MeshLambertMaterial({ map: blockTextures.grass.side }),
                new THREE.MeshLambertMaterial({ map: blockTextures.grass.top }),
                new THREE.MeshLambertMaterial({ map: blockTextures.grass.bottom }),
                new THREE.MeshLambertMaterial({ map: blockTextures.grass.side }),
                new THREE.MeshLambertMaterial({ map: blockTextures.grass.side })
            ];
        case 'dirt':
            return new THREE.MeshLambertMaterial({ map: blockTextures.dirt });
        case 'stone':
            return new THREE.MeshLambertMaterial({ map: blockTextures.stone });
        case 'water':
            return new THREE.MeshPhongMaterial({
                map: blockTextures.water,
                transparent: true,
                opacity: 0.7
            });
        default:
            console.warn(`Unknown block type: ${blockType}`);
            return new THREE.MeshLambertMaterial({ color: UNKNOWN_BLOCK_COLOR });
    }
}

function getBlockType(y, surfaceHeight) {
    if (y === surfaceHeight) return 'grass';
    if (y > surfaceHeight - 3) return 'dirt';
    return 'stone';
}

// Event handlers
function onScroll(event) {
    camera.fov = Math.max(0, Math.min(200, camera.fov + (event.deltaY < 0 ? -1 : 1)));
    camera.updateProjectionMatrix();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('load', init);