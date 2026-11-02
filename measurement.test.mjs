import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeasurementTargets, measurementMetrics, snapMeasurementPoint } from './dist/src/measurement.js';
import { createInitialPlan, mirrorPlanHorizontally } from './dist/src/model.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const wall = { id: 'wall', name: '测试墙', type: 'wall', x: 2000, y: 1000, width: 4000, depth: 200, rotation: 0, visible: true };

test('measurement uses exact plan coordinates for diagonal and horizontal/vertical distances', () => {
  assert.deepEqual(measurementMetrics({ x: 10, y: 20 }, { x: 3010, y: -3980 }), { distance: 5000, dx: 3000, dy: 4000 });
  near(measurementMetrics({ x: .1, y: .2 }, { x: .4, y: .6 }).distance, .5);
  assert.deepEqual(measurementMetrics(null, null), { distance: 0, dx: 0, dy: 0 });
});

test('target footprints follow rotation and reflection and omit hidden objects', () => {
  const source = { objects: [
    { ...wall, rotation: 90, mirrorY: true },
    { id: 'hidden', type: 'furniture', name: '隐藏家具', x: 0, y: 0, width: 1000, depth: 1000, visible: false },
  ] };
  const before = JSON.stringify(source), targets = buildMeasurementTargets(source);
  assert.equal(targets.points.length, 6);
  assert.equal(targets.segments.length, 4);
  near(targets.points[0].x, 1900); near(targets.points[0].y, -1000);
  assert.ok(targets.points.some(point => point.label.includes('中心线端点')));
  assert.ok(!targets.points.some(point => point.label.includes('隐藏家具')));
  assert.equal(JSON.stringify(source), before);
});

test('wall opening targets expose jamb faces and do not bridge the missing wall edge', () => {
  const door = { id: 'door', type: 'door', name: '测试门', x: 2000, y: 1000, width: 1000, depth: 200, rotation: 0, wallId: wall.id, offset: 2000 };
  const plan = { objects: [wall, door] };
  const targets = buildMeasurementTargets(plan);
  const wallEdges = targets.segments.filter(segment => segment.label.includes('测试墙'));
  assert.equal(wallEdges.length, 8);
  for (const x of [1500, 2500]) {
    assert.ok(wallEdges.some(segment => segment.a.x === x && segment.b.x === x && segment.a.y !== segment.b.y));
  }
  assert.ok(!wallEdges.some(segment => segment.a.y === 900 && segment.b.y === 900 && Math.min(segment.a.x, segment.b.x) < 2000 && Math.max(segment.a.x, segment.b.x) > 2000));
  door.visible = false;
  assert.equal(buildMeasurementTargets(plan).segments.length, 4);
});

test('snapping prioritizes corners, falls back to edge projection and respects tolerance or Alt', () => {
  const targets = { points: [{ x: 0, y: 0, label: '角点' }], segments: [{ a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, label: '边缘' }] };
  assert.deepEqual(snapMeasurementPoint({ x: 8, y: 6 }, targets, 12), { x: 0, y: 0, snapLabel: '角点' });
  assert.deepEqual(snapMeasurementPoint({ x: 500.25, y: 6 }, targets, 12), { x: 500.25, y: 0, snapLabel: '边缘' });
  assert.deepEqual(snapMeasurementPoint({ x: 500.25, y: 20.75 }, targets, 12), { x: 500.25, y: 20.75, snapLabel: '' });
  assert.deepEqual(snapMeasurementPoint({ x: 8.25, y: 6.75 }, targets, 12, { enabled: false }), { x: 8.25, y: 6.75, snapLabel: '' });
});

test('Shift maintains an exact axis while snapping to edge intersections', () => {
  const targets = { points: [{ x: 98, y: 14, label: '偏离轴线的角点' }], segments: [{ a: { x: 100, y: -50 }, b: { x: 100, y: 50 }, label: '竖向墙边' }] };
  const options = { origin: { x: 0, y: 10 }, axisLock: true };
  assert.deepEqual(snapMeasurementPoint({ x: 98, y: 12 }, targets, 10, options), { x: 100, y: 10, snapLabel: '竖向墙边' });
  assert.deepEqual(snapMeasurementPoint({ x: 98.25, y: 12.75 }, targets, 10, { ...options, enabled: false }), { x: 98.25, y: 10, snapLabel: '' });
  assert.deepEqual(snapMeasurementPoint({ x: 4, y: 300 }, targets, 10, options), { x: 0, y: 300, snapLabel: '' });
});

test('mirrored target geometry retains all distances and reflects actual corner positions', () => {
  const plan = createInitialPlan();
  const before = buildMeasurementTargets(plan);
  const pointA = before.points.find(point => point.label.startsWith('卧室一双人床'));
  const pointB = before.points.find(point => point.label.startsWith('餐厅六人餐桌'));
  const metrics = measurementMetrics(pointA, pointB);
  mirrorPlanHorizontally(plan);
  const after = buildMeasurementTargets(plan);
  const reflectedA = after.points.find(point => point.label === pointA.label);
  const reflectedB = after.points.find(point => point.label === pointB.label);
  near(reflectedA.x, 9800 - pointA.x); near(reflectedA.y, pointA.y);
  near(reflectedB.x, 9800 - pointB.x); near(reflectedB.y, pointB.y);
  const nextMetrics = measurementMetrics(reflectedA, reflectedB);
  for (const field of ['distance', 'dx', 'dy']) near(nextMetrics[field], metrics[field]);
});
