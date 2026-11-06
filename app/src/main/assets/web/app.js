import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { clone } from './vendor/SkeletonUtils.js';
import { ColoringSheet } from './coloring-sheet.js';

const byId = id => document.getElementById(id);
const species = {
  charmander: '파이리', bulbasaur: '이상해씨', squirtle: '꼬부기', eevee: '이브이', pikachu: '피카츄',
};
const colors = {
  '빨강': '#eb3d55', '주황': '#ff8736', '노랑': '#ffdf51', '초록': '#4ab96a',
  '파랑': '#3b83ea', '보라': '#914be5', '분홍': '#ff82bc', '흰색': '#ffffff', '검정': '#232035',
};
const buttons = [...document.querySelectorAll('button, select, input')];
const status = byId('status');
const stage = byId('stage');
const sharedGarden = location.pathname === '/garden';
const nas = window.HomeGarden;
const characterSync = window.NasCharacters;
const bundled = Object.entries(species).map(([id, name]) => ({ id, name }));
const profileNames = { '아이 1': '현진', '아이 2': '현서' };
const loader = new GLTFLoader();
const library = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
const sheet = new ColoringSheet();
let renderer, controls, lawn, model, db;
let currentView = 'splash';
let settingsReturn = 'home';
let preferences;
let synced = [];
let selectedCharacter;
let lastCharacterTap = 0;
let catalogButtons = [];
let color = Object.values(colors)[0];
let busy = false;
let strokes = [];
let activeStroke;
let press;
let pendingUpload;
let shownUploads;
const residents = [];

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('family-garden', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drawings', { autoIncrement: true });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function drawings(mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('drawings', mode);
    const request = operation(transaction.objectStore('drawings'));
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve(request.result);
  });
}

async function latestDrawings() {
  return new Promise((resolve, reject) => {
    const found = [];
    const transaction = db.transaction('drawings', 'readonly');
    const request = transaction.objectStore('drawings').openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      found.push(cursor.value);
      if (found.length < 6) cursor.continue();
    };
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve(found.reverse());
  });
}

function loadAsset(id, hash) {
  const path = hash ? './synced/' + hash + '.glb' : './models/' + id + '.glb';
  if (!library.has(path)) {
    library.set(path, loader.loadAsync(path).catch(error => {
      library.delete(path);
      throw error;
    }));
  }
  return library.get(path);
}

async function loadModel(id, hash) {
  const asset = await loadAsset(id, hash);
  const object = clone(asset.scene);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  const size = box.getSize(new THREE.Vector3());
  const root = new THREE.Group();
  root.scale.setScalar(1.45 / Math.max(size.x, size.y, size.z));
  root.add(object);

  const materials = new Map();
  const layers = [];
  const byTexture = new Map();
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    const copyMaterial = original => {
      if (materials.has(original)) return materials.get(original);
      const material = original.clone();
      materials.set(original, material);
      if (original.map) {
        if (!byTexture.has(original.map)) {
          const layer = { id: layers.length, source: original.map, materials: [] };
          byTexture.set(original.map, layer);
          layers.push(layer);
        }
        const layer = byTexture.get(original.map);
        layer.materials.push(material);
        material.userData.paintLayer = layer.id;
      }
      return material;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copyMaterial) : copyMaterial(mesh.material);
  });
  return { root, layers, materials, mixer: new THREE.AnimationMixer(object), clips: asset.animations };
}

function release(pet) {
  if (!pet) return;
  pet.root.removeFromParent();
  pet.mixer.stopAllAction();
  for (const material of pet.materials.values()) material.dispose();
  for (const layer of pet.layers) layer.texture?.dispose();
  const skeletons = new Set();
  pet.root.traverse(node => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
}

function resetLayer(layer) {
  const { canvas, context, source } = layer;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  layer.texture.needsUpdate = true;
}

function prepareLayer(layer) {
  if (layer.canvas) return;
  const source = layer.source;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 768 / Math.max(source.image.width, source.image.height));
  canvas.width = Math.max(1, Math.round(source.image.width * scale));
  canvas.height = Math.max(1, Math.round(source.image.height * scale));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = source.colorSpace;
  texture.flipY = source.flipY;
  texture.channel = source.channel;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.matrix.copy(source.matrix);
  texture.matrixAutoUpdate = false;
  layer.canvas = canvas;
  layer.context = canvas.getContext('2d');
  layer.texture = texture;
  for (const material of layer.materials) material.map = texture;
  resetLayer(layer);
}

