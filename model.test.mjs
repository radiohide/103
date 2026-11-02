import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlan, createObject, validatePlan, updateObject, removeObject, duplicateObject, wallEndpoints } from './dist/src/model.js';

test('the seed preserves annotated bounds and gives all objects unique editable names', () => {
  const plan = createInitialPlan();
  assert.equal(plan.objects.length, 87);
  assert.equal(new Set(plan.objects.map(o => o.id)).size, plan.objects.length);
  assert.ok(plan.objects.every(o => o.name && Number.isFinite(o.width)));
  assert.equal(plan.objects.filter(o => o.kind === 'chair').length, 6);
  assert.equal(plan.objects.find(o => o.id === 'wall-south').width, 9800);
  assert.equal(plan.objects.find(o => o.id === 'wall-west').width, 10300);
  plan.objects[0].name = 'changed';
  assert.notEqual(createInitialPlan().objects[0].name, 'changed');
});

test('invalid imports are rejected before rendering', () => {
  for (const patch of [{ width: -1 }, { x: Infinity }, { name: '' }, { type: 'script' }]) {
    const plan = createInitialPlan();
    Object.assign(plan.objects[0], patch);
    assert.throws(() => validatePlan(plan));
  }
  const duplicate = createInitialPlan();
  duplicate.objects[1].id = duplicate.objects[0].id;
  assert.throws(() => validatePlan(duplicate), /重复/);
  const dangling = createInitialPlan();
  dangling.objects.find(o => o.type === 'door').wallId = 'missing';
  assert.throws(() => validatePlan(dangling), /不存在/);
});

test('wall translation carries attached doors and moves joined neighbour endpoints', () => {
  const plan = createInitialPlan();
  const id = 'wall-bedroom1-door';
  const before = plan.objects.find(o => o.id === id);
  const door = plan.objects.find(o => o.id === 'door-bedroom1');
  const oldDoorX = door.x;
  updateObject(plan, id, { x: before.x + 100 });
  const after = plan.objects.find(o => o.id === id);
  const joined = plan.objects.find(o => o.id === 'wall-left-kitchen');
  assert.equal(plan.objects.find(o => o.id === 'door-bedroom1').x, oldDoorX + 100);
  assert.ok(Math.abs(wallEndpoints(joined).b.x - wallEndpoints(after).a.x) < 0.001);
});

test('resizing a wall around a fixed start preserves the start point', () => {
  const plan = createInitialPlan();
  const wall = plan.objects.find(o => o.id === 'wall-east-step');
  const oldStart = wallEndpoints(wall).a;
  updateObject(plan, wall.id, { width: wall.width + 400 }, { anchor: 'start', linked: false });
  assert.deepEqual(wallEndpoints(plan.objects.find(o => o.id === wall.id)).a, oldStart);
});

test('too-short walls and overlapping openings fail atomically', () => {
  const plan = createInitialPlan();
  const serialized = JSON.stringify(plan);
  assert.throws(() => updateObject(plan, 'wall-north', { width: 900 }), /长度不足|重叠/);
  assert.equal(JSON.stringify(plan), serialized);
  assert.throws(() => updateObject(plan, 'window-kitchen', { offset: 2000 }), /重叠/);
  assert.equal(JSON.stringify(plan), serialized);
});

test('attached opening moves project onto their wall and free rotation requires detach', () => {
  const plan = createInitialPlan();
  updateObject(plan, 'door-entry', { x: 8600, y: 3500 });
  assert.equal(plan.objects.find(o => o.id === 'door-entry').x, 8400);
  assert.equal(plan.objects.find(o => o.id === 'door-entry').y, 3500);
  assert.throws(() => updateObject(plan, 'door-entry', { rotation: 35 }), /自由旋转/);
  updateObject(plan, 'door-entry', { wallId: null, rotation: 35 });
  assert.equal(plan.objects.find(o => o.id === 'door-entry').rotation, 35);
  assert.equal(plan.objects.find(o => o.id === 'door-entry').wallId, undefined);
});

test('duplicate furniture is independent; deleting a wall also removes its openings', () => {
  const plan = createInitialPlan();
  const old = plan.objects.find(o => o.id === 'dining-table');
  const copy = duplicateObject(plan, old.id);
  assert.notEqual(copy.id, old.id);
  assert.equal(copy.x, old.x + 300);
  updateObject(plan, copy.id, { width: 1300 });
  assert.equal(plan.objects.find(o => o.id === old.id).width, 850);
  const removed = removeObject(plan, 'wall-north');
  assert.equal(removed.length, 4);
  assert.ok(!plan.objects.some(o => o.wallId === 'wall-north'));
  validatePlan(plan);
});

