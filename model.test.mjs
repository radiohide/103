import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlan, createObject, validatePlan, updateObject, removeObject, duplicateObject, wallEndpoints, mirrorPlanHorizontally, applyPublishedPlanEdits } from './dist/src/model.js';

// Existing geometry fixtures use the source drawing orientation.
function sourceOrientationPlan() {
  return mirrorPlanHorizontally(createInitialPlan());
}


test('the seed preserves annotated bounds and gives all objects unique editable names', () => {
  const plan = sourceOrientationPlan();
  assert.equal(plan.objects.length, 86);
  assert.equal(new Set(plan.objects.map(o => o.id)).size, plan.objects.length);
  assert.ok(plan.objects.every(o => o.name && Number.isFinite(o.width)));
  assert.equal(plan.objects.filter(o => o.kind === 'chair').length, 6);
  assert.equal(plan.objects.find(o => o.id === 'wall-south').width, 9800);
  assert.equal(plan.objects.find(o => o.id === 'wall-west').width, 10300);
  plan.objects[0].name = 'changed';
  assert.notEqual(sourceOrientationPlan().objects[0].name, 'changed');
});

test('invalid imports are rejected before rendering', () => {
  for (const patch of [{ width: -1 }, { x: Infinity }, { name: '' }, { type: 'script' }]) {
    const plan = sourceOrientationPlan();
    Object.assign(plan.objects[0], patch);
    assert.throws(() => validatePlan(plan));
  }
  const duplicate = sourceOrientationPlan();
  duplicate.objects[1].id = duplicate.objects[0].id;
  assert.throws(() => validatePlan(duplicate), /重复/);
  const dangling = sourceOrientationPlan();
  dangling.objects.find(o => o.type === 'door').wallId = 'missing';
  assert.throws(() => validatePlan(dangling), /不存在/);
});

test('wall translation carries attached doors and moves joined neighbour endpoints', () => {
  const plan = sourceOrientationPlan();
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
  const plan = sourceOrientationPlan();
  const wall = plan.objects.find(o => o.id === 'wall-east-step');
  const oldStart = wallEndpoints(wall).a;
  updateObject(plan, wall.id, { width: wall.width + 400 }, { anchor: 'start', linked: false });
  assert.deepEqual(wallEndpoints(plan.objects.find(o => o.id === wall.id)).a, oldStart);
});

test('too-short walls and overlapping openings fail atomically', () => {
  const plan = sourceOrientationPlan();
  const serialized = JSON.stringify(plan);
  assert.throws(() => updateObject(plan, 'wall-north', { width: 900 }), /长度不足|重叠/);
  assert.equal(JSON.stringify(plan), serialized);
  assert.throws(() => updateObject(plan, 'window-kitchen', { offset: 2000 }), /重叠/);
  assert.equal(JSON.stringify(plan), serialized);
});

test('attached opening moves project onto their wall and free rotation requires detach', () => {
  const plan = sourceOrientationPlan();
  updateObject(plan, 'door-entry', { x: 8600, y: 3500 });
  assert.equal(plan.objects.find(o => o.id === 'door-entry').x, 8400);
  assert.equal(plan.objects.find(o => o.id === 'door-entry').y, 3500);
  assert.throws(() => updateObject(plan, 'door-entry', { rotation: 35 }), /自由旋转/);
  updateObject(plan, 'door-entry', { wallId: null, rotation: 35 });
  assert.equal(plan.objects.find(o => o.id === 'door-entry').rotation, 35);
  assert.equal(plan.objects.find(o => o.id === 'door-entry').wallId, undefined);
});

test('duplicate furniture is independent; deleting a wall also removes its openings', () => {
  const plan = sourceOrientationPlan();
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
  const plan = sourceOrientationPlan();
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
  const plan = sourceOrientationPlan();
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
  const plan = sourceOrientationPlan();
  updateObject(plan, 'wall-left-kitchen', { locked: true });
  const snapshot = JSON.stringify(plan);
  assert.throws(() => updateObject(plan, 'wall-bedroom1-door', { x: 3500 }), /卧室一与厨房隔墙.*解锁/);
  assert.equal(JSON.stringify(plan), snapshot);
  updateObject(plan, 'wall-bedroom1-door', { x: 3400, name: '卧室一门墙' });
  assert.equal(plan.objects.find(o => o.id === 'wall-bedroom1-door').name, '卧室一门墙');
});