function mark(pet, stroke, point, previous) {
  const [id, u, v] = point;
  const layer = pet.layers[id];
  if (!layer) return;
  prepareLayer(layer);
  const { canvas, context, texture } = layer;
  const x = u * canvas.width;
  const y = v * canvas.height;
  const radius = Math.max(1, stroke.size / 420 * Math.max(canvas.width, canvas.height));
  context.fillStyle = context.strokeStyle = stroke.color;
  if (previous?.[0] === id && Math.hypot(u - previous[1], v - previous[2]) < 0.14) {
    context.lineWidth = radius * 2;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(previous[1] * canvas.width, previous[2] * canvas.height);
    context.lineTo(x, y);
    context.stroke();
  }
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
  texture.needsUpdate = true;
}

function replay(pet, history) {
  for (const layer of pet.layers) if (layer.canvas) resetLayer(layer);
  for (const stroke of history) {
    let previous;
    for (const point of stroke.points) {
      if (point) mark(pet, stroke, point, previous);
      previous = point;
    }
  }
}

function ray(event) {
  const editing = currentView === 'studio';
  const rect = (editing ? sheet.element : renderer.domElement).getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
  raycaster.setFromCamera(pointer, editing ? sheet.camera : camera);
  return raycaster;
}

function paint(event) {
  const hit = ray(event).intersectObject(model.root, true)[0];
  const material = Array.isArray(hit?.object.material)
    ? hit.object.material[hit.face.materialIndex] : hit?.object.material;
  const layer = model.layers[material?.userData.paintLayer];
  const uv = layer?.source.channel === 1 ? hit?.uv1 : hit?.uv;
  if (!layer || !uv) {
    if (activeStroke.points.at(-1)) activeStroke.points.push(null);
    sheet.add(activeStroke, null);
    return;
  }
  layer.source.updateMatrix();
  const mapped = layer.source.transformUv(uv.clone());
  const point = [layer.id, Math.round(mapped.x * 10000) / 10000, Math.round(mapped.y * 10000) / 10000];
  const previous = activeStroke.points.at(-1);
  if (previous && previous[0] === point[0] && Math.hypot(previous[1] - point[1], previous[2] - point[2]) < 0.002) return;
  activeStroke.points.push(point);
  sheet.add(activeStroke, {
    x: (pointer.x + 1) * sheet.element.width / 2,
    y: (1 - pointer.y) * sheet.element.height / 2,
  });
}

function play(pet, name, once = false) {
  const clip = pet.clips.find(item => item.name === name);
  if (!clip || (pet.action?.getClip() === clip && !once)) return;
  const action = pet.mixer.clipAction(clip);
  if (pet.action && pet.action !== action) pet.action.fadeOut(0.16);
  action.reset().setEffectiveWeight(1).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  action.clampWhenFinished = once;
  action.fadeIn(0.16).play();
  pet.action = action;
}

function setView(view) {
  currentView = view;
  for (const id of ['splash', 'home', 'picker', 'serverSettings']) {
    byId(id).hidden = id !== (view === 'settings' ? 'serverSettings' : view);
  }
  byId('header').hidden = view === 'splash';
  byId('back').hidden = sharedGarden || view === 'home';
  byId('settings').hidden = sharedGarden || view === 'settings';
  byId('workspace').hidden = view !== 'studio' && view !== 'garden';
  stage.classList.toggle('is-sheet', view === 'studio');
  sheet.element.hidden = view !== 'studio';
  renderer.domElement.hidden = view !== 'garden';
  controls.enabled = view === 'garden';
  lawn.visible = view === 'garden';
  scene.background.set(view === 'garden' ? '#d5edfb' : '#dcefd4');
  byId('editor').hidden = view !== 'studio';
  byId('gardenInfo').hidden = view !== 'garden';
}

