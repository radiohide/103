import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
import { PlanScene } from './dist/src/scene.js';
import { createInitialPlan, updateObject } from './dist/src/model.js';

const pointer = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1, type: 'pointermove', ...extra });
const furniture = { id: 'cabinet', type: 'furniture', name: '柜子', x: 500, y: 1000, width: 600, depth: 400, height: 800, rotation: 0 };
const wall = { id: 'wall', type: 'wall', name: '北墙', x: 0, y: 0, width: 6000, depth: 220, height: 2800, rotation: 0, locked: true };

// Exercise the actual pointer lifecycle and plan rebuilds without a WebGL context.
function movingScene({ object = furniture, walls = [wall], zoom = 1 } = {}) {
  const scene = Object.create(PlanScene.prototype), events = [], overlays = [], captures = [];
  const plan = { objects: structuredClone([object, ...walls]) };
  let before = null;
  const document = { addEventListener() {}, removeEventListener() {} };
  Object.assign(scene, {
    plan, view: '2d', tool: 'move', selected: object.id, drag: null,
    options: { snap: true, grid: true },
    world: new THREE.Group(), items: new Map(), labels: [],
    controls: { enabled: true, dispose() {} }, grid: { visible: true },
    scene: { background: new THREE.Color() }, sun: { intensity: 1 },
    topCamera: new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 200),
    perspectiveCamera: new THREE.PerspectiveCamera(), height: 1000,
    renderer: { domElement: {
      style: {}, ownerDocument: document, addEventListener() {}, removeEventListener() {},
      setPointerCapture(id) { captures.push(['set', id]); },
      releasePointerCapture(id) { captures.push(['release', id]); },
    } },
    groundPoint(e) { return new THREE.Vector3(e.clientX / 100, 0, e.clientY / 100); },
    hit() { return object.id; },
    drawSelection() {}, drawMeasurement() {}, drawDimensions() {},
    buildFloor() {}, buildWall() {}, buildFurniture() {}, fit() {},
    drawFurnitureSnap(result) { overlays.push(result); },
    callbacks: {
      onTransform(id, patch, phase) {
        events.push({ id, patch: { ...patch }, phase });
        if (phase === 'start') { before = structuredClone(scene.plan); return; }
        scene.plan = structuredClone(before);
        if (phase !== 'cancel') Object.assign(scene.plan.objects.find(o => o.id === id), patch);
        scene.setPlan(scene.plan);
      },
    },
  });
  scene.topCamera.zoom = zoom;
  scene.pointerDown(pointer(object.x / 10, object.y / 10, { type: 'pointerdown' }));
  return { scene, events, overlays, captures };
}

test('furniture drag prioritizes the wall face and survives full preview rebuilds', () => {
  const { scene, events, overlays } = movingScene();
  scene.pointerMove(pointer(61.3, 34.7));
  assert.deepEqual(events.at(-1).patch, { x: 600, y: 310 });
  assert.equal(scene.plan.objects[0].y - furniture.depth / 2, wall.depth / 2, 'outer edge meets the face, not the wall centreline');
  const target = [...scene.drag.snapState.targetIds];
  assert.ok(target.length);
  assert.strictEqual(overlays.at(-1), scene.drag.snapResult, 'setPlan redraws the current overlay');
  // 140 mm exceeds the 120 mm entry radius but is inside the 180 mm release radius.
  scene.pointerMove(pointer(66.3, 45));
  assert.equal(events.at(-1).patch.y, 310);
  assert.deepEqual(scene.drag.snapState.targetIds, target);
  scene.pointerMove(pointer(66.3, 55));
  assert.deepEqual(events.at(-1).patch, { x: 650, y: 550 });
  assert.deepEqual(scene.drag.snapState.targetIds, []);
});

