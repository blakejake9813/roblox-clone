const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecae6);
scene.fog = new THREE.Fog(0x8ecae6, 15, 80);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game-root').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.rotation.order = 'YXZ';

const world = {
  blocks: [],
  coins: [],
};

const player = {
  position: new THREE.Vector3(0, 1.2, 12),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  speed: 8,
  jumpForce: 7.5,
  onGround: true,
};

const clock = new THREE.Clock();
const ground = new THREE.Mesh(
  new THREE.BoxGeometry(100, 1, 100),
  new THREE.MeshStandardMaterial({ color: 0x5f8f5a, roughness: 0.9, metalness: 0.05 })
);
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x476a6a, 1.3);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(12, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const scoreEl = document.getElementById('score');
const totalCoinsEl = document.getElementById('totalCoins');
const coinsLeftEl = document.getElementById('coinsLeft');
const statusEl = document.getElementById('status');
const messageBox = document.getElementById('messageBox');

let score = 0;
const totalCoins = 10;
const keyState = {};

function setMessage(text, timeout = 0) {
  messageBox.textContent = text;
  messageBox.classList.remove('hidden');
  if (timeout > 0) {
    setTimeout(() => {
      messageBox.classList.add('hidden');
    }, timeout);
  }
}

function createBlock(position, color = 0x7dd3fc) {
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.7,
      metalness: 0.15,
    })
  );

  block.position.copy(position).addScalar(0.5);
  block.castShadow = true;
  block.receiveShadow = true;
  block.userData.isBlock = true;
  world.blocks.push(block);
  scene.add(block);
}

function spawnCoin(position) {
  const coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0x7c5a00,
    emissiveIntensity: 0.5,
    metalness: 0.7,
    roughness: 0.3,
  });

  const coin = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.14, 12, 28), coinMaterial);
  coin.position.copy(position);
  coin.rotation.x = Math.PI / 2;
  coin.userData.isCoin = true;
  coin.userData.baseY = position.y;
  scene.add(coin);
  world.coins.push(coin);
}

function resetCoins() {
  world.coins.forEach((coin) => scene.remove(coin));
  world.coins = [];

  for (let i = 0; i < totalCoins; i += 1) {
    const x = Math.floor(Math.random() * 20 - 10);
    const z = Math.floor(Math.random() * 20 - 10);
    const y = 2.2 + Math.random() * 1.8;
    spawnCoin(new THREE.Vector3(x, y, z));
  }

  score = 0;
  totalCoinsEl.textContent = String(totalCoins);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = String(score);
  coinsLeftEl.textContent = String(Math.max(totalCoins - score, 0));
}

function createStarterWorld() {
  const palette = [0x7dd3fc, 0xa78bfa, 0xfca5a5, 0x86efac, 0xfcd34d];

  for (let x = -8; x <= 8; x += 1) {
    for (let z = -8; z <= 8; z += 1) {
      if (Math.abs(x) > 7 && Math.abs(z) > 7) {
        const y = 0;
        createBlock(new THREE.Vector3(x, y, z), palette[(x + z + 20) % palette.length]);
      }
    }
  }

  for (let i = 0; i < 6; i += 1) {
    const x = Math.floor(Math.random() * 12 - 6);
    const z = Math.floor(Math.random() * 12 - 6);
    const blockY = 1 + Math.floor(Math.random() * 3);
    createBlock(new THREE.Vector3(x, blockY, z), palette[i % palette.length]);
  }

  resetCoins();
}

function getBuildTargetPoint() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  raycaster.setFromCamera(pointer, camera);

  const intersections = raycaster.intersectObjects([ground, ...world.blocks], false);
  if (intersections.length === 0) return null;

  return intersections[0];
}