function positionCamera(garden) {
  camera.position.set(...(garden ? [3.6, 4.4, 7.4] : [0, 1.25, 4]));
  controls.target.set(0, garden ? 0 : 0.65, 0);
  controls.update();
}

async function openStudio(character) {
  const { id, name, hash } = character;
  const next = await loadModel(id, hash);
  release(model);
  residents.splice(0).forEach(release);
  model = next;
  model.speciesId = id;
  model.character = character;
  byId('drawingTitle').textContent = name + ' 색칠하기';
  strokes = [];
  scene.add(model.root);
  lawn.visible = false;
  sheet.prepare(renderer, scene);
  setView('studio');
  status.textContent = hash
    ? '정면 도안에 칠하고 패드의 내 정원에 저장할 수 있어요.'
    : '색을 고르고 정면 도안에 칠해요.';
}

async function openGarden(entries = null) {
  entries ??= await latestDrawings();
  const next = [];
  try {
    for (const [index, entry] of entries.entries()) {
      const pet = await loadModel(entry.id, entry.hash);
      next.push(pet);
      replay(pet, entry.strokes);
      const row = Math.floor(index / 3);
      const columns = Math.min(3, entries.length - row * 3);
      const x = (index % 3 - (columns - 1) / 2) * 2.15;
      const z = entries.length > 3 ? (row - 0.5) * 2.5 : 0;
      pet.home = new THREE.Vector3(x, 0, z);
      pet.root.position.copy(pet.home);
      pet.phase = index * 1.9 % 9;
      pet.reactUntil = 0;
      play(pet, 'idle');
    }
  } catch (error) {
    next.forEach(release);
    throw error;
  }
  release(model);
  model = null;
  strokes = [];
  residents.splice(0).forEach(release);
  residents.push(...next);
  residents.forEach(pet => scene.add(pet.root));
  byId('residents').replaceChildren(...entries.map(entry => {
    const item = document.createElement('li');
    item.textContent = (profileNames[entry.profile] ?? entry.profile) + ' · ' + (entry.name ?? species[entry.id]);
    return item;
  }));
  setView('garden');
  if (!sharedGarden || shownUploads === undefined) positionCamera(true);
  status.textContent = entries.length ? '포켓몬이 정원에서 놀고 있어요.' : '포켓몬을 색칠해서 정원에 보내보세요.';
}

function updateGarden(dt, time) {
  for (const pet of residents) {
    if (time >= pet.reactUntil) {
      pet.phase = (pet.phase + dt) % 9;
      const phase = pet.phase;
      const angle = Math.min(phase, 5) / 5 * 2 * Math.PI;
      pet.root.position.set(pet.home.x + Math.sin(angle) * 0.56, 0, pet.home.z + (1 - Math.cos(angle)) * 0.42);
      if (phase < 5) pet.root.rotation.y = Math.atan2(0.56 * Math.cos(angle), 0.42 * Math.sin(angle));
      play(pet, phase < 5 ? 'walk' : 'idle');
    }
    pet.mixer.update(dt);
  }
}

function refreshButtons() {
  byId('send').disabled = !strokes.length || Boolean(model?.character.hash);
  byId('showMotions').disabled = !selectedCharacter;
  byId('finish').disabled = !strokes.length;
  byId('undo').disabled = !strokes.length;
  byId('clear').disabled = !strokes.length;
}

async function run(task) {
  if (busy) return;
  busy = true;
  [...buttons, ...catalogButtons].forEach(button => { button.disabled = true; });
  try {
    await task();
  } catch (error) {
    console.error(error);
    const output = currentView === 'picker' ? byId('pickerStatus') : currentView === 'home' ? byId('homeStatus') : status;
    output.textContent = '불러오거나 저장하지 못했어요. 다시 시도해 주세요.';
  } finally {
    busy = false;
    [...buttons, ...catalogButtons].forEach(button => { button.disabled = false; });
    refreshButtons();
  }
}

