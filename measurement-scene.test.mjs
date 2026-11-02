import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanScene } from './dist/src/scene.js';

function measuringScene() {
  const scene = Object.create(PlanScene.prototype);
  const events = [];
  Object.assign(scene, {
    view: '2d', tool: 'measure', selected: 'table',
    options: { snap: false }, plan: { objects: [{ id: 'table', x: 100, y: 200 }] },
    measurement: { start: null, end: null, complete: false, snapLabel: '' },
    measurePointers: new Set(), measureTargets: { points: [], segments: [] },
    controls: { enabled: true },
    renderer: { domElement: { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 1000 }) } },
    height: 1000, topCamera: { top: 5, bottom: -5, zoom: 1 },
    groundPoint(e) { return new THREE.Vector3(e.clientX / 100, 0, e.clientY / 100); },
    drawMeasurement() {}, drawSelection() {},
    hit() { throw new Error('Measuring must not hit/select an object'); },
    callbacks: {
      onSelect() { throw new Error('Measuring must not change the selection'); },
      onTransform() { throw new Error('Measuring must not edit an object'); },
      onMeasurementChange(state) { events.push(state); },
    },
  });
  return { scene, events };
}

const pointer = (x, y, extra = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 0, type: 'pointerup', ...extra });
function tap(scene, x, y, extra) {
  scene.pointerDown(pointer(x, y, { ...extra, type: 'pointerdown' }));
  scene.pointerUp(pointer(x, y, extra));
}

test('two clicks measure a diagonal without selecting or moving objects; a third click starts anew', () => {
  const { scene, events } = measuringScene();
  const plan = JSON.stringify(scene.plan);
  tap(scene, 100, 100);
  assert.deepEqual(scene.measurement.start, { x: 1000, y: 1000 });
  assert.equal(scene.measurement.end, null);
  scene.pointerMove(pointer(400, 500));
  assert.deepEqual(scene.measurement.end, { x: 4000, y: 5000 });
  assert.equal(scene.measurement.complete, false);
  tap(scene, 400, 500);
  assert.equal(scene.measurement.complete, true);
  const result = JSON.stringify(scene.measurement);
  scene.pointerMove(pointer(600, 700));
  assert.equal(JSON.stringify(scene.measurement), result, 'a completed measure is frozen');
  assert.equal(JSON.stringify(scene.plan), plan);
  assert.equal(scene.selected, 'table');
  assert.equal(events.at(-1).complete, true);
  events.at(-1).end.x = -1;
  assert.equal(scene.measurement.end.x, 4000, 'callback snapshots cannot corrupt measurement state');
  tap(scene, 250, 350);
  assert.deepEqual(scene.measurement.start, { x: 2500, y: 3500 });
  assert.equal(scene.measurement.end, null);
  assert.equal(scene.measurement.complete, false);
});

test('drag, pan, pointer cancellation, outside release and multi-touch never place a point', () => {
  const { scene } = measuringScene();
  scene.pointerDown(pointer(100, 100));
  scene.pointerMove(pointer(200, 200, { buttons: 1 }));
  scene.pointerUp(pointer(200, 200));
  assert.equal(scene.measurement.start, null);
  tap(scene, 100, 100, { button: 2 });
  assert.equal(scene.measurement.start, null);
  scene.pointerDown(pointer(100, 100));
  scene.pointerDown(pointer(100, 100, { button: 2, buttons: 3 }));
  scene.pointerUp(pointer(100, 100, { button: 2, buttons: 1 }));
  scene.pointerUp(pointer(100, 100));
  assert.equal(scene.measurement.start, null, 'a right-button chord cancels the pending left-button click');
  scene.pointerDown(pointer(100, 100));
  scene.pointerUp(pointer(100, 100, { type: 'pointercancel' }));
  assert.equal(scene.measurement.start, null);
  scene.pointerDown(pointer(999, 500));
  scene.pointerUp(pointer(1001, 500));
  assert.equal(scene.measurement.start, null);
  scene.pointerDown(pointer(100, 100, { pointerType: 'touch' }));
  scene.pointerDown(pointer(200, 200, { pointerId: 2, pointerType: 'touch' }));
  scene.pointerUp(pointer(200, 200, { pointerId: 2, pointerType: 'touch' }));
  scene.pointerUp(pointer(100, 100, { pointerType: 'touch' }));
  assert.equal(scene.measurement.start, null);
  tap(scene, 100, 100, { pointerType: 'touch' });
  assert.deepEqual(scene.measurement.start, { x: 1000, y: 1000 }, 'single-finger tap works after a pinch');
});

test('point picking uses screen-scaled snapping and modifier keys without grid rounding', () => {
  const { scene } = measuringScene();
  scene.options.snap = true;
  scene.measureTargets.points.push({ x: 1000, y: 1000, label: '墙角' });
  assert.deepEqual(scene.measurementPoint(pointer(105, 105)), { x: 1000, y: 1000, snapLabel: '墙角' });
  assert.deepEqual(scene.measurementPoint(pointer(105.13, 105.27, { altKey: true })), { x: 1051.3, y: 1052.7, snapLabel: '' });
  scene.topCamera.zoom = 10;
  assert.deepEqual(scene.measurementPoint(pointer(105, 105)), { x: 1050, y: 1050, snapLabel: '' }, 'zoom narrows the tolerance in millimetres');
  scene.measurement.start = { x: 1000, y: 1000 };
  assert.equal(scene.measurementPoint(pointer(400, 120, { shiftKey: true, altKey: true })).y, 1000);
});

test('clear and leaving the tool remove measurement state while restoring normal editing cursor', () => {
  const { scene, events } = measuringScene();
  tap(scene, 100, 100);
  tap(scene, 200, 200);
  scene.clearMeasurement();
  assert.deepEqual(scene.measurement, { start: null, end: null, complete: false, snapLabel: '' });
  tap(scene, 100, 100);
  scene.setTool('move');
  assert.equal(scene.measurement.start, null);
  assert.equal(scene.tool, 'move');
  assert.equal(scene.renderer.domElement.style.cursor, '');
  assert.equal(events.at(-1).start, null);
  scene.setTool('measure');
  assert.equal(scene.renderer.domElement.style.cursor, 'crosshair');
});

test('measurement geometry and labels remain a separate overlay above model surfaces', () => {
  const { scene } = measuringScene();
  scene.measurementGroup = new THREE.Group();
  scene.labels = [];
  scene.drawMeasurement = PlanScene.prototype.drawMeasurement;
  scene.addLabel = function (text, point, kind) {
    const label = { point, kind, el: { textContent: text, remove() {} } };
    this.labels.push(label);
    return label;
  };
  scene.measurement = { start: { x: 1000, y: 1000 }, end: { x: 4000, y: 5000 }, complete: true, snapLabel: '' };
  scene.drawMeasurement();
  assert.equal(scene.labels.find(label => label.el.textContent === '5,000 mm')?.kind, 'measurement');
  assert.ok(scene.measurementGroup.children.length >= 4, 'line, guides and endpoint markers exist');
  scene.measurementGroup.traverse(node => {
    if (node.material) assert.equal(node.material.depthTest, false);
  });
  scene.clearMeasurement();
  assert.equal(scene.measurementGroup.children.length, 0);
  assert.equal(scene.labels.length, 0);
});