test('new objects have valid dimensions and stable IDs', () => {
  const chair = createObject('furniture', 'chair');
  const other = createObject('furniture', 'chair');
  assert.notEqual(chair.id, other.id);
  validatePlan({ version: 1, unit: 'mm', title: 'test', objects: [chair, other], rooms: [] });
});

test('locked objects reject geometry changes atomically while allowing metadata and no-ops', () => {
  const plan = createInitialPlan();
  const id = 'dining-table';
  updateObject(plan, id, { locked: true });
  const original = plan.objects.find(o => o.id === id);
  const snapshot = JSON.stringify(plan);
  for (const field of ['x', 'y', 'width', 'depth', 'height', 'rotation']) {
    assert.throws(() => updateObject(plan, id, { [field]: original[field] + 50 }), /已锁定.*解锁/);
    assert.equal(JSON.stringify(plan), snapshot);
  }
  updateObject(plan, id, { name: '已命名餐桌', room: '新分区', color: '#112233', x: original.x, rotation: original.rotation + 360 });
  assert.equal(plan.objects.find(o => o.id === id).name, '已命名餐桌');
  assert.equal(plan.objects.find(o => o.id === id).locked, true);
  updateObject(plan, id, { locked: false });
  updateObject(plan, id, { x: original.x + 100 });
  assert.equal(plan.objects.find(o => o.id === id).x, original.x + 100);
});

test('locked openings cannot change attachment, offset, hinge, or swing', () => {
  const plan = createInitialPlan();
  updateObject(plan, 'door-entry', { locked: true });
  const snapshot = JSON.stringify(plan);
  for (const patch of [{ wallId: null }, { offset: 3500 }, { hinge: 'left' }, { swing: -1 }]) {
    assert.throws(() => updateObject(plan, 'door-entry', patch), /已锁定.*解锁/);
    assert.equal(JSON.stringify(plan), snapshot);
  }
  updateObject(plan, 'door-entry', { name: '锁定入户门', wallId: 'wall-east-upper', offset: 3350 });
  assert.equal(plan.objects.find(o => o.id === 'door-entry').name, '锁定入户门');
});

test('connected locked walls prevent an indirect transformation but not a no-op', () => {
  const plan = createInitialPlan();
  updateObject(plan, 'wall-left-kitchen', { locked: true });
  const snapshot = JSON.stringify(plan);
  assert.throws(() => updateObject(plan, 'wall-bedroom1-door', { x: 3500 }), /卧室一与厨房隔墙.*解锁/);
  assert.equal(JSON.stringify(plan), snapshot);
  updateObject(plan, 'wall-bedroom1-door', { x: 3400, name: '卧室一门墙' });
  assert.equal(plan.objects.find(o => o.id === 'wall-bedroom1-door').name, '卧室一门墙');
});

test('locked attached openings prevent wall changes that move or thicken them', () => {
  const plan = createInitialPlan();
  updateObject(plan, 'door-entry', { locked: true });
  const snapshot = JSON.stringify(plan);
  assert.throws(() => updateObject(plan, 'wall-east-upper', { x: 8500 }, { linked: false }), /入户门.*解锁/);
  assert.equal(JSON.stringify(plan), snapshot);
  assert.throws(() => updateObject(plan, 'wall-east-upper', { depth: 280 }), /入户门.*解锁/);
  assert.equal(JSON.stringify(plan), snapshot);
  // Lengthening the fixed end leaves the locked opening in the same world position.
  const wall = plan.objects.find(o => o.id === 'wall-east-upper');
  updateObject(plan, wall.id, { width: wall.width + 100 }, { anchor: 'start', linked: false });
  assert.equal(plan.objects.find(o => o.id === 'door-entry').y, 3350);
});

test('malformed room entries return a useful validation error instead of TypeError', () => {
  for (const invalidRoom of [null, 42, [], 'room']) {
    const plan = createInitialPlan();
    plan.rooms = [invalidRoom];
    assert.throws(() => validatePlan(plan), error => error instanceof Error && !(error instanceof TypeError) && /房间分区数据格式不正确/.test(error.message));
  }
});