function openSettings() {
  settingsReturn = currentView;
  byId('profile').value = preferences.profile;
  byId('serverUrl').value = preferences.server;
  byId('serverKey').value = preferences.key;
  byId('characterUrl').value = preferences.characterUrl;
  setView('settings');
}

function renderCharacters() {
  const picker = byId('characters');
  const catalog = byId('characterCatalog');
  picker.replaceChildren();
  catalog.replaceChildren();
  catalogButtons = [];
  for (const character of [...bundled, ...synced]) {
    const button = document.createElement('button');
    button.textContent = character.name;
    button.onclick = () => run(async () => {
      byId('pickerStatus').textContent = character.name + ' 모델을 준비하고 있어요…';
      await openStudio(character);
      byId('pickerStatus').textContent = '';
    });
    const option = document.createElement('button');
    option.textContent = character.name;
    option.setAttribute('aria-pressed', String(selectedCharacter === character));
    option.onclick = () => {
      const now = performance.now();
      const doubleTap = selectedCharacter === character && now - lastCharacterTap < 450;
      lastCharacterTap = doubleTap ? 0 : now;
      selectedCharacter = character;
      for (const item of catalog.children) item.setAttribute('aria-pressed', String(item === option));
      refreshButtons();
      if (doubleTap) run(() => showMotions(character));
    };
    picker.append(button);
    catalog.append(option);
    catalogButtons.push(button, option);
  }
}

async function syncCharacters() {
  const folder = byId('characterUrl').value.trim()
    || (byId('serverUrl').value.trim() && byId('serverUrl').value.trim().replace(/\/$/, '') + '/characters/');
  const output = byId('syncStatus');
  if (!folder) {
    output.textContent = 'NAS 캐릭터 폴더 주소를 입력해 주세요.';
    return;
  }
  output.textContent = 'NAS 폴더의 캐릭터를 패드에 내려받는 중이에요…';
  const result = await new Promise(resolve => {
    window.finishCharacterSync = resolve;
    characterSync.sync(folder);
  });
  if (!Array.isArray(result)) {
    output.textContent = '동기화하지 못했어요. 폴더 주소와 characters.json을 확인해 주세요. 기존 캐릭터는 계속 사용할 수 있어요.';
    return;
  }
  localStorage.setItem('syncedCharacters', JSON.stringify(result));
  localStorage.setItem('characterUrl', folder);
  preferences.characterUrl = byId('characterUrl').value = folder;
  synced = result;
  selectedCharacter = null;
  lastCharacterTap = 0;
  renderCharacters();
  output.textContent = '캐릭터 ' + result.length + '종을 동기화했어요. 인터넷 없이도 볼 수 있어요.';
}

async function showMotions(character) {
  if (!character) return;
  const output = byId('syncStatus');
  output.textContent = '모션을 확인하고 있어요…';
  try {
    const asset = await loadAsset(character.id, character.hash);
    byId('motionsTitle').textContent = character.name + ' 모션';
    const names = asset.animations.map((clip, index) => clip.name || '모션 ' + (index + 1));
    byId('motionNames').replaceChildren(...(names.length ? names : ['파일에 들어 있는 모션이 없어요.']).map(name => {
      const item = document.createElement('li');
      item.textContent = name;
      return item;
    }));
    byId('motions').showModal();
    output.textContent = '';
  } catch (error) {
    console.error(error);
    output.textContent = '패드에서 모델 파일을 열지 못했어요. 동기화한 GLB 파일을 확인해 주세요.';
  }
}

