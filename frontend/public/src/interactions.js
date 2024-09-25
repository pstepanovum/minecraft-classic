import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';

// Assume blockTextures and createBlock are defined elsewhere

export function setupBlockInteractions(scene, player, camera) {
    const raycaster = new THREE.Raycaster();
    const maxInteractionDistance = 4;

    function addBlock(event, socket) {
        if (event.button !== 0) return; // Only proceed for left-click (button 0)

        event.preventDefault();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        const blockObjects = scene.children.filter(obj => obj.userData && obj.userData.blockType && !obj.userData.isPlayer);
        const intersects = raycaster.intersectObjects(blockObjects, false);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const clickedObject = intersect.object;

            // Calculate the position for the new block
            const newBlockPosition = clickedObject.position.clone().add(intersect.face.normal);

            // Check if the new block position is within range
            const distance = player.position.distanceTo(newBlockPosition);
            if (distance > maxInteractionDistance) {
                console.log('Cannot place block: too far away');
                return;
            }

            // Round the position to the nearest integer
            newBlockPosition.round();

            // Check if there's already a block at the new position
            const existingBlock = scene.children.find(obj => 
                obj.userData && obj.userData.blockType &&
                obj.position.equals(newBlockPosition)
            );

            if (existingBlock) {
                console.log('Cannot place block: position occupied');
                return;
            }

            // Emit 'addBlock' event to the server
            socket.emit('addBlock', {
                x: newBlockPosition.x,
                y: newBlockPosition.y,
                z: newBlockPosition.z,
                type: 'stone' // Default to stone, you can change this or make it selectable
            }, (confirmation) => {
                if (confirmation.success) {
                    console.log('Block addition confirmed');
                    const newBlock = createBlock('stone');
                    newBlock.position.copy(newBlockPosition);
                    scene.add(newBlock);

                    // Add edges to the new block
                    const edges = new THREE.EdgesGeometry(newBlock.geometry);
                    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
                    line.position.copy(newBlock.position);
                    scene.add(line);
                    newBlock.userData.line = line;
                } else {
                    console.log('Block addition failed');
                }
            });
        }
    }

    function removeBlock(event, socket) {
        if (event.button !== 2) return; // Only proceed for right-click (button 2)

        event.preventDefault();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

        const blockObjects = scene.children.filter(obj => obj.userData && obj.userData.blockType && !obj.userData.isPlayer);
        const intersects = raycaster.intersectObjects(blockObjects, false);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            const clickedObject = intersect.object;
            const blockPosition = clickedObject.position.clone().round();

            const distance = player.position.distanceTo(blockPosition);
            if (distance > maxInteractionDistance) {
                console.log('Block is too far away');
                return;
            }

            socket.emit('removeBlock', {
                x: blockPosition.x,
                y: blockPosition.y,
                z: blockPosition.z
            }, (confirmation) => {
                if (confirmation.success) {
                    console.log('Block removal confirmed');
                    scene.remove(clickedObject);
                    if (clickedObject.userData && clickedObject.userData.line) {
                        scene.remove(clickedObject.userData.line);
                    }
                } else {
                    console.log('Block removal failed');
                }
            });
        }
    }

    return { addBlock, removeBlock };
}