test('Alt and the snap checkbox bypass both wall attraction and grid rounding', () => {
  const { scene, events, overlays } = movingScene();
  scene.pointerMove(pointer(61.3, 34.7));
  scene.pointerMove(pointer(61.3, 34.7, { altKey: true }));
  assert.deepEqual(events.at(-1).patch, { x: 613, y: 347 });
  assert.equal(scene.drag.snapResult.label, '');
  assert.deepEqual(scene.drag.snapState.targetIds, []);
  scene.pointerMove(pointer(61.3, 34.7));
  assert.ok(scene.drag.snapState.targetIds.length);
  scene.setOptions({ snap: false });
  assert.equal(scene.drag.snapState, null);
  assert.equal(overlays.at(-1), null);
  scene.pointerMove(pointer(62.7, 35.9));
  assert.deepEqual(events.at(-1).patch, { x: 627, y: 359 });
});

test('zoom narrows the millimetre attraction radius while free movement retains 50 mm grid', () => {
  const { scene, events } = movingScene({ zoom: 10 });
  scene.pointerMove(pointer(61.3, 34.7));
  assert.deepEqual(events.at(-1).patch, { x: 600, y: 350 });
  assert.deepEqual(scene.drag.snapState.targetIds, []);
  scene.pointerMove(pointer(61.3, 32));
  assert.equal(events.at(-1).patch.y, 310);
  const free = movingScene({ walls: [] });
  free.scene.pointerMove(pointer(61.3, 34.7));
  assert.deepEqual(free.events.at(-1).patch, { x: 600, y: 350 });
});

test('non-furniture movement and rotation keep their original grid and angular steps', () => {
  const moving = movingScene({ object: { ...furniture, type: 'wall' }, walls: [wall] });
  moving.scene.pointerMove(pointer(61.3, 34.7));
  assert.deepEqual(moving.events.at(-1).patch, { x: 600, y: 350 });
  assert.equal(moving.scene.drag.snapResult, null);
  const rotating = movingScene();
  rotating.scene.finishDrag();
  rotating.scene.beginDrag(pointer(100, 100), rotating.scene.plan.objects[0], 'rotate');
  const angle = 22 * Math.PI / 180;
  rotating.scene.pointerMove(pointer(50 + 50 * Math.cos(angle), 100 + 50 * Math.sin(angle)));
  assert.equal(rotating.events.at(-1).patch.rotation, 15);
  rotating.scene.pointerMove(pointer(50 + 50 * Math.cos(angle), 100 + 50 * Math.sin(angle), { altKey: true }));
  assert.equal(rotating.events.at(-1).patch.rotation, 22);
});

test('release commits once, cancellation restores position, and both clear the overlay', () => {
  for (const cancelled of [false, true]) {
    const { scene, events, overlays, captures } = movingScene();
    scene.pointerMove(pointer(61.3, 34.7));
    scene.pointerUp(pointer(61.3, 34.7, { type: cancelled ? 'pointercancel' : 'pointerup', buttons: 0 }));
    scene.pointerUp(pointer(61.3, 34.7, { type: 'pointerup', buttons: 0 }));
    assert.deepEqual(events.map(e => e.phase), ['start', 'preview', cancelled ? 'cancel' : 'commit']);
    assert.equal(scene.plan.objects[0].y, cancelled ? 1000 : 310);
    assert.equal(scene.drag, null);
    assert.equal(scene.controls.enabled, true);
    assert.equal(scene.renderer.domElement.style.cursor, '');
    assert.ok(overlays.at(-1) == null, 'rebuild leaves no active snap overlay');
    assert.deepEqual(captures, [['set', 1], ['release', 1]]);
  }
});

test('switching tool or view finishes the drag and leaves no sticky target', () => {
  for (const change of ['tool', 'view']) {
    const { scene, events } = movingScene();
    scene.pointerMove(pointer(61.3, 34.7));
    if (change === 'tool') scene.setTool('rotate');
    else scene.setView('3d');
    assert.equal(scene.drag, null);
    assert.equal(events.filter(e => e.phase === 'commit').length, 1);
    assert.equal(scene.controls.enabled, true);
    if (change === 'view') scene.controls.dispose();
  }
});