function wireControls() {
  const profile = localStorage.getItem('profile');
  preferences = {
    profile: Object.hasOwn(profileNames, profile) ? profile : '아이 1',
    server: localStorage.getItem('serverUrl') ?? '',
    key: localStorage.getItem('serverKey') ?? '',
    characterUrl: localStorage.getItem('characterUrl') ?? '',
  };
  const showProfile = () => { byId('activeProfile').textContent = '지금 그리는 사람 · ' + profileNames[preferences.profile]; };
  showProfile();
  byId('settings').onclick = openSettings;
  byId('preferences').onsubmit = event => {
    event.preventDefault();
    preferences = {
      profile: byId('profile').value,
      server: byId('serverUrl').value.trim(),
      key: byId('serverKey').value.trim(),
      characterUrl: byId('characterUrl').value.trim(),
    };
    localStorage.setItem('profile', preferences.profile);
    localStorage.setItem('serverUrl', preferences.server);
    localStorage.setItem('serverKey', preferences.key);
    localStorage.setItem('characterUrl', preferences.characterUrl);
    showProfile();
    setView(settingsReturn);
  };
  byId('choose').onclick = () => {
    byId('pickerStatus').textContent = '';
    setView('picker');
  };
  byId('back').onclick = () => {
    if (currentView === 'settings') {
      setView(settingsReturn);
    } else if (currentView === 'studio') {
      if (strokes.length && !confirm('완성하지 않은 그림을 지울까요?')) return;
      release(model);
      model = null;
      strokes = [];
      pendingUpload = null;
      setView('picker');
    } else {
      residents.splice(0).forEach(release);
      byId('homeStatus').textContent = '';
      setView('home');
    }
  };
  byId('garden').onclick = () => run(() => openGarden());
  synced = JSON.parse(localStorage.getItem('syncedCharacters') ?? '[]');
  renderCharacters();
  byId('syncCharacters').hidden = !characterSync;
  byId('syncCharacters').onclick = () => run(syncCharacters);
  byId('showMotions').onclick = () => run(() => showMotions(selectedCharacter));
  for (const [name, value] of Object.entries(colors)) {
    const button = document.createElement('button');
    button.style.setProperty('--paint', value);
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-pressed', String(color === value));
    button.onclick = () => {
      color = value;
      for (const swatch of byId('palette').children) swatch.setAttribute('aria-pressed', String(swatch === button));
    };
    byId('palette').append(button);
    buttons.push(button);
  }

  byId('undo').onclick = () => { strokes.pop(); sheet.replay(strokes); refreshButtons(); };
  byId('clear').onclick = () => {
    if (confirm('색칠한 내용을 모두 지울까요?')) { strokes = []; sheet.replay(strokes); refreshButtons(); }
  };
  byId('finish').onclick = () => run(async () => {
    await drawings('readwrite', store => store.add({
      ...model.character, profile: preferences.profile, strokes,
    }));
    strokes = [];
    sheet.replay(strokes);
    try {
      await openGarden();
    } catch (error) {
      console.error(error);
      status.textContent = '그림은 저장했어요. 우리 정원을 다시 열어 주세요.';
    }
  });
  if (nas) {
    byId('send').hidden = false;
    byId('send').onclick = () => run(sendDrawing);
  }
}

async function sendDrawing() {
  const { server, key, profile } = preferences;
  if (!server || !key) {
    status.textContent = '집 서버 주소와 전송 키를 먼저 입력해 주세요.';
    openSettings();
    return;
  }
  const drawing = { id: model.speciesId, profile, strokes };
  const snapshot = JSON.stringify(drawing);
  if (pendingUpload?.snapshot !== snapshot) {
    pendingUpload = { snapshot, uploadId: crypto.randomUUID() };
  }
  const payload = JSON.stringify({ ...drawing, uploadId: pendingUpload.uploadId });
  status.textContent = '집 정원으로 보내고 있어요.';
  const result = await new Promise(resolve => {
    window.finishGardenUpload = resolve;
    nas.send(server, key, payload);
  });
  if (result !== 'ok') {
    status.textContent = {
      address: '서버 주소에 집 안 IP와 포트를 입력해 주세요.',
      denied: '전송 키가 달라요. 설정을 확인해 주세요.',
      size: '그림 데이터가 너무 커요. 일부 색칠을 되돌린 뒤 다시 보내 주세요.',
    }[result] ?? '전송하지 못했어요. 와이파이와 집 서버를 확인한 뒤 다시 눌러 주세요.';
    return;
  }
  pendingUpload = null;
  strokes = [];
  sheet.replay(strokes);
  status.textContent = '전송 완료! 집 서버의 웹 정원을 확인해 보세요.';
}

