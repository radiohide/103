import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMeasurementTargets, snapMeasurementPoint, measurementMetrics } from './measurement.js';
import { buildWallSnapTargets, snapFurniturePosition } from './furniture-snap.js';

const M = 0.001;
const RAD = Math.PI / 180;
const INK = '#47504b';
const ACCENT = '#147d68';
const PALETTE = { white: '#f8f6f0', wood: '#ccac80', dark: '#606b63', textile: '#c5d0bf', metal: '#a6b3b0', porcelain: '#f6f8f3' };
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

/** A compact, dependency-free Three.js floor-plan viewport. Coordinates in the
 * document are millimetres; drawing Y maps to world Z. Geometry is a disposable
 * projection of the document, never the authoritative editing state. */
export class PlanScene {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.plan = null;
    this.selected = null;
    this.view = '2d';
    this.tool = 'move';
    this.options = { grid: true, labels: true, dimensions: true, reference: false, snap: true, fullHeight: false };
    this.items = new Map();
    this.labels = [];
    this.drag = null;
    this.measurement = { start: null, end: null, complete: false, snapLabel: '' };
    this.measurePointers = new Set();
    this.measureTargets = { points: [], segments: [] };
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f1f2ed');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c7b9, 2.25));
    this.sun = new THREE.DirectionalLight(0xfff4df, 2.4);
    this.sun.position.set(-4, 16, -5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 0.1, far: 50 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    this.renderer.domElement.setAttribute('aria-label', '户型编辑画布：点击选择，拖动移动，滚轮缩放，右键拖动画布');
    container.appendChild(this.renderer.domElement);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this.overlay = document.createElement('div');
    this.overlay.className = 'plan-scene-overlay';
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:inherit';
    container.appendChild(this.overlay);
    this.style = document.createElement('style');
    this.style.textContent = `
      .plan-scene-label{position:absolute;white-space:nowrap;transform:translate(-50%,-50%);color:#647167;font-family:inherit;font-size:11px;font-weight:500;line-height:1.5;letter-spacing:.04em;user-select:none}
      .plan-scene-room{font-size:12px;font-weight:550;letter-spacing:.1em;color:#758172;text-shadow:0 1px 2px #fff}
      .plan-scene-measure{font-size:10px;font-weight:550;color:#6a746c;background:rgba(241,242,237,.9);padding:1px 5px;border-radius:3px;font-variant-numeric:tabular-nums;letter-spacing:.02em}
      .plan-scene-selected{font-size:11px;color:#fff;background:#147d68;padding:4px 9px;border-radius:5px;box-shadow:0 2px 8px #143b2620;max-width:230px;overflow:hidden;text-overflow:ellipsis;letter-spacing:0}
      .plan-scene-ruler{font-size:11px;font-weight:650;color:#fff;background:#147d68;padding:4px 9px;border-radius:5px;box-shadow:0 2px 8px #143b2620;font-variant-numeric:tabular-nums;letter-spacing:0}
      .plan-scene-ruler-point{font-size:10px;font-weight:650;color:#147d68;background:#fffefa;padding:1px 4px;border-radius:3px;letter-spacing:0}
      .plan-scene-rotate{position:absolute;width:30px;height:30px;border:1.5px solid #147d68;border-radius:50%;background:#fff;color:#147d68;font-size:19px;display:grid;place-items:center;transform:translate(-50%,-50%);pointer-events:auto;cursor:grab;box-shadow:0 2px 8px #163e2420;padding:0;touch-action:none}
      .plan-scene-rotate:active{cursor:grabbing}.plan-scene-rotate:focus-visible{outline:3px solid #90c9b8;outline-offset:2px}
    `;
    container.appendChild(this.style);
    this.topCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 200);
    this.topCamera.position.set(4.9, 40, 5.15);
    this.topCamera.up.set(0, 0, -1);
    this.topCamera.lookAt(4.9, 0, 5.15);
    this.perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.perspectiveCamera.position.set(17, 17, 20);
    this.perspectiveCamera.lookAt(4.9, 0, 5.15);
    this.camera = this.topCamera;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(4.9, 0, 5.15);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.14;
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = 0.25;
    this.controls.maxZoom = 12;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 45;
    // The top camera's screen-up is -Z; orbit polar limits would otherwise
    // introduce an unwanted tilt even with rotation disabled.
    this.controls.maxPolarAngle = Math.PI;
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = THREE.TOUCH.PAN;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.selectionGroup = new THREE.Group();
    this.scene.add(this.selectionGroup);
    this.measurementGroup = new THREE.Group();
    this.scene.add(this.measurementGroup);
    this.snapGroup = new THREE.Group();
    this.scene.add(this.snapGroup);
    this.grid = new THREE.GridHelper(60, 120, '#ccd4cb', '#dfe4dc');
    this.grid.position.set(5, -0.09, 5);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.scene.add(this.grid);
    this._down = e => this.pointerDown(e);
    this._move = e => this.pointerMove(e);
    this._up = e => this.pointerUp(e);
    this._blur = () => this.finishDrag(false);
    this._context = e => e.preventDefault();
    this.renderer.domElement.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
    window.addEventListener('blur', this._blur);
    this.renderer.domElement.addEventListener('contextmenu', this._context);
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (this.plan) this.fit();
    });
    this.resizeObserver.observe(container);
    this.resize();
    this.frame = null;
    this.animate = () => {
      if (this.disposed) return;
      this.controls.update();
      const measureScale = this.millimetresPerPixel();
      if (this.tool === 'measure' && this.measureScale !== measureScale) this.drawMeasurement();
      this.renderer.render(this.scene, this.camera);
      this.placeLabels();
      this.frame = requestAnimationFrame(this.animate);
    };
    this.animate();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.perspectiveCamera.aspect = w / h;
    this.perspectiveCamera.updateProjectionMatrix();
    const span = this.topSpan || 13.5;
    this.topCamera.left = -span * w / h / 2;
    this.topCamera.right = span * w / h / 2;
    this.topCamera.top = span / 2;
    this.topCamera.bottom = -span / 2;
    this.topCamera.updateProjectionMatrix();
  }

  material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra });
  }

  box(group, width, height, depth, x, y, z, color, edges = false, extra = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(width, .005), Math.max(height, .005), Math.max(depth, .005)), this.material(color, extra));
    mesh.position.set(x, y, z);
    mesh.castShadow = this.view === '3d'; mesh.receiveShadow = true;
    group.add(mesh);
    if (edges) this.edges(mesh, INK, .35);
    return mesh;
  }

  roundedBox(group, width, height, depth, x, y, z, color, radius = .055) {
    // Extruded rounded rectangles keep the furniture silhouettes readable even
    // in a flat orthographic view; these are actual 3D surfaces.
    const w = Math.max(.02, width), d = Math.max(.02, depth), r = Math.min(radius, w / 3, d / 3);
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -d / 2);
    s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(height, .005), bevelEnabled: false, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -height / 2, 0);
    const mesh = new THREE.Mesh(geo, this.material(color));
    mesh.position.set(x, y, z); mesh.castShadow = this.view === '3d'; mesh.receiveShadow = true;
    group.add(mesh); this.edges(mesh, INK, .2);
    return mesh;
  }

  cylinder(group, radius, height, x, y, z, color, sx = 1, sz = 1) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(height, .005), 32), this.material(color));
    mesh.position.set(x, y, z); mesh.scale.set(sx, 1, sz);
    mesh.castShadow = this.view === '3d'; mesh.receiveShadow = true;
    group.add(mesh); this.edges(mesh, INK, .2);
    return mesh;
  }

  edges(mesh, color = INK, opacity = .45) {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    mesh.add(line);
    return line;
  }

  line(group, coords, color = INK, opacity = .65, dashed = false) {
    const geo = new THREE.BufferGeometry().setFromPoints(coords.map(p => new THREE.Vector3(...p)));
    const mat = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: .08, gapSize: .05 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    group.add(line); return line;
  }

  disposeGroup(group) {
    group.traverse(item => {
      item.geometry?.dispose();
      if (item.material) (Array.isArray(item.material) ? item.material : [item.material]).forEach(m => m.dispose());
    });
    group.clear();
  }

  setPlan(plan) {
    this.plan = plan;
    this.measureTargets = buildMeasurementTargets(plan);
    this.disposeGroup(this.world);
    this.items.clear();
    this.labels.filter(l => l.kind !== 'selection').forEach(l => l.el.remove());
    this.labels = this.labels.filter(l => l.kind === 'selection');
    if (!plan) return;
    this.buildFloor();
    const objects = plan.objects.filter(o => o.visible !== false);
    for (const o of objects) {
      const group = new THREE.Group();
      group.position.set(o.x * M, 0, o.y * M);
      group.rotation.y = -finite(o.rotation) * RAD;
      // Rotation preserves the wall's start-to-end direction. Reflect local
      // depth separately so door arcs, handles and asymmetric furniture flip.
      group.scale.z = o.mirrorY ? -1 : 1;
      group.userData.id = o.id;
      if (o.type === 'wall') this.buildWall(group, o, objects);
      else if (o.type === 'door') this.buildDoor(group, o);
      else if (o.type === 'window') this.buildWindow(group, o);
      else this.buildFurniture(group, o);
      group.traverse(node => { if (node.isMesh) node.userData.id = o.id; });
      this.world.add(group); this.items.set(o.id, group);
    }
    this.drawDimensions();
    this.drawSelection();
    this.drawMeasurement();
    this.drawFurnitureSnap(this.drag?.snapResult);
  }

  buildFloor() {
    const points = this.exteriorPolygon();
    if (points) {
      const shape = new THREE.Shape();
      points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); geo.translate(0, -.14, 0);
      const floor = new THREE.Mesh(geo, this.material('#e9e6dc'));
      floor.receiveShadow = true; this.world.add(floor);
    }
    for (const room of this.plan.rooms || []) {
      const w = finite(room.width, 1000) * M, d = finite(room.depth, 1000) * M;
      const color = room.color || '#ede9dd';
      this.box(this.world, Math.max(.01, w - .04), .012, Math.max(.01, d - .04), room.x * M, -.015, room.y * M, color);
      if (this.options.labels) {
        const labelY = room.y * M;
        this.addLabel(room.name, new THREE.Vector3(room.x * M, this.view === '2d' ? 2.95 : .025, labelY), 'room');
      }
    }
    if (this.options.reference && this.view === '2d') this.buildReference();
  }

  exteriorPolygon() {
    // Trace the connected source perimeter from its actual saved endpoints.
    // If walls are deleted or disconnected, don't leave an invented old slab.
    const order = ['wall-north', 'wall-east-upper', 'wall-east-step', 'wall-east-lower', 'wall-south', 'wall-west'];
    const walls = order.map(id => this.plan.objects.find(o => o.id === id && o.type === 'wall'));
    if (walls.some(w => !w)) return null;
    const ends = w => {
      const a = finite(w.rotation) * RAD, dx = Math.cos(a) * w.width / 2, dz = Math.sin(a) * w.width / 2;
      return [[(w.x - dx) * M, (w.y - dz) * M], [(w.x + dx) * M, (w.y + dz) * M]];
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const first = ends(walls[0]);
    // Orient the first segment toward the next wall, even after a 180° edit.
    const second = ends(walls[1]);
    const firstBConnects = Math.min(...second.map(p => dist(first[1], p))) <= .02;
    const path = firstBConnects ? [...first] : [first[1], first[0]];
    for (const wall of walls.slice(1)) {
      const pair = ends(wall), last = path[path.length - 1];
      if (dist(last, pair[0]) <= .02) path.push(pair[1]);
      else if (dist(last, pair[1]) <= .02) path.push(pair[0]);
      else return null;
    }
    if (dist(path[0], path[path.length - 1]) > .02) return null;
    path.pop();
    return path;
  }

  buildReference() {
    if (!this.referenceTexture) {
      if (this.referenceLoading) return;
      this.referenceLoading = true;
      new THREE.TextureLoader().load(new URL('../assets/reference.png', import.meta.url).href, texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.referenceTexture = texture;
        this.referenceLoading = false;
        if (!this.disposed && this.options.reference) this.setPlan(this.plan);
      }, undefined, () => { this.referenceLoading = false; });
      return;
    }
    const reference = new THREE.Mesh(new THREE.PlaneGeometry(14.276, 13.643), new THREE.MeshBasicMaterial({ map: this.referenceTexture, transparent: true, opacity: .38, depthWrite: false }));
    reference.rotation.x = -Math.PI / 2;
    const transform = this.plan.meta?.referenceTransform;
    const scaleX = transform?.scaleX === -1 ? -1 : 1;
    reference.scale.x = scaleX;
    reference.position.set((4762 * scaleX + finite(transform?.offsetX)) * M, .018, 5.133);
    reference.renderOrder = 1;
    this.world.add(reference);
  }

  buildWall(group, o, objects) {
    const w = o.width * M, d = o.depth * M;
    const h = this.view === '2d' ? .1 : (this.options.fullHeight ? o.height * M : Math.min(o.height * M, 1.35));
    const openings = objects.filter(x => (x.type === 'door' || x.type === 'window') && x.wallId === o.id).map(opening => {
      const cx = finite(opening.offset, o.width / 2) * M - w / 2;
      return { start: Math.max(-w / 2, cx - opening.width * M / 2), end: Math.min(w / 2, cx + opening.width * M / 2), opening };
    }).sort((a, b) => a.start - b.start);
    let cursor = -w / 2;
    const color = this.view === '2d' ? '#56665b' : '#dedfd5';
    for (const slot of openings) {
      if (slot.start > cursor + .001) this.box(group, slot.start - cursor, h, d, (slot.start + cursor) / 2, h / 2, 0, color, true);
      if (slot.opening.type === 'window' && this.view === '3d') {
        const sill = Math.min(finite(slot.opening.sill, 900) * M, h);
        this.box(group, slot.end - slot.start, sill, d, (slot.end + slot.start) / 2, sill / 2, 0, color, true);
      }
      if (this.view === '3d') {
        const openingTop = ((slot.opening.type === 'window' ? finite(slot.opening.sill, 900) : 0) + slot.opening.height) * M;
        if (openingTop < h) this.box(group, slot.end - slot.start, h - openingTop, d, (slot.end + slot.start) / 2, (h + openingTop) / 2, 0, color, true);
      }
      cursor = Math.max(cursor, slot.end);
    }
    if (cursor < w / 2 - .001) this.box(group, w / 2 - cursor, h, d, (w / 2 + cursor) / 2, h / 2, 0, color, true);
  }

  buildDoor(group, o) {
    const w = o.width * M, d = Math.max(.045, o.depth * M);
    const doorHeight = this.options.fullHeight ? o.height * M : Math.min(o.height * M, 1.35);
    const sign = o.swing === -1 ? -1 : 1;
    const left = o.hinge !== 'right', hingeX = left ? -w / 2 : w / 2;
    const side = left ? 1 : -1;
    this.box(group, w, .018, d, 0, .025, 0, '#d5c5a9');
    if (o.kind === 'opening') return;
    if (o.kind === 'sliding') {
      const hh = this.view === '3d' ? doorHeight : .045;
      for (const [x, z] of [[-w * .24, -.025], [w * .24, .025]]) {
        this.box(group, w * .52, hh, .025, x, hh / 2 + .04, z, '#bccfc2', true, { transparent: true, opacity: .65 });
      }
      return;
    }
    this.box(group, .045, this.view === '3d' ? doorHeight : .065, d, -w / 2, this.view === '3d' ? doorHeight / 2 : .04, 0, '#af9875');
    this.box(group, .045, this.view === '3d' ? doorHeight : .065, d, w / 2, this.view === '3d' ? doorHeight / 2 : .04, 0, '#af9875');
    const arc = [];
    for (let i = 0; i <= 32; i++) {
      const a = i / 32 * Math.PI / 2;
      arc.push([hingeX + side * w * Math.cos(a), .045, sign * w * Math.sin(a)]);
    }
    this.line(group, arc, '#8a978b', .8, true);
    const leaf = new THREE.Group();
    leaf.position.set(hingeX, 0, 0);
    leaf.rotation.y = -sign * side * Math.PI / 2;
    const lh = this.view === '3d' ? doorHeight : .055;
    this.box(leaf, w, lh, .035, side * w / 2, lh / 2 + .04, 0, '#c4ab85', true);
    if (this.view === '3d') this.cylinder(leaf, .025, .05, side * w * .86, Math.min(.95, doorHeight * .55), -.04, '#60776e');
    group.add(leaf);
  }

  buildWindow(group, o) {
    const w = o.width * M, d = Math.max(.1, o.depth * M);
    const sill = finite(o.sill, 900) * M;
    // Cutaway truncates the view at its section plane, while complete height
    // mode exposes the actual saved sill and opening-height parameters.
    if (this.view === '3d' && !this.options.fullHeight && sill >= 1.35) return;
    const visibleHeight = this.options.fullHeight ? o.height * M : Math.min(o.height * M, Math.max(.01, 1.35 - sill));
    const y = this.view === '3d' ? sill + visibleHeight / 2 : .065;
    this.box(group, w, .035, d, 0, this.view === '3d' ? sill : .03, 0, '#c5d9d2', true);
    this.box(group, w, this.view === '3d' ? visibleHeight : .03, .025, 0, y, 0, '#a6cec8', true, { transparent: true, opacity: .65, metalness: .1 });
    for (const x of [-w / 2, 0, w / 2]) this.box(group, .025, this.view === '3d' ? visibleHeight + .03 : .05, d, x, y, 0, '#769c90');
    if (this.view === '3d') this.box(group, w, .025, d, 0, sill + visibleHeight, 0, '#769c90');
    else for (const z of [-d / 3, d / 3]) this.line(group, [[-w / 2, .1, z], [w / 2, .1, z]], '#679b8e');
  }

  buildFurniture(g, o) {
    const w = Math.max(.02, o.width * M), d = Math.max(.02, o.depth * M), h = Math.max(.02, o.height * M);
    const k = o.kind || '', color = o.color;
    const top = this.view === '2d';
    const height = value => top ? Math.min(value, .32) : value;
    const legs = (legHeight, inset = .1) => {
      if (top) return;
      for (const x of [-1, 1]) for (const z of [-1, 1]) this.box(g, .045, legHeight, .045, x * (w / 2 - Math.min(inset, w / 4)), legHeight / 2, z * (d / 2 - Math.min(inset, d / 4)), '#8a7154');
    };
    if (k === 'bed') {
      const baseH = height(h * .65), mattressH = top ? .035 : .16;
      this.roundedBox(g, w, baseH, d, 0, baseH / 2, 0, '#b49f81', .035);
      this.roundedBox(g, w * .94, mattressH, d * .92, 0, baseH + mattressH / 2, d * .02, color || '#f3f0e5', .08);
      const blanketY = baseH + mattressH + .018;
      this.roundedBox(g, w * .94, .035, d * .60, 0, blanketY, d * .18, '#c5cfbe', .045);
      this.box(g, w * .94, .008, .05, 0, blanketY + .022, -d * .09, '#aab99f');
      for (const x of [-w * .245, w * .245]) this.roundedBox(g, w * .38, top ? .04 : .13, d * .19, x, baseH + mattressH + .05, -d * .30, '#faf9f3', .075);
      const bh = height(h * 1.3);
      this.box(g, w * 1.01, bh, .08, 0, bh / 2, -d / 2 + .02, '#a58a6b', true);
    } else if (k === 'sofa' || k === 'armchair' || k === 'chair') {
      const chair = k === 'chair', armchair = k === 'armchair';
      const seatH = height(Math.min(h * .55, .45));
      const backH = height(h);
      const fabric = color || (chair ? '#c0cbbb' : '#c7cbbd');
      legs(seatH * .75, .1);
      this.roundedBox(g, w, chair ? .08 : seatH, d * .88, 0, chair ? seatH : seatH / 2, d * .04, fabric, .07);
      this.roundedBox(g, w, backH, d * .17, 0, backH / 2, -d * .41, '#9fab99', .045);
      if (!chair) {
        for (const x of [-w * .45, w * .45]) this.roundedBox(g, w * .1, backH * .8, d * .86, x, backH * .4, d * .025, '#aebaa7', .04);
        const n = armchair ? 1 : Math.max(2, Math.round(w / .72));
        const cw = w * .79 / n;
        for (let i = 0; i < n; i++) this.roundedBox(g, cw * .96, .055, d * .61, -w * .395 + cw * (i + .5), seatH + .035, d * .11, fabric, .04);
      }
    } else if (k === 'dining-table' || k === 'table' || k === 'coffee-table' || k === 'side-table') {
      const hh = height(h);
      legs(hh - .08, .13);
      this.roundedBox(g, w, .075, d, 0, hh - .035, 0, color || '#d3b68d', ['coffee-table', 'side-table'].includes(k) ? Math.min(w, d) / 2 : .055);
      if (k === 'coffee-table') {
        this.cylinder(g, Math.min(w, d) * .12, .025, w * .12, hh + .015, d * .12, '#ddd9c9');
        this.cylinder(g, Math.min(w, d) * .06, .04, -w * .13, hh + .025, -d * .14, '#828e79');
      }
    } else if (k === 'sideboard') {
      // A fixed three-bay cabinet scales as one unit, including at the editor's
      // minimum dimensions. Hardware stays inside its declared footprint.
      const cabinet = new THREE.Group();
      cabinet.scale.set(o.width / 1600, top ? 1 : o.height / 850, o.depth / 400);
      g.add(cabinet);
      const wood = color || '#c7ae87', section = 1.6 / 3;
      if (top) {
        this.box(cabinet, 1.6, .05, .4, 0, .025, 0, wood, true);
        // Keep the worktop continuous; only the front reveal marks door bays.
        this.box(cabinet, 1.6, .012, .382, 0, .056, -.009, '#f3f0e5', true);
        for (let i = 0; i < 3; i++) this.box(cabinet, section - .004, .012, .018, - .8 + section * (i + .5), .056, .191, wood, true);
      } else {
        this.box(cabinet, 1.53, .07, .33, 0, .035, 0, '#64685f', true);
        this.box(cabinet, 1.588, .756, .368, 0, .448, -.016, wood, true);
        this.box(cabinet, 1.6, .024, .382, 0, .838, -.009, '#f3f0e5', true);
        for (let i = 0; i < 3; i++) {
          const x = -.8 + section * (i + .5);
          this.box(cabinet, section - .004, .166, .018, x, .741, .177, wood, true);
          this.box(cabinet, section - .004, .582, .018, x, .361, .177, wood, true);
          for (const y of [.7325, .576]) this.box(cabinet, .09, .012, .014, x, y, .193, '#64685f');
        }
      }
    } else if (k === 'rug') {
      this.roundedBox(g, w, .008, d, 0, .005, 0, color || '#e3dfd0', .04);
      for (const x of [-w / 2 + .065, w / 2 - .065]) this.line(g, [[x, .011, -d / 2 + .06], [x, .011, d / 2 - .06]], '#c2bda9', .5);
    } else if (k === 'toilet') {
      const hh = height(h);
      this.roundedBox(g, w * .86, hh, d * .28, 0, hh / 2, -d * .36, PALETTE.porcelain, .045);
      this.cylinder(g, w * .45, hh * .65, 0, hh * .325, d * .13, '#f7f8f3', 1, d * .55 / w);
      this.cylinder(g, w * .36, .014, 0, hh * .65 + .013, d * .13, '#b7cbc5', 1, d * .55 / w);
      this.cylinder(g, w * .25, .017, 0, hh * .65 + .026, d * .13, '#e8efeb', 1, d * .55 / w);
      this.box(g, w * .2, .01, .035, 0, hh + .01, -d * .36, '#b2bdb7');
    } else if (['sink', 'basin', 'vanity'].includes(k)) {
      const hh = height(h);
      this.box(g, w, hh, d, 0, hh / 2, 0, k === 'vanity' ? '#c8b18e' : '#e4e7df', true);
      this.roundedBox(g, w * .9, .025, d * .85, 0, hh + .015, 0, '#f8f9f3', .065);
      this.roundedBox(g, w * .65, .015, d * .62, 0, hh + .032, d * .03, '#b2c4be', .08);
      this.roundedBox(g, w * .49, .012, d * .45, 0, hh + .043, d * .045, '#d7e0d9', .07);
      this.cylinder(g, .018, .02, 0, hh + .055, d * .09, '#7c9188');
      this.cylinder(g, .023, top ? .06 : .18, 0, hh + (top ? .04 : .09), -d * .33, '#879b93');
      this.box(g, .035, .025, d * .20, 0, hh + (top ? .07 : .17), -d * .25, '#879b93');
    } else if (k === 'shower') {
      this.box(g, w, .025, d, 0, .015, 0, color || '#d5e1dc', true);
      const trayW = w * .90, trayD = d * .90;
      this.line(g, [[-trayW / 2, .032, -trayD / 2], [trayW / 2, .032, -trayD / 2], [trayW / 2, .032, trayD / 2], [-trayW / 2, .032, trayD / 2], [-trayW / 2, .032, -trayD / 2]], '#9eb8ad');
      this.cylinder(g, .04, .01, 0, .038, 0, '#81988d');
      if (!top) {
        this.box(g, .015, 1.2, d, -w / 2, .6, 0, '#b1d7cf', false, { transparent: true, opacity: .24 });
        this.box(g, w, 1.2, .015, 0, .6, d / 2, '#b1d7cf', false, { transparent: true, opacity: .24 });
      }
    } else if (k === 'stove') {
      const hh = height(h);
      this.box(g, w, hh, d, 0, hh / 2, 0, '#cfcec3', true);
      this.roundedBox(g, w * .9, .02, d * .9, 0, hh + .015, 0, '#65746a', .025);
      const burnerCount = w > .65 ? 4 : 2;
      for (let i = 0; i < burnerCount; i++) {
        const x = burnerCount === 4 ? (i % 2 ? 1 : -1) * w * .22 : 0;
        const z = (i < burnerCount / 2 ? -1 : 1) * d * .23;
        this.cylinder(g, Math.min(w, d) * .16, .01, x, hh + .035, z, '#aeb9ae');
        this.cylinder(g, Math.min(w, d) * .09, .012, x, hh + .043, z, '#47574d');
      }
    } else if (k === 'washer') {
      const hh = height(h);
      this.roundedBox(g, w, hh, d, 0, hh / 2, 0, color || '#edf0e8', .025);
      this.cylinder(g, Math.min(w, d) * .34, .015, 0, hh + .01, d * .07, '#99b9b0');
      this.cylinder(g, Math.min(w, d) * .27, .018, 0, hh + .022, d * .07, '#d4e0da');
      this.box(g, w * .83, .018, d * .12, 0, hh + .02, -d * .37, '#c4d2ca');
    } else if (k === 'lamp') {
      const r = Math.min(w, d) / 2, baseY = top ? .35 : Math.max(.05, h - .32);
      this.cylinder(g, r * .55, .02, 0, baseY, 0, '#8a957e');
      this.cylinder(g, r * .09, top ? .035 : .21, 0, baseY + (top ? .025 : .11), 0, '#9f9276');
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(r * .55, r, top ? .03 : .16, 24), this.material(color || '#eee4ce'));
      shade.position.set(0, top ? baseY + .06 : h - .06, 0); shade.castShadow = !top; g.add(shade); this.edges(shade, '#a7997d', .3);
    } else if (k === 'plant') {
      const r = Math.min(w, d) / 2;
      this.cylinder(g, r * .58, height(h * .4), 0, height(h * .4) / 2, 0, '#c8bca4');
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39996;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(r * .55, 12, 8), this.material(i % 2 ? '#819875' : '#6d8763'));
        leaf.scale.set(.65, top ? .28 : 1.1, 1.2);
        leaf.position.set(Math.cos(a) * r * .4, height(h * .6) + i % 3 * .04, Math.sin(a) * r * .4);
        leaf.rotation.y = a; leaf.castShadow = !top; g.add(leaf);
      }
    } else if (k === 'fridge') {
      const hh = height(h);
      this.roundedBox(g, w, hh, d, 0, hh / 2, 0, color || '#dce0d7', .03);
      this.line(g, [[-w / 2 + .015, hh + .005, d * .1], [w / 2 - .015, hh + .005, d * .1]], '#8d9a90');
      if (!top) {
        this.line(g, [[-w / 2, h * .32, d / 2 + .01], [w / 2, h * .32, d / 2 + .01]], '#89968c');
        this.box(g, .025, .3, .035, w * .35, h * .55, d / 2 + .02, '#8e9d93');
      }
    } else {
      const hh = height(h), cabinet = ['wardrobe', 'cabinet', 'counter', 'nightstand'].includes(k);
      this.box(g, w, hh, d, 0, hh / 2, 0, color || (cabinet ? '#d3c4a8' : '#d3d8cc'), true);
      if (cabinet) {
        this.box(g, w * .99, .025, d * .99, 0, hh + .01, 0, k === 'counter' ? '#eeeade' : '#e1d3b9', true);
        const n = Math.max(1, Math.round(w / .65));
        for (let i = 1; i < n; i++) this.line(g, [[-w / 2 + w * i / n, hh + .026, -d / 2], [-w / 2 + w * i / n, hh + .026, d / 2]], '#aa9c85', .55);
        if (!top) for (let i = 0; i < n; i++) this.box(g, .08, .018, .022, -w / 2 + w * (i + .5) / n, hh * .75, d / 2 + .01, '#867c68');
      }
    }
  }

  addLabel(text, point, kind = 'measure', extra = '') {
    const el = document.createElement('div');
    el.className = `plan-scene-label plan-scene-${kind} ${extra}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    const record = { el, point, kind };
    this.labels.push(record);
    return record;
  }

  bounds(includeThickness = true, wallsOnly = false) {
    if (!this.plan?.objects?.length) return { minX: 0, maxX: 9.8, minY: 0, maxY: 10.3 };
    const walls = this.plan.objects.filter(o => o.type === 'wall' && o.visible !== false);
    const all = this.plan.objects.filter(o => o.visible !== false);
    const source = wallsOnly && walls.length ? walls : all;
    if (!source.length) return { minX: 0, maxX: 9.8, minY: 0, maxY: 10.3 };
    const xs = [], ys = [];
    for (const o of source) {
      const a = finite(o.rotation) * RAD;
      const depth = o.type === 'wall' && !includeThickness ? 0 : o.depth;
      const ex = (Math.abs(Math.cos(a)) * o.width + Math.abs(Math.sin(a)) * depth) / 2;
      const ey = (Math.abs(Math.sin(a)) * o.width + Math.abs(Math.cos(a)) * depth) / 2;
      xs.push((o.x - ex) * M, (o.x + ex) * M); ys.push((o.y - ey) * M, (o.y + ey) * M);
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  drawDimensions() {
    if (!this.options.dimensions || this.view !== '2d') return;
    const b = this.bounds(false, true);
    const g = new THREE.Group();
    this.world.add(g);
    const y = b.maxY + .50, x = b.minX - .50, level = .08;
    this.line(g, [[b.minX, level, y], [b.maxX, level, y]], '#929e92', .75);
    this.line(g, [[x, level, b.minY], [x, level, b.maxY]], '#929e92', .75);
    for (const xx of [b.minX, b.maxX]) this.line(g, [[xx, level, y - .12], [xx, level, y + .12]], '#929e92', .75);
    for (const yy of [b.minY, b.maxY]) this.line(g, [[x - .12, level, yy], [x + .12, level, yy]], '#929e92', .75);
    this.addLabel(`${Math.round((b.maxX - b.minX) * 1000)} mm`, new THREE.Vector3((b.minX + b.maxX) / 2, .09, y), 'measure');
    this.addLabel(`${Math.round((b.maxY - b.minY) * 1000)} mm`, new THREE.Vector3(x, .09, (b.minY + b.maxY) / 2), 'measure');
  }

  select(id) {
    this.selected = id;
    this.drawSelection();
  }

  drawSelection() {
    this.disposeGroup(this.selectionGroup);
    this.labels.filter(l => l.kind === 'selection').forEach(l => l.el.remove());
    this.labels = this.labels.filter(l => l.kind !== 'selection');
    this.rotateHandle?.remove(); this.rotateHandle = null;
    if (this.tool === 'measure') return;
    const o = this.plan?.objects.find(x => x.id === this.selected && x.visible !== false);
    if (!o) return;
    const w = o.width * M, d = Math.max(o.depth * M, .05), cx = o.x * M, cz = o.y * M;
    const angle = finite(o.rotation) * RAD;
    const local = (x, z, y = 2.9) => {
      z *= o.mirrorY ? -1 : 1;
      return new THREE.Vector3(cx + Math.cos(angle) * x - Math.sin(angle) * z, y, cz + Math.sin(angle) * x + Math.cos(angle) * z);
    };
    const actualTop = ((o.height || 800) + (o.type === 'window' ? finite(o.sill, 900) : 0)) * M;
    const level = this.view === '2d' ? 2.9 : (this.options.fullHeight || o.type === 'furniture' ? actualTop + .04 : Math.min(actualTop + .04, 1.4));
    const p = .055;
    const corners = [[-w / 2 - p, -d / 2 - p], [w / 2 + p, -d / 2 - p], [w / 2 + p, d / 2 + p], [-w / 2 - p, d / 2 + p], [-w / 2 - p, -d / 2 - p]].map(([x, z]) => local(x, z, level).toArray());
    this.line(this.selectionGroup, corners, ACCENT, 1);
    if (this.view === '2d') {
      for (const [x, z] of [[-w / 2 - p, -d / 2 - p], [w / 2 + p, -d / 2 - p], [w / 2 + p, d / 2 + p], [-w / 2 - p, d / 2 + p]]) {
        const v = local(x, z, level);
        this.box(this.selectionGroup, .075, .018, .075, v.x, level, v.z, '#ffffff');
      }
      const screenCorners = corners.slice(0, 4).map(p => new THREE.Vector3(...p));
      const name = this.addLabel(`${o.locked ? '🔒 ' : ''}${o.name}`, local(0, 0), 'selected');
      name.kind = 'selection'; name.screenCorners = screenCorners; name.offsetY = 20;
      if (this.options.dimensions) {
        const dim = this.addLabel(`${Math.round(o.width)} × ${Math.round(o.depth)} mm`, local(0, 0), 'measure');
        dim.kind = 'selection'; dim.screenCorners = screenCorners; dim.offsetY = 43;
      }
      if (!o.locked && !o.wallId) {
        this.rotatePoint = local(0, -d / 2 - .58);
        this.line(this.selectionGroup, [local(0, -d / 2 - .05, level).toArray(), this.rotatePoint.toArray()], ACCENT, .8);
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'plan-scene-rotate'; button.textContent = '↻';
        button.setAttribute('aria-label', '拖动旋转所选对象');
        button.title = '拖动旋转 · 开启吸附时以 15° 为步长';
        button.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.beginDrag(e, o, 'rotate'); });
        this.overlay.appendChild(button); this.rotateHandle = button;
      }
    }
  }

  placeLabels() {
    if (!this.width || !this.height) return;
    for (const l of this.labels) {
      const p = l.point.clone().project(this.camera);
      let x = (p.x * .5 + .5) * this.width, y = (-p.y * .5 + .5) * this.height;
      x += l.pixelOffsetX || 0; y += l.pixelOffsetY || 0;
      if (l.screenCorners) {
        const projected = l.screenCorners.map(v => v.clone().project(this.camera));
        const xs = projected.map(v => (v.x * .5 + .5) * this.width);
        const ys = projected.map(v => (-v.y * .5 + .5) * this.height);
        x = (Math.min(...xs) + Math.max(...xs)) / 2;
        y = Math.max(...ys) + l.offsetY;
        // Keep the pair together when a selected object nears the bottom edge.
        const overflow = Math.max(0, Math.max(...ys) + 55 - this.height);
        y -= overflow;
        x = Math.max(110, Math.min(this.width - 110, x));
      }
      const outside = p.z < -1 || p.z > 1 || x < 0 || x > this.width || y < 12 || y > this.height - 12;
      l.el.style.display = outside ? 'none' : '';
      if (!outside) {
        const margin = Math.min(this.width / 2, l.el.offsetWidth / 2 + 7);
        x = Math.max(margin, Math.min(this.width - margin, x));
      }
      l.el.style.left = `${x}px`; l.el.style.top = `${y}px`;
    }
    if (this.rotateHandle) {
      const p = this.rotatePoint.clone().project(this.camera);
      this.rotateHandle.style.left = `${(p.x * .5 + .5) * this.width}px`;
      this.rotateHandle.style.top = `${(-p.y * .5 + .5) * this.height}px`;
    }
  }

  getScreenPosition(id) {
    const o = this.plan?.objects.find(o => o.id === id);
    if (!o) return null;
    this.camera.updateMatrixWorld();
    const p = new THREE.Vector3(o.x * M, this.view === '2d' ? .5 : Math.min(o.height * M / 2, .7), o.y * M).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x * .5 + .5) * r.width, y: r.top + (-p.y * .5 + .5) * r.height };
  }

  ray(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster;
  }

  groundPoint(e) {
    const v = new THREE.Vector3();
    return this.ray(e).ray.intersectPlane(this.ground, v) ? v : null;
  }

  hit(e) {
    const hits = this.ray(e).intersectObjects([...this.items.values()], true);
    // Line segments are decorative. On a cut opening the leaf/frame is picked.
    return hits.find(h => h.object.isMesh && h.object.userData.id)?.object.userData.id || null;
  }

  millimetresPerPixel() {
    return this.topCamera && this.height ? (this.topCamera.top - this.topCamera.bottom) / this.topCamera.zoom / this.height / M : 1;
  }

  measurementPoint(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
    const point = this.groundPoint(e);
    if (!point) return null;
    return snapMeasurementPoint({ x: point.x / M, y: point.z / M }, this.measureTargets, this.millimetresPerPixel() * 11, {
      enabled: this.options.snap && !e.altKey,
      origin: this.measurement?.complete ? null : this.measurement?.start,
      axisLock: e.shiftKey === true,
    });
  }

  notifyMeasurement() {
    const state = this.measurement;
    this.callbacks.onMeasurementChange?.({ ...state, start: state.start ? { ...state.start } : null, end: state.end ? { ...state.end } : null });
  }

  clearMeasurement() {
    this.measurement = { start: null, end: null, complete: false, snapLabel: '' };
    this.measureDown = null; this.measureHover = null;
    this.measurePointers?.clear();
    this.drawMeasurement();
    this.notifyMeasurement();
  }

  drawMeasurement() {
    if (!this.measurementGroup) return;
    this.disposeGroup(this.measurementGroup);
    this.labels.filter(l => l.kind === 'measurement').forEach(l => l.el.remove());
    this.labels = this.labels.filter(l => l.kind !== 'measurement');
    this.measureScale = this.millimetresPerPixel();
    if (this.tool !== 'measure' || this.view !== '2d') return;
    const { start, end } = this.measurement;
    const level = 3.1, radius = this.measureScale * M * 4;
    const coord = p => [p.x * M, level, p.y * M];
    const marker = (p, name) => {
      const circle = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false, depthWrite: false }));
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(...coord(p));
      this.measurementGroup.add(circle);
      if (name) {
        const label = this.addLabel(name, new THREE.Vector3(...coord(p)), 'ruler-point');
        label.kind = 'measurement'; label.pixelOffsetY = -14;
      }
    };
    if (start) marker(start, 'A');
    if (start && end) {
      const { distance, dx, dy } = measurementMetrics(start, end);
      if (dx > 1 && dy > 1) this.line(this.measurementGroup, [coord(start), coord({ x: end.x, y: start.y }), coord(end)], ACCENT, .45, true);
      this.line(this.measurementGroup, [coord(start), coord(end)], ACCENT, 1);
      marker(end, 'B');
      const midpoint = new THREE.Vector3((start.x + end.x) * M / 2, level, (start.y + end.y) * M / 2);
      const label = this.addLabel(`${Math.round(distance).toLocaleString('zh-CN')} mm`, midpoint, 'ruler');
      label.kind = 'measurement'; label.pixelOffsetY = 19;
    } else if (this.measureHover) marker(this.measureHover);
    // A drafting overlay must remain visible above walls and furniture.
    this.measurementGroup.traverse(node => {
      node.renderOrder = 1000;
      if (node.material) { node.material.depthTest = false; node.material.depthWrite = false; }
    });
  }

  measurementPointerDown(e) {
    this.measurePointers ??= new Set();
    this.measurePointers.add(e.pointerId);
    if (e.button !== 0 || this.measurePointers.size > 1) {
      if (this.measureDown) this.measureDown.cancelled = true;
      return;
    }
    this.measureDown = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, cancelled: false };
  }

  measurementPointerMove(e) {
    const down = this.measureDown;
    if (down && (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || this.measurePointers?.size > 1)) down.cancelled = true;
    if ((e.buttons && (!down || down.cancelled)) || this.measurePointers?.size > 1 || this.measurement.complete) return;
    const point = this.measurementPoint(e);
    if (!point) return;
    this.measureHover = { x: point.x, y: point.y };
    if (this.measurement.start) this.measurement.end = { ...this.measureHover };
    this.measurement.snapLabel = point.snapLabel;
    this.drawMeasurement();
    this.notifyMeasurement();
  }

  measurementPointerUp(e) {
    const down = this.measureDown;
    this.measurePointers?.delete(e.pointerId);
    if (!down || down.pointerId !== e.pointerId) return;
    this.measureDown = null;
    if (e.type === 'pointercancel' || e.button !== 0 || down.cancelled || this.measurePointers?.size || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const point = this.measurementPoint(e);
    if (!point) return;
    const p = { x: point.x, y: point.y };
    if (!this.measurement.start || this.measurement.complete) this.measurement = { start: p, end: null, complete: false, snapLabel: point.snapLabel };
    else this.measurement = { ...this.measurement, end: p, complete: true, snapLabel: point.snapLabel };
    this.measureHover = null;
    this.drawMeasurement();
    this.notifyMeasurement();
  }

  pointerDown(e) {
    if (this.tool === 'measure' && this.view === '2d') { this.measurementPointerDown(e); return; }
    if (e.button !== 0) return;
    const id = this.hit(e);
    this.downClient = { x: e.clientX, y: e.clientY, id };
    if (this.view === '3d') return;
    this.callbacks.onSelect?.(id);
    this.select(id);
    const o = this.plan?.objects.find(o => o.id === id);
    if (o && !o.locked) this.beginDrag(e, o, this.tool === 'rotate' && !o.wallId ? 'rotate' : 'move');
  }

  beginDrag(e, o, mode) {
    const ground = this.groundPoint(e);
    if (!ground) return;
    this.controls.enabled = false;
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch { /* Older browsers still use window listeners. */ }
    this.drag = {
      id: o.id, pointerId: e.pointerId, mode, started: false,
      clientX: e.clientX, clientY: e.clientY,
      start: ground, original: { x: o.x, y: o.y, rotation: finite(o.rotation) },
      object: { ...o }, snapTargets: o.type === 'furniture' ? buildWallSnapTargets(this.plan) : [],
      snapState: null, snapResult: null,
      startAngle: Math.atan2(ground.z - o.y * M, ground.x - o.x * M), lastPatch: null
    };
    this.renderer.domElement.style.cursor = mode === 'rotate' ? 'grabbing' : 'move';
  }

  pointerMove(e) {
    if (this.tool === 'measure' && this.view === '2d') { this.measurementPointerMove(e); return; }
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = this.groundPoint(e);
    if (!p) return;
    if (!d.started && Math.hypot(e.clientX - d.clientX, e.clientY - d.clientY) < 3) return;
    if (!d.started) { d.started = true; this.callbacks.onTransform?.(d.id, {}, 'start'); }
    let patch;
    if (d.mode === 'rotate') {
      let angle = d.original.rotation + (Math.atan2(p.z - d.original.y * M, p.x - d.original.x * M) - d.startAngle) / RAD;
      angle = ((angle % 360) + 360) % 360;
      if (this.options.snap && !e.altKey) angle = Math.round(angle / 15) * 15 % 360;
      patch = { rotation: Math.round(angle * 10) / 10 };
    } else {
      let x = d.original.x + (p.x - d.start.x) * 1000, y = d.original.y + (p.z - d.start.z) * 1000;
      if (this.view === '2d' && d.object.type === 'furniture') {
        const result = snapFurniturePosition(d.object, { x, y }, d.snapTargets, {
          enabled: this.options.snap && !e.altKey,
          millimetresPerPixel: this.millimetresPerPixel(), previous: d.snapState,
        });
        d.snapState = result.state; d.snapResult = result;
        ({ x, y } = result);
        this.drawFurnitureSnap(result);
      } else {
        const step = this.options.snap && !e.altKey ? 50 : 1;
        x = Math.round(x / step) * step; y = Math.round(y / step) * step;
      }
      patch = { x, y };
    }
    if (JSON.stringify(patch) === JSON.stringify(d.lastPatch)) return;
    d.lastPatch = patch;
    this.callbacks.onTransform?.(d.id, patch, 'preview');
  }

  pointerUp(e) {
    if (this.tool === 'measure' && this.view === '2d') { this.measurementPointerUp(e); return; }
    if (this.view === '3d' && this.downClient && Math.hypot(e.clientX - this.downClient.x, e.clientY - this.downClient.y) < 4) {
      this.callbacks.onSelect?.(this.downClient.id); this.select(this.downClient.id);
    }
    this.downClient = null;
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    this.finishDrag(e.type !== 'pointercancel');
  }

  finishDrag(commit = true) {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    try { this.renderer.domElement.releasePointerCapture(d.pointerId); } catch { /* Pointer cancellation may already release it. */ }
    this.controls.enabled = true;
    this.renderer.domElement.style.cursor = '';
    this.drawFurnitureSnap(null);
    if (d.started && d.lastPatch) this.callbacks.onTransform?.(d.id, d.lastPatch, commit ? 'commit' : 'cancel');
  }

  drawFurnitureSnap(result) {
    if (!this.snapGroup) return;
    this.disposeGroup(this.snapGroup);
    this.labels.filter(l => l.kind === 'snap').forEach(l => l.el.remove());
    this.labels = this.labels.filter(l => l.kind !== 'snap');
    if (!result?.label || this.view !== '2d') return;
    for (const guide of result.guides) {
      const points = [guide.a, guide.b].map(p => [p.x * M, 3.15, p.y * M]);
      const line = this.line(this.snapGroup, points, ACCENT, 1);
      line.renderOrder = 1001; line.material.depthTest = false; line.material.depthWrite = false;
    }
    const label = this.addLabel(`吸附：${result.label}`, new THREE.Vector3(result.x * M, 3.15, result.y * M), 'ruler');
    label.kind = 'snap'; label.pixelOffsetY = -24;
  }

  setView(view) {
    if (!['2d', '3d'].includes(view) || view === this.view) return;
    if (view === '3d' && this.tool === 'measure') this.setTool('move');
    this.finishDrag();
    this.view = view;
    this.camera = view === '2d' ? this.topCamera : this.perspectiveCamera;
    // OrbitControls caches the camera-up quaternion. Recreate it when swapping
    // between -Z-up plan camera and +Y-up perspective camera.
    this.controls.dispose();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .14;
    this.controls.screenSpacePanning = true;
    this.controls.minZoom = .25; this.controls.maxZoom = 12;
    this.controls.minDistance = 3; this.controls.maxDistance = 45;
    this.controls.enableRotate = view === '3d';
    this.controls.maxPolarAngle = view === '3d' ? Math.PI * .47 : Math.PI;
    this.controls.mouseButtons.LEFT = view === '3d' ? THREE.MOUSE.ROTATE : null;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = view === '3d' ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.target.set(4.9, 0, 5.15);
    this.sun.intensity = view === '3d' ? 2.4 : 1.5;
    this.scene.background.set(view === '3d' ? '#eaece4' : '#f1f2ed');
    this.grid.visible = this.options.grid;
    this.setPlan(this.plan);
    this.fit();
  }

  setTool(tool) {
    const next = ['move', 'rotate', 'measure'].includes(tool) ? tool : 'move';
    if (next === this.tool) return;
    this.finishDrag(); this.downClient = null;
    this.controls.enabled = true;
    if (this.tool === 'measure') this.clearMeasurement();
    this.tool = next;
    this.renderer.domElement.style.cursor = next === 'measure' ? 'crosshair' : '';
    this.drawSelection();
    this.drawMeasurement();
    if (next === 'measure') this.notifyMeasurement();
  }

  setOptions(options) {
    const previous = { ...this.options };
    Object.assign(this.options, options);
    if (previous.snap && !this.options.snap && this.drag) {
      this.drag.snapState = null; this.drag.snapResult = null; this.drawFurnitureSnap(null);
    }
    this.grid.visible = this.options.grid;
    if (['labels', 'dimensions', 'reference', 'fullHeight'].some(k => previous[k] !== this.options[k])) this.setPlan(this.plan);
  }

  fit() {
    const b = this.bounds(), cx = (b.minX + b.maxX) / 2, cz = (b.minY + b.maxY) / 2;
    const w = b.maxX - b.minX, d = b.maxY - b.minY;
    this.controls.target.set(cx, 0, cz);
    if (this.view === '2d') {
      const aspect = this.width / this.height;
      this.topSpan = Math.max(d + 2.1, (w + 2.1) / aspect);
      this.topCamera.zoom = 1;
      this.topCamera.position.set(cx, 40, cz);
      this.topCamera.up.set(0, 0, -1);
      this.topCamera.lookAt(cx, 0, cz);
      this.resize();
    } else {
      const size = Math.max(w, d);
      this.perspectiveCamera.position.set(cx + size * .95, size * 1.25, cz + size * 1.35);
      this.perspectiveCamera.lookAt(cx, 0, cz);
    }
    this.controls.update();
  }

  zoom(factor) {
    if (this.view === '2d') {
      this.topCamera.zoom = THREE.MathUtils.clamp(this.topCamera.zoom * factor, .25, 12);
      this.topCamera.updateProjectionMatrix();
    } else {
      const delta = this.perspectiveCamera.position.clone().sub(this.controls.target).multiplyScalar(1 / factor);
      if (delta.length() >= 3 && delta.length() <= 45) this.perspectiveCamera.position.copy(this.controls.target).add(delta);
    }
  }

  exportPNG() {
    this.placeLabels();
    this.renderer.render(this.scene, this.camera);
    // Compose DOM annotation positions into the downloadable image so labels
    // remain part of the deliverable rather than disappearing from screenshots.
    const source = this.renderer.domElement;
    const out = document.createElement('canvas'); out.width = source.width; out.height = source.height;
    const ctx = out.getContext('2d'); ctx.drawImage(source, 0, 0);
    const scale = source.width / this.width;
    ctx.scale(scale, scale);
    for (const l of this.labels) {
      if (l.el.style.display === 'none') continue;
      const x = parseFloat(l.el.style.left), y = parseFloat(l.el.style.top);
      const selected = l.el.classList.contains('plan-scene-selected') || l.el.classList.contains('plan-scene-ruler');
      ctx.font = `${selected ? 550 : 500} ${l.kind === 'room' ? 12 : 11}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (selected) {
        const width = ctx.measureText(l.el.textContent).width + 16;
        ctx.fillStyle = ACCENT; ctx.fillRect(x - width / 2, y - 11, width, 22);
      }
      ctx.fillStyle = selected ? '#ffffff' : '#667367';
      ctx.fillText(l.el.textContent, x, y);
    }
    return out.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect(); this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move); window.removeEventListener('pointerup', this._up); window.removeEventListener('pointercancel', this._up);
    window.removeEventListener('blur', this._blur);
    this.renderer.domElement.removeEventListener('contextmenu', this._context);
    this.disposeGroup(this.world); this.disposeGroup(this.selectionGroup);
    this.disposeGroup(this.measurementGroup);
    this.disposeGroup(this.snapGroup);
    this.grid.geometry.dispose(); this.grid.material.dispose(); this.referenceTexture?.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove(); this.overlay.remove(); this.style.remove();
  }
}
