import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWallSnapTargets, snapFurniturePosition } from './dist/src/furniture-snap.js';

const furniture = { id: 'cabinet', type: 'furniture', width: 600, depth: 400, rotation: 0 };
const wall = { id: 'wall', type: 'wall', name: '北墙', x: 0, y: 0, width: 4000, depth: 200, rotation: 0 };
const targets = buildWallSnapTargets({ objects: [wall] });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const snap = (position, options = {}, list = targets, object = furniture) => snapFurniturePosition(object, position, list, { millimetresPerPixel: 5, ...options });

test('free dragging uses a 50 mm floor grid; disabling snapping clears a held wall and uses 1 mm', () => {
  const grid = snap({ x: 128, y: -777 });
  assert.deepEqual([grid.x, grid.y], [150, -800]);
  assert.deepEqual(grid.state.targetIds, []);
  const contact = snap({ x: 123, y: -340 });
  const free = snap({ x: 127.8, y: -342.2 }, { enabled: false, previous: contact.state });
  assert.deepEqual([free.x, free.y], [128, -342]);
  assert.deepEqual(free.state.targetIds, []);
  assert.equal(free.label, '');
  assert.deepEqual(free.guides, []);
});

test('wall thickness and furniture outer edge determine contact, while the tangent axis stays on grid', () => {
  const result = snap({ x: 123, y: -340 });
  assert.deepEqual([result.x, result.y], [100, -300]);
  assert.equal(result.state.targetIds.length, 1);
  assert.match(result.label, /北墙/);
  assert.equal(result.guides[0].a.y, -100);
  assert.equal(result.guides[0].b.y, -100);
  const opposite = snap({ x: 123, y: 340 });
  assert.deepEqual([opposite.x, opposite.y], [100, 300]);
});

test('acquisition scales with zoom and has a larger release radius to prevent flicker', () => {
  const initial = snap({ x: 123, y: -350 }); // 10 px gap
  assert.equal(initial.y, -300);
  const held = snap({ x: 123, y: -380 }, { previous: initial.state }); // 16 px
  assert.equal(held.y, -300);
  assert.equal(snap({ x: 123, y: -380 }).state.targetIds.length, 0);
  const released = snap({ x: 123, y: -395 }, { previous: held.state }); // 19 px
  assert.equal(released.y, -400);
  assert.equal(released.state.targetIds.length, 0);
  assert.equal(snap({ x: 123, y: -350 }, { millimetresPerPixel: 2 }).state.targetIds.length, 0);
  assert.equal(snap({ x: 123, y: -451 }, { millimetresPerPixel: 100 }).state.targetIds.length, 0);
  assert.equal(snap({ x: 123, y: -520 }, { millimetresPerPixel: 100, previous: initial.state }).y, -300);
  assert.equal(snap({ x: 123, y: -526 }, { millimetresPerPixel: 100, previous: initial.state }).state.targetIds.length, 0);
});

test('rotated furniture uses its true support corner and does not change its angle', () => {
  const object = { ...furniture, rotation: 45 };
  const radius = (300 + 200) / Math.sqrt(2);
  const result = snap({ x: 123, y: -(100 + radius) - 25 }, {}, targets, object);
  near(result.y, -(100 + radius));
  assert.equal(result.x, 100);
  assert.equal(object.rotation, 45);
  assert.equal(result.state.targetIds.length, 1);
});

test('a rotated wall face retains exact contact rather than rounding the result off the face', () => {
  const angle = Math.PI / 6, n = { x: Math.sin(angle), y: -Math.cos(angle) };
  const t = { x: Math.cos(angle), y: Math.sin(angle) };
  const list = buildWallSnapTargets({ objects: [{ ...wall, rotation: 30 }] });
  const raw = { x: t.x * 123 + n.x * 330, y: t.y * 123 + n.y * 330 };
  const result = snap(raw, {}, list, { ...furniture, rotation: 30 });
  near(result.x * n.x + result.y * n.y, 300);
  assert.equal(result.state.targetIds.length, 1);
});

test('door and window openings remove wall targets across their gaps but retain jamb faces', () => {
  for (const type of ['door', 'window']) {
    const opening = { id: 'opening', type, wallId: 'wall', offset: 2000, width: 1000 };
    const list = buildWallSnapTargets({ objects: [wall, opening] });
    assert.equal(list.length, 8);
    assert.equal(snap({ x: 0, y: -340 }, {}, list).state.targetIds.length, 0);
    assert.equal(snap({ x: 1000, y: -340 }, {}, list).y, -300);
    const jamb = snap({ x: -175, y: 0 }, {}, list, { ...furniture, depth: 80 });
    assert.equal(jamb.x, -200);
    assert.equal(jamb.state.targetIds.length, 1);
  }
});