function wireCanvas(canvas) {
  canvas.addEventListener('pointerdown', event => {
    if (busy || !event.isPrimary) return;
    if (currentView === 'garden') {
      press = [event.clientX, event.clientY];
    } else if (currentView === 'studio' && model) {
      canvas.setPointerCapture(event.pointerId);
      activeStroke = { color, size: Number(byId('brush').value), points: [] };
      paint(event);
    }
  });
  canvas.addEventListener('pointermove', event => { if (event.isPrimary && activeStroke && !busy) paint(event); });
  function finishStroke() {
    if (activeStroke?.points.length) strokes.push(activeStroke);
    activeStroke = null;
    if (!busy) refreshButtons();
  }
  canvas.addEventListener('pointercancel', () => { finishStroke(); press = null; });
  canvas.addEventListener('lostpointercapture', finishStroke);
  canvas.addEventListener('pointerup', event => {
    if (!event.isPrimary) return;
    finishStroke();
    if (!busy && currentView === 'garden' && press && Math.hypot(event.clientX - press[0], event.clientY - press[1]) < 12) {
      const hit = ray(event).intersectObjects(residents.map(pet => pet.root), true)[0];
      let root = hit?.object;
      while (root && root.parent !== scene) root = root.parent;
      const pet = residents.find(item => item.root === root);
      const happy = pet?.clips.find(clip => clip.name === 'happy');
      if (happy) {
        pet.reactUntil = elapsed + happy.duration;
        play(pet, 'happy', true);
      }
    }
    press = null;
  });
}

async function refreshSharedGarden() {
  try {
    const response = await fetch('/api/drawings', { cache: 'no-store' });
    if (!response.ok) throw new Error('Garden status ' + response.status);
    const entries = await response.json();
    const revision = entries.map(entry => entry.uploadId).join(',');
    if (revision !== shownUploads) {
      await openGarden(entries);
      shownUploads = revision;
    }
    status.textContent = entries.length ? '포켓몬이 정원에서 놀고 있어요.' : '태블릿에서 포켓몬을 전송해 보세요.';
  } catch (error) {
    console.error(error);
    status.textContent = '집 정원에 연결하는 중이에요.';
  } finally {
    setTimeout(refreshSharedGarden, 2000);
  }
}

let elapsed = 0;
async function start() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  stage.append(renderer.domElement);
  stage.append(sheet.element);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  scene.background = new THREE.Color('#dcefd4');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8c5a3', 2));
  const sun = new THREE.DirectionalLight('#fff0da', 2.2);
  sun.position.set(4, 7, 6);
  scene.add(sun);
  lawn = new THREE.Mesh(new THREE.CircleGeometry(5.7, 48), new THREE.MeshStandardMaterial({ color: '#84bd65' }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.visible = false;
  scene.add(lawn);
  new ResizeObserver(() => {
    const { clientWidth: width, clientHeight: height } = stage;
    if (!width || !height) return;
    stage.style.setProperty('--sheet-side', Math.min(width, height) + 'px');
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }).observe(stage);

  wireCanvas(renderer.domElement);
  wireCanvas(sheet.element);
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    elapsed += dt;
    if (currentView === 'garden') updateGarden(dt, elapsed);
    if (currentView === 'garden') renderer.render(scene, camera);
  });
  if (sharedGarden) {
    setView('garden');
    positionCamera(true);
    await refreshSharedGarden();
  } else {
    [db] = await Promise.all([
      database(),
      loadAsset('charmander').catch(error => console.warn(error)),
      new Promise(resolve => setTimeout(resolve, 700)),
    ]);
    wireControls();
    refreshButtons();
    setView('home');
  }
}

start().catch(error => {
  console.error(error);
  const output = currentView === 'splash' ? byId('splashStatus') : status;
  output.textContent = '화면을 시작하지 못했어요. 앱을 닫고 다시 열어 주세요.';
});
