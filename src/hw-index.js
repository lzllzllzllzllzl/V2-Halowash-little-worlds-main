/* HaloWash overview page bootstrap: four scene dioramas (GLB, one per care
 * scenario) arranged 2×2 on a dark navy stage with floating name signs.
 * Bundled to an IIFE exposing window.HWIndex.start(config). The Draco
 * decoder ships inside the bundle as data URIs; the GLB dioramas load from
 * models/ over HTTP (pages are served from GitHub Pages). */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import dracoWasm from "./draco-data/draco_decoder.wasm.js";
import dracoWrapper from "./draco-data/draco_wasm_wrapper.js";
import { createBackdrop } from "./hw-backdrop.js";

const START_THETA = 45;      /* camera azimuth the fronts are composed against */
const AUTO_SPIN = 0.45;
const CELLS = [[-1, 1], [1, 1], [-1, -1], [1, -1]];

/* GLB diorama per world key; a world may override via its config `model` */
const MODEL_URLS = {
  home: "models/home-main.glb",     /* 居家护理 */
  ward: "models/ward-main.glb",     /* 病房护理 */
  garden: "models/garden-main.glb", /* 养老院护理 */
  salon: "models/salon-main.glb"    /* 头皮沙龙 */
};

/* ------------------------------------------------------- floating sign */
function makeSign(name) {
  const cnv = document.createElement("canvas");
  cnv.width = 512; cnv.height = 192;
  const cx = cnv.getContext("2d");
  cx.beginPath();
  if (cx.roundRect) cx.roundRect(12, 12, 488, 168, 52);
  else cx.rect(12, 12, 488, 168);
  cx.fillStyle = "#173145"; cx.fill();
  cx.lineWidth = 14; cx.strokeStyle = "#2ea8a0"; cx.stroke();
  cx.fillStyle = "#d9f3ef";
  cx.font = "700 96px 'PingFang SC','Microsoft YaHei',system-ui,sans-serif";
  cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillText(name, 286, 100);
  cx.beginPath(); cx.arc(80, 96, 20, 0, Math.PI * 2);
  cx.fillStyle = "#54c7b6"; cx.fill();
  const tex = new THREE.CanvasTexture(cnv);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, 1.12),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  board.renderOrder = 6;
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x54c7b6, emissive: 0x2ea8a0, emissiveIntensity: .45, roughness: .4 })
  );
  gem.scale.setScalar(.18); gem.position.y = .95;
  group.add(board, gem);
  return { group, board, gem };
}