test('hidden walls and openings are ignored while locked walls remain snap targets', () => {
  assert.deepEqual(buildWallSnapTargets({ objects: [{ ...wall, visible: false }] }), []);
  const list = buildWallSnapTargets({ objects: [{ ...wall, locked: true }, { type: 'door', wallId: 'wall', offset: 2000, width: 1000, visible: false }] });
  assert.equal(snap({ x: 0, y: -340 }, {}, list).y, -300);
});

test('finite wall segments cannot attract furniture from far beyond their ends', () => {
  const result = snap({ x: 3000, y: -340 });
  assert.equal(result.state.targetIds.length, 0);
  assert.deepEqual([result.x, result.y], [3000, -350]);
});

test('diagonal furniture cannot snap when only a distant part projects onto the wall segment', () => {
  const list = [{ id: 'short', wallId: 'short', label: '短墙', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, normal: { x: 0, y: -1 } }];
  const object = { ...furniture, width: 2000, depth: 100, rotation: 45 };
  const radius = 1050 / Math.sqrt(2);
  // The full OBB projects across x=0..100 but its contacting tip is x=-671.75.
  const result = snap({ x: 0, y: -radius - 20 }, {}, list, object);
  assert.equal(result.state.targetIds.length, 0);
});

test('two independent wall faces can capture a corner simultaneously', () => {
  const list = buildWallSnapTargets({ objects: [
    { ...wall, x: 1000, width: 2000 },
    { ...wall, id: 'west', name: '西墙', x: 0, y: -1000, width: 2000, rotation: 90 },
  ] });
  const result = snap({ x: 430, y: -340 }, {}, list);
  near(result.x, 400);
  near(result.y, -300);
  assert.equal(result.state.targetIds.length, 2);
  assert.equal(result.guides.length, 2);
});

test('horizontal mirroring preserves distances, openings, wall normals and the resulting placement', () => {
  const sourceWall = { ...wall, x: 1000, y: 800, rotation: 30 };
  const object = { ...furniture, rotation: 30 };
  const angle = Math.PI / 6;
  const raw = { x: sourceWall.x + 123 * Math.cos(angle) + 330 * Math.sin(angle), y: sourceWall.y + 123 * Math.sin(angle) - 330 * Math.cos(angle) };
  const first = snap(raw, {}, buildWallSnapTargets({ objects: [sourceWall] }), object);
  const reflectedWall = { ...sourceWall, x: -sourceWall.x, rotation: 150, mirrorY: true };
  const second = snap({ x: -raw.x, y: raw.y }, {}, buildWallSnapTargets({ objects: [reflectedWall] }), { ...object, rotation: 150, mirrorY: true });
  near(second.x, -first.x);
  near(second.y, first.y);
  assert.deepEqual(second.state, first.state);
});

test('held targets have priority over nearby parallel faces until released, without mutating inputs', () => {
  const list = [
    { id: 'a', label: '墙 A', a: { x: -2000, y: -100 }, b: { x: 2000, y: -100 }, normal: { x: 0, y: -1 } },
    { id: 'b', label: '墙 B', a: { x: -2000, y: -110 }, b: { x: 2000, y: -110 }, normal: { x: 0, y: -1 } },
  ];
  const raw = { x: 123, y: -309 }, previous = { targetIds: ['a'] };
  const before = JSON.stringify({ object: furniture, raw, previous, list });
  const result = snap(raw, { previous }, list);
  assert.equal(result.y, -300);
  assert.deepEqual(result.state.targetIds, ['a']);
  assert.equal(JSON.stringify({ object: furniture, raw, previous, list }), before);
});

test('a face on the other side of a wall cannot pull the furniture through that wall', () => {
  const list = [{ id: 'face', label: '墙', a: { x: -1000, y: 0 }, b: { x: 1000, y: 0 }, normal: { x: 0, y: -1 } }];
  const result = snap({ x: 0, y: 10 }, { millimetresPerPixel: 100 }, list, { ...furniture, depth: 40 });
  assert.equal(result.state.targetIds.length, 0);
});