function placeBlockAtHit(hit) {
  if (!hit) return;
  const normal = hit.face.normal.clone();
  const worldNormal = normal.transformDirection(hit.object.matrixWorld);
  const target = hit.point.clone().add(worldNormal.clone().multiplyScalar(0.6));
  const snapped = new THREE.Vector3(
    Math.round(target.x),
    Math.round(target.y),
    Math.round(target.z)
  );

  if (snapped.distanceTo(player.position) < 2) return;

  const exists = world.blocks.some((block) => block.position.equals(snapped));
  if (!exists) {
    createBlock(snapped, 0x93c5fd);
  }
}

function removeBlockAtHit(hit) {
  if (!hit || !hit.object.userData.isBlock) return;
  const index = world.blocks.indexOf(hit.object);
  if (index !== -1) {
    scene.remove(world.blocks[index]);
    world.blocks.splice(index, 1);
  }
}

function handlePointerAction(event) {
  if (document.pointerLockElement !== renderer.domElement) return;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(0, 0);
  raycaster.setFromCamera(pointer, camera);

  const targets = [ground, ...world.blocks];
  const intersections = raycaster.intersectObjects(targets, false);
  if (intersections.length === 0) return;

  if (event.button === 0) {
    placeBlockAtHit(intersections[0]);
  } else if (event.button === 2) {
    removeBlockAtHit(intersections[0]);
  }
}

window.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('mousedown', (event) => {
  handlePointerAction(event);
});

renderer.domElement.addEventListener('click', () => {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  statusEl.textContent =
    document.pointerLockElement === renderer.domElement
      ? 'Movement locked. Use WASD + Space.'
      : 'Click the game to lock the cursor';
});

document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0018;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.45, 1.45);
});

window.addEventListener('keydown', (event) => {
  keyState[event.code] = true;
  if (event.code === 'Space' && player.onGround) {
    player.velocity.y = player.jumpForce;
    player.onGround = false;
  }
});

window.addEventListener('keyup', (event) => {
  keyState[event.code] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function updatePlayer(delta) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const move = new THREE.Vector3();

  if (keyState.KeyW) move.add(forward);
  if (keyState.KeyS) move.sub(forward);
  if (keyState.KeyA) move.sub(right);
  if (keyState.KeyD) move.add(right);

  if (move.lengthSq() > 0) {
    move.normalize();
    player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, move.x * player.speed, 0.15);
    player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, move.z * player.speed, 0.15);
  } else {
    player.velocity.x = THREE.MathUtils.lerp(player.velocity.x, 0, 0.18);
    player.velocity.z = THREE.MathUtils.lerp(player.velocity.z, 0, 0.18);
  }

  player.velocity.y -= 18 * delta;
  player.position.x += player.velocity.x * delta;
  player.position.z += player.velocity.z * delta;
  player.position.y += player.velocity.y * delta;

  if (player.position.y < 1) {
    player.position.y = 1;
    player.velocity.y = 0;
    player.onGround = true;
  }

  const maxHorizontal = 34;
  player.position.x = THREE.MathUtils.clamp(player.position.x, -maxHorizontal, maxHorizontal);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -maxHorizontal, maxHorizontal);

  const cameraOffset = new THREE.Vector3(0, 0.7, 0);
  camera.position.copy(player.position).add(cameraOffset);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function collectCoins() {
  for (let i = world.coins.length - 1; i >= 0; i -= 1) {
    const coin = world.coins[i];
    const distance = coin.position.distanceTo(player.position);

    if (distance < 1.4) {
      scene.remove(coin);
      world.coins.splice(i, 1);
      score += 1;
      updateHud();

      if (score >= totalCoins) {
        setMessage('Victory! You collected every coin!', 2400);
        resetCoins();
      } else {
        setMessage('Coin collected!', 500);
      }
    }
  }
}

function animateCoins(delta) {
  world.coins.forEach((coin) => {
    coin.rotation.z += delta * 2.4;
    coin.position.y = coin.userData.baseY + Math.sin(performance.now() * 0.003 + coin.position.x) * 0.18;
  });
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.033);

  updatePlayer(delta);
  animateCoins(delta);
  collectCoins();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

createStarterWorld();
updateHud();
setMessage('Find all glowing coins. Build with left click. Remove with right click.', 2600);
animate();