/* --------------------------------------------------------------- start */
async function start(config) {
  const canvas = document.getElementById("world");
  const fallback = document.getElementById("fallback");
  const worlds = config.worlds;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    fallback.hidden = false;
    document.getElementById("loading")?.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const backdrop = createBackdrop(scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .07;
  controls.enablePan = false;
  controls.rotateSpeed = .55;
  controls.zoomSpeed = .8;
  controls.minPolarAngle = Math.PI * .14;
  controls.maxPolarAngle = Math.PI * .49;
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_SPIN;

  scene.add(new THREE.HemisphereLight(0xe8ebef, 0x6f747a, .65));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xdde3ea, 1.0);
  scene.add(rim);

  /* load the four GLB dioramas (Draco-compressed) */
  const draco = new DRACOLoader();
  const decoderFiles = {
    "draco_decoder.wasm": dracoWasm,
    "draco_wasm_wrapper.js": dracoWrapper
  };
  draco.setDecoderPath("");
  draco._loadLibrary = function (url, responseType) {
    const uri = decoderFiles[url];
    if (!uri) return Promise.reject(new Error("missing decoder file " + url));
    return fetch(uri).then(r => responseType === "arraybuffer" ? r.arrayBuffer() : r.text());
  };
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let gltfs;
  try {
    gltfs = await Promise.all(
      worlds.map(w => loader.loadAsync(w.model || MODEL_URLS[w.key]))
    );
  } catch (e) {
    console.error(e);
    fallback.hidden = false;
    document.getElementById("loading")?.remove();
    return;
  }

  /* normalize each diorama onto its grid cell + signs */
  const items = worlds.map((w, i) => {
    const model = gltfs[i].scene;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const box3 = new THREE.Box3().setFromObject(model);
    const size = box3.getSize(new THREE.Vector3());
    const center = box3.getCenter(new THREE.Vector3());
    const foot = w.footprint || 9.8;
    const s = foot / Math.max(size.x, size.z);
    const wrap = new THREE.Group();
    const unit = new THREE.Group();
    model.scale.setScalar(s);
    model.position.set(-center.x * s, -box3.min.y * s + .02, -center.z * s);  /* centered, base on pad top */
    unit.add(model);
    /* mid-gray concrete pad so each diorama sits on the street ground */
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(foot + .5, .18, foot + .5),
      new THREE.MeshStandardMaterial({ color: 0xa9aeb3, roughness: .9 })
    );
    pad.position.y = -.07;
    pad.receiveShadow = true;
    unit.add(pad);
    wrap.add(unit);
    const sign = makeSign(w.name);
    const baseSignY = size.y * s + 1.15;
    sign.group.position.y = baseSignY;
    wrap.add(sign.group);
    scene.add(wrap);
    return { wrap, unit, model, sign, baseSignY, unitScale: 1, spec: w, index: i, phase: i * 1.3 };
  });

  /* rotate each diorama to face the start azimuth (plus a per-scene nudge
   * in degrees for variety) */
  for (const it of items)
    it.model.rotation.y = THREE.MathUtils.degToRad(START_THETA - 180 + (it.spec.yaw || 0));

  /* layout: landscape 2×2, portrait tightened */
  let portrait = null;
  const homePos = new THREE.Vector3();
  let userMoved = false;
  function layout() {
    const p = camera.aspect < 0.9;
    const changed = p !== portrait;
    portrait = p;
    const gap = p ? 13 : 15.6;
    const us = p ? .8 : 1;
    for (const it of items) {
      const [cx, cz] = CELLS[it.index];
      it.wrap.position.set(cx * gap / 2, 0, cz * gap / 2);
      if (it.unitScale !== us) {
        it.unitScale = us;
        it.unit.scale.setScalar(us);
        it.sign.group.position.y = it.baseSignY * us;
      }
    }
    scene.updateMatrixWorld(true);
    const gridBox = new THREE.Box3();
    for (const it of items)
      gridBox.union(new THREE.Box3().setFromObject(it.wrap));  /* world coords incl. sign */
    const center = gridBox.getCenter(new THREE.Vector3());
    const sph = new THREE.Sphere();
    gridBox.getBoundingSphere(sph);
    if (!userMoved || changed) {
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = sph.radius / Math.sin(Math.min(vfov, hfov) / 2) * (p ? 0.95 : 0.82);
      const spherical = new THREE.Spherical(dist, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(START_THETA));
      camera.position.copy(center).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.target.copy(center);
      controls.minDistance = dist * .3;
      controls.maxDistance = dist * 1.9;
      controls.update();
      homePos.copy(camera.position);
    }
    const gs = sph.radius;
    key.shadow.camera.left = -gs; key.shadow.camera.right = gs;
    key.shadow.camera.top = gs; key.shadow.camera.bottom = -gs;
    key.shadow.camera.near = .1; key.shadow.camera.far = gs * 8;
    key.shadow.bias = -.0004;
    key.position.copy(center).add(new THREE.Vector3(gs * .9, gs * 1.4, gs * .6));
    key.target.position.copy(center);
    key.shadow.camera.updateProjectionMatrix();
    rim.position.copy(center).add(new THREE.Vector3(-gs, gs * 1.2, -gs));
    return changed;
  }

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layout();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  /* HUD */
  const pauseBtn = document.getElementById("pause");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let paused = reduced;
  function applyPaused() {
    controls.autoRotate = !paused && !userMoved;
    pauseBtn.textContent = paused ? "▶ 播放" : "⏸ 暂停";
    pauseBtn.setAttribute("aria-pressed", String(paused));
  }
  controls.addEventListener("start", () => { userMoved = true; controls.autoRotate = false; canvas.dataset.view = "interactive"; });
  pauseBtn.addEventListener("click", () => { paused = !paused; applyPaused(); });
  applyPaused();

  /* hover chip + click-to-enter */
  const chip = document.getElementById("enter-chip");
  const raycaster = new THREE.Raycaster();
  let hovered = null;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      (e.clientX - r.left) / r.width * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    ), camera);
    const hits = raycaster.intersectObjects(items.map(i => i.wrap), true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o.parent && !items.some(i => i.wrap === o)) o = o.parent;
    return items.find(i => i.wrap === o) || null;
  }
  function showChip(it) {
    hovered = it;
    chip.textContent = it.spec.name + " · 进入场景 →";
    chip.setAttribute("aria-label", "打开" + it.spec.name + "页面");
    chip.hidden = false;
    canvas.style.cursor = "pointer";
  }
  function hideChip() {
    hovered = null;
    chip.hidden = true;
    canvas.style.cursor = "grab";
  }
  chip.addEventListener("click", () => { if (hovered) location.href = hovered.spec.href; });
  canvas.addEventListener("click", e => {
    const it = pick(e);
    if (it) location.href = it.spec.href;
  });
  canvas.addEventListener("pointermove", e => {
    const it = pick(e);
    if (it) showChip(it); else if (hovered) hideChip();
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Enter" && hovered) { e.preventDefault(); location.href = hovered.spec.href; }
    if (e.key === " ") { e.preventDefault(); paused = !paused; applyPaused(); }
    if (e.key === "Escape") {
      controls.target.set(0, controls.target.y, 0);
      camera.position.copy(homePos);
      controls.update();
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const off = camera.position.clone().sub(controls.target);
      const sp = new THREE.Spherical().setFromVector3(off);
      if (e.key === "ArrowLeft") sp.theta -= .075;
      if (e.key === "ArrowRight") sp.theta += .075;
      if (e.key === "ArrowUp") sp.phi -= .065;
      if (e.key === "ArrowDown") sp.phi += .065;
      sp.phi = THREE.MathUtils.clamp(sp.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sp));
      controls.update();
    }
  });

  /* animation loop: gentle sign bob + billboard (dioramas stay grounded) */
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    if (!paused) {
      for (const it of items) {
        it.sign.board.position.y = Math.sin(t * 1.25 + it.phase) * .07;
        it.sign.gem.position.y = .78 + Math.sin(t * 1.25 + it.phase) * .08;
        it.sign.gem.rotation.y = t * .8;
      }
    }
    for (const it of items) it.sign.board.quaternion.copy(camera.quaternion);
    const cd = camera.position.distanceTo(controls.target);
    backdrop.setDistance(cd, camera.position);
    backdrop.update(t);
    controls.update();
    renderer.render(scene, camera);
  });

  canvas.classList.add("ready");
  document.getElementById("loading")?.remove();

  canvas.addEventListener("webglcontextlost", e => {
    e.preventDefault();
    fallback.hidden = false;
  });
  renderer.domElement.addEventListener("webglcontextrestored", () => location.reload());
}

window.HWIndex = { start };