test('snap overlay uses a separate disposable group and disappears in 3D or when disabled', () => {
  const { scene } = movingScene();
  scene.snapGroup = new THREE.Group();
  scene.drawFurnitureSnap = PlanScene.prototype.drawFurnitureSnap;
  scene.addLabel = function (text, point, kind) {
    const label = { point, kind, el: { textContent: text, remove() {} } };
    this.labels.push(label); return label;
  };
  const result = { x: 600, y: 310, label: '北墙', guides: [{ a: { x: 0, y: 110 }, b: { x: 1200, y: 110 }, label: '北墙' }] };
  scene.drawFurnitureSnap(result);
  assert.equal(scene.snapGroup.children.length, 1);
  assert.equal(scene.snapGroup.children[0].material.depthTest, false);
  assert.equal(scene.labels.at(-1).kind, 'snap');
  assert.equal(scene.labels.at(-1).el.textContent, '吸附：北墙');
  scene.drawFurnitureSnap(null);
  assert.equal(scene.snapGroup.children.length, 0);
  assert.equal(scene.labels.length, 0);
  scene.view = '3d';
  scene.drawFurnitureSnap(result);
  assert.equal(scene.labels.length, 0);
});

// Execute the real app key handler with a tiny environment; geometry remains the
// production model. This catches accidental routing of nudge keys through snap.
const appSource = await readFile(new URL('./dist/src/app.js', import.meta.url), 'utf8');
const keyStart = appSource.indexOf("document.addEventListener('keydown',e=>{");
const keyEnd = appSource.indexOf('\ntry{scene=new PlanScene', keyStart);
function keyboardHarness() {
  const plan = createInitialPlan(), object = plan.objects.find(o => o.type === 'furniture');
  Object.assign(object, { x: 613, y: 347, locked: false });
  const changes = [], document = { activeElement: { tagName: 'BODY' }, querySelector() { return null; }, addEventListener(name, fn) { this.handler = fn; } };
  const scene = { drag: null, options: { snap: true }, finishDrag(commit = true) { changes.push(commit ? 'finish' : 'cancel'); this.drag = null; } };
  vm.runInNewContext(appSource.slice(keyStart, keyEnd), {
    document, window: { getSelection() { return null; } }, plan, scene, tool: 'move', view: '2d', linked: true, anchor: 'center',
    selectedObject: () => plan.objects.find(o => o.id === object.id), updateObject,
    mutate: fn => { changes.push('mutate'); fn(); }, finishPendingDrag: () => scene.finishDrag(),
  });
  return { plan, object: () => plan.objects.find(o => o.id === object.id), document, scene, changes,
    press(key, extra = {}) { document.handler({ key, preventDefault() {}, ...extra }); } };
}

test('keyboard arrows always move by 10 / 100 mm without wall or grid attraction', () => {
  const h = keyboardHarness();
  h.press('ArrowRight');
  assert.equal(h.object().x, 623);
  h.press('ArrowUp', { shiftKey: true });
  assert.equal(h.object().y, 247);
  h.press('ArrowLeft'); h.press('ArrowDown');
  assert.deepEqual([h.object().x, h.object().y], [613, 257]);
  h.document.activeElement = { tagName: 'INPUT' };
  h.press('ArrowRight');
  assert.equal(h.object().x, 613, 'native numeric-input editing is not intercepted');
});

test('keyboard nudging ends an active mouse drag first; Escape cancels it', () => {
  const h = keyboardHarness();
  h.scene.drag = { id: h.object().id };
  h.press('ArrowRight');
  assert.deepEqual(h.changes, ['finish', 'mutate']);
  assert.equal(h.object().x, 623);
  h.scene.drag = { id: h.object().id };
  h.press('Escape');
  assert.equal(h.changes.at(-1), 'cancel');
  assert.equal(h.object().x, 623);
});