test('locked attached openings prevent wall changes that move or thicken them', () => {
  const plan = sourceOrientationPlan();
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
    const plan = sourceOrientationPlan();
    plan.rooms = [invalidRoom];
    assert.throws(() => validatePlan(plan), error => error instanceof Error && !(error instanceof TypeError) && /房间分区数据格式不正确/.test(error.message));
  }
});

const near = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} ≈ ${expected}`);
const byId = (plan, id) => plan.objects.find(object => object.id === id);
function localPoint(object, x, y) {
  const angle = object.rotation * Math.PI / 180;
  const depth = y * (object.mirrorY ? -1 : 1);
  return { x: object.x + Math.cos(angle) * x - Math.sin(angle) * depth, y: object.y + Math.sin(angle) * x + Math.cos(angle) * depth };
}

test('published seed is mirrored and does not reapply the published edit', () => {
  const plan = createInitialPlan();
  near(byId(plan, 'door-entry').x, 1400);
  near(byId(plan, 'bedroom1-bed').x, 8590);
  const door = byId(plan, 'door-bath2');
  assert.equal(door.kind, 'sliding');
  near(door.x, 7950);
  near(door.y, 5600);
  assert.equal(door.offset, 1850);
  const saved = JSON.stringify(plan);
  assert.equal(applyPublishedPlanEdits(plan), false);
  assert.equal(JSON.stringify(plan), saved);
});

test('whole-plan mirror reflects walls, attached openings and asymmetric local geometry', () => {
  const plan = sourceOrientationPlan();
  updateObject(plan, 'study-chair-north', { rotation: 37, locked: true, visible: false });
  const before = structuredClone(plan);
  mirrorPlanHorizontally(plan);
  assert.equal(plan.objects.length, before.objects.length);
  for (const object of plan.objects) {
    const original = byId(before, object.id);
    near(object.x, 9800 - original.x, object.id);
    near(object.y, original.y, object.id);
    for (const field of ['name', 'width', 'depth', 'height', 'locked', 'visible', 'wallId', 'offset', 'hinge', 'swing']) assert.equal(object[field], original[field], `${object.id}.${field}`);
    assert.equal(object.mirrorY, !original.mirrorY);
    for (const [x, y] of [[-object.width / 2, -object.depth / 2], [object.width * .37, object.depth * .24]]) {
      const source = localPoint(original, x, y), reflected = localPoint(object, x, y);
      near(reflected.x, 9800 - source.x, `${object.id} local X`);
      near(reflected.y, source.y, `${object.id} local Y`);
    }
    if (object.type === 'wall') {
      const source = wallEndpoints(original), reflected = wallEndpoints(object);
      for (const end of ['a', 'b']) {
        near(reflected[end].x, 9800 - source[end].x);
        near(reflected[end].y, source[end].y);
      }
    }
  }
  for (const room of plan.rooms) {
    const original = before.rooms.find(value => value.id === room.id);
    near(room.x, 9800 - original.x);
    assert.deepEqual({ ...room, x: original.x }, original);
  }
  assert.deepEqual(plan.meta.referenceTransform, { scaleX: -1, offsetX: 9800 });
  assert.deepEqual(validatePlan(JSON.parse(JSON.stringify(plan))), plan);
  mirrorPlanHorizontally(plan);
  for (const object of plan.objects) {
    const original = byId(before, object.id);
    for (const field of ['x', 'y', 'rotation']) near(object[field], original[field]);
    assert.deepEqual({ ...object, x: original.x, y: original.y, rotation: original.rotation }, original);
  }
  assert.deepEqual(plan.rooms, before.rooms);
  assert.deepEqual(plan.meta, before.meta);
});

test('published mirror migrates saved edits once, including prior bathroom and balcony corrections', () => {
  const plan = sourceOrientationPlan();
  plan.meta.appliedEdits = [];
  updateObject(plan, 'living-coffee', { name: '我的茶几', x: 5100, width: 820 });
  updateObject(plan, 'door-bath2', { kind: 'single', offset: 2850, name: '卫生间二房门' });
  plan.objects.push({ ...createObject('wall'), id: 'wall-bedroom2-balcony', x: 1700, y: 8800, width: 3400 });
  assert.equal(applyPublishedPlanEdits(plan), true);
  const coffee = byId(plan, 'living-coffee');
  assert.equal(coffee.name, '我的茶几');
  assert.equal(coffee.width, 820);
  near(coffee.x, 4700);
  assert.equal(byId(plan, 'wall-bedroom2-balcony'), undefined);
  const door = byId(plan, 'door-bath2');
  assert.equal(door.kind, 'sliding');
  assert.equal(door.name, '卫生间二推拉门');
  near(door.x, 7950);
  assert.equal(door.offset, 1850);
  const saved = JSON.stringify(plan);
  assert.equal(applyPublishedPlanEdits(plan), false);
  assert.equal(JSON.stringify(plan), saved);
  // Pressing the mirror button again intentionally reverses it, and reload keeps it.
  mirrorPlanHorizontally(plan);
  near(byId(plan, 'door-bath2').x, 1850);
  assert.equal(applyPublishedPlanEdits(plan), false);
});

test('mirror uses rotated object bounds without walls and handles room-only/empty plans', () => {
  const furniture = { ...createObject('furniture', 'sofa'), x: -250, y: 600, rotation: 35 };
  const second = { ...createObject('furniture', 'chair'), x: 1200, y: 1000, rotation: 71 };
  const plan = validatePlan({ version: 1, unit: 'mm', objects: [furniture, second], rooms: [], meta: {} });
  const extents = plan.objects.flatMap(object => {
    const a = object.rotation * Math.PI / 180;
    const half = (Math.abs(Math.cos(a)) * object.width + Math.abs(Math.sin(a)) * object.depth) / 2;
    return [object.x - half, object.x + half];
  });
  const sum = Math.min(...extents) + Math.max(...extents);
  mirrorPlanHorizontally(plan);
  near(plan.objects[0].x, sum - furniture.x);
  const rooms = validatePlan({ version: 1, unit: 'mm', objects: [], rooms: [{ id: 'a', name: 'A', x: 100, y: 0, width: 1000, depth: 1000 }, { id: 'b', name: 'B', x: 2000, y: 0, width: 400, depth: 500 }] });
  mirrorPlanHorizontally(rooms);
  near(rooms.rooms[0].x, 1700);
  near(rooms.rooms[1].x, -200);
  const empty = validatePlan({ version: 1, unit: 'mm', objects: [], rooms: [] });
  const saved = JSON.stringify(empty);
  mirrorPlanHorizontally(empty);
  assert.equal(JSON.stringify(empty), saved);
});

test('mirror validates atomically and local reflection remains geometry when locked', () => {
  const plan = sourceOrientationPlan();
  updateObject(plan, 'living-coffee', { x: -99000, locked: true });
  const saved = JSON.stringify(plan);
  assert.throws(() => mirrorPlanHorizontally(plan), /X 坐标/);
  assert.equal(JSON.stringify(plan), saved);
  assert.throws(() => updateObject(plan, 'living-coffee', { mirrorY: true }), /已锁定/);
  assert.equal(JSON.stringify(plan), saved);
  plan.meta.referenceTransform = { scaleX: 0, offsetX: 0 };
  assert.throws(() => validatePlan(plan), /底图镜像/);
});


test('north balcony partition removal migrates once without changing the mirrored layout or other edits', () => {
  const marker = 'remove-bedroom1-north-balcony-partition-2026-11-02';
  const plan = createInitialPlan();
  assert.ok(!plan.objects.some(o => ['wall-north-balcony', 'window-bedroom1'].includes(o.id)));
  plan.meta.appliedEdits = plan.meta.appliedEdits.filter(key => key !== marker);
  plan.objects.push({ ...createObject('wall'), id: 'wall-north-balcony', name: '卧室一与北阳台隔墙', x: 8100, y: 800, width: 3400, depth: 180, rotation: 180, mirrorY: true });
  plan.objects.push({ ...createObject('window'), id: 'window-bedroom1', name: '卧室一内窗', wallId: 'wall-north-balcony', offset: 1700, width: 2100, mirrorY: true });
  plan.objects.push({ ...createObject('door'), id: 'custom-north-balcony-door', name: '新增阳台门', wallId: 'wall-north-balcony', offset: 310, width: 400, mirrorY: true });
  updateObject(plan, 'bedroom1-bed', { name: '我的卧室床', width: 1680 });
  const expected = plan.objects.filter(o => !['wall-north-balcony', 'window-bedroom1', 'custom-north-balcony-door'].includes(o.id));
  const rooms = structuredClone(plan.rooms), reference = structuredClone(plan.meta.referenceTransform);
  assert.equal(applyPublishedPlanEdits(plan), true);
  assert.deepEqual(plan.objects, expected);
  assert.ok(byId(plan, 'window-north-balcony'), 'exterior glazing remains');
  assert.ok(byId(plan, 'door-bedroom1'), 'corridor bedroom door remains');
  assert.deepEqual(plan.rooms, rooms);
  assert.deepEqual(plan.meta.referenceTransform, reference);
  assert.ok(!plan.objects.some(o => o.wallId === 'wall-north-balcony'));
  const saved = JSON.stringify(plan);
  assert.equal(applyPublishedPlanEdits(plan), false);
  assert.equal(JSON.stringify(plan), saved);
  assert.deepEqual(validatePlan(plan), plan);
});

const sideboardMarker = 'add-dining-sideboard-2026-11-03';
function beforeSideboardPlan() {
  const plan = createInitialPlan();
  plan.objects = plan.objects.filter(o => o.id !== 'dining-sideboard');
  plan.meta.appliedEdits = plan.meta.appliedEdits.filter(key => key !== sideboardMarker);
  for (const object of plan.objects.filter(o => o.id === 'dining-table' || o.id.startsWith('dining-chair-'))) object.x += 250;
  return plan;
}

test('sideboard occupies the bathroom wall with balanced dining clearances', () => {
  const plan = createInitialPlan(), cabinet = byId(plan, 'dining-sideboard');
  assert.deepEqual([cabinet.width,cabinet.depth,cabinet.height], [1600,400,850]);
  assert.equal(cabinet.kind, 'sideboard');
  near(cabinet.x,6100); near(cabinet.y,4750);
  const front = localPoint(cabinet,0,cabinet.depth/2);
  near(front.x,5900); near(front.y,4750);
  near((6400 - 180/2) - (cabinet.x + cabinet.depth/2),10,'wall gap');
  near(front.x - (byId(plan,'dining-chair-west-2').x + 460/2),660,'cabinet to tucked chair');
  near(byId(plan,'dining-chair-east-2').x - 460/2 - (2700+180/2),670,'opposite wall to tucked chair');
  near(front.x - (byId(plan,'dining-table').x+850/2),1125,'cabinet to table');
  assert.ok(cabinet.y + cabinet.width/2 < 6200 - 950/2, 'cabinet ends before bedroom doorway');
  const added = createObject('furniture','sideboard');
  assert.equal(added.name,'新餐边柜');
  assert.deepEqual([added.width,added.depth,added.height],[1600,400,850]);
});

test('sideboard migration adds once, moves original dining set together and preserves other edits', () => {
  const plan=beforeSideboardPlan();
  byId(plan,'living-coffee').name='我的茶几';
  byId(plan,'dining-table').color='#123456';
  const other=plan.objects.filter(o=>!o.id.startsWith('dining-')).map(o=>structuredClone(o));
  assert.equal(applyPublishedPlanEdits(plan),true);
  near(byId(plan,'dining-table').x,4350);
  assert.equal(byId(plan,'dining-table').color,'#123456');
  assert.deepEqual(plan.objects.filter(o=>!o.id.startsWith('dining-')),other);
  const after=JSON.stringify(plan);
  assert.equal(applyPublishedPlanEdits(plan),false);assert.equal(JSON.stringify(plan),after);
  removeObject(plan,'dining-sideboard');
  assert.equal(applyPublishedPlanEdits(plan),false);
  assert.equal(byId(plan,'dining-sideboard'),undefined,'user deletion survives reload');
});

test('sideboard migration preserves user-adjusted or locked dining groups and unrelated plans', () => {
  for(const patch of [{x:5500},{rotation:35},{locked:true}]) {
    const plan=beforeSideboardPlan();Object.assign(byId(plan,'dining-chair-west-1'),patch);
    const before=structuredClone(plan.objects);
    assert.equal(applyPublishedPlanEdits(plan),true);
    assert.deepEqual(plan.objects.filter(o=>o.id!=='dining-sideboard'),before);
  }
  const plan=beforeSideboardPlan();plan.meta.source='other';
  const before=JSON.stringify(plan);assert.equal(applyPublishedPlanEdits(plan),false);assert.equal(JSON.stringify(plan),before);
});

test('sideboard migration follows an intentionally unmirrored plan and respects existing cabinet edits', () => {
  const plan=beforeSideboardPlan();mirrorPlanHorizontally(plan);
  assert.equal(applyPublishedPlanEdits(plan),true);
  near(byId(plan,'dining-sideboard').x,3700);near(byId(plan,'dining-table').x,5450);
  near(localPoint(byId(plan,'dining-sideboard'),0,200).x,3900);
  plan.meta.appliedEdits=plan.meta.appliedEdits.filter(key=>key!==sideboardMarker);
  byId(plan,'dining-sideboard').width=1200;
  const before=structuredClone(plan.objects);
  assert.equal(applyPublishedPlanEdits(plan),true);assert.deepEqual(plan.objects,before);
});
