import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlan, createObject, validatePlan, updateObject, removeObject, copyFurniture, pasteFurniture } from './dist/src/model.js';

test('copy captures independent normalized furniture without changing the plan', () => {
  const plan = createInitialPlan();
  updateObject(plan, 'living-sofa', { locked: true, visible: false, note: '保留的家具说明' });
  const before = JSON.stringify(plan);
  const original = plan.objects.find(object => object.id === 'living-sofa');
  const clipboard = copyFurniture(plan, original.id);
  assert.equal(JSON.stringify(plan), before);
  assert.deepEqual(clipboard, original);
  assert.notStrictEqual(clipboard, original);
  original.name = '后来改名';
  original.width = 2400;
  assert.notEqual(clipboard.name, original.name);
  assert.equal(clipboard.width, 1800);
  clipboard.note = '只改剪贴板';
  assert.equal(original.note, '保留的家具说明');
});

test('paste keeps the copied geometry after the source is edited or deleted', () => {
  const plan = createInitialPlan();
  updateObject(plan, 'living-sofa', { locked: true, visible: false, note: '软包沙发', estimated: false });
  const clipboard = copyFurniture(plan, 'living-sofa');
  const snapshot = JSON.stringify(clipboard);
  removeObject(plan, 'living-sofa');
  const before = structuredClone(plan.objects);
  const pasted = pasteFurniture(plan, clipboard);
  assert.notEqual(pasted.id, clipboard.id);
  assert.equal(pasted.name, clipboard.name + ' 副本');
  assert.equal(pasted.x, clipboard.x + 300);
  assert.equal(pasted.y, clipboard.y + 300);
  for (const field of ['kind', 'room', 'width', 'depth', 'height', 'rotation', 'mirrorY', 'color', 'note', 'estimated']) {
    assert.equal(pasted[field], clipboard[field], field);
  }
  assert.equal(pasted.locked, false);
  assert.equal(pasted.visible, true);
  assert.equal(JSON.stringify(clipboard), snapshot);
  assert.deepEqual(plan.objects.slice(0, -1), before);
  updateObject(plan, pasted.id, { width: 1950 });
  assert.equal(clipboard.width, 1800);
});

test('repeated paste gets unique identities and names with offsets from the copied position', () => {
  const plan = createInitialPlan();
  const clipboard = copyFurniture(plan, 'bedroom1-bed');
  const pasted = [300, 600, 900].map(offset => pasteFurniture(plan, clipboard, { offset }));
  assert.deepEqual(pasted.map(object => object.name), ['卧室一双人床 副本', '卧室一双人床 副本 2', '卧室一双人床 副本 3']);
  assert.equal(new Set([...pasted.map(object => object.id), clipboard.id]).size, 4);
  pasted.forEach((object, index) => {
    assert.equal(object.x, clipboard.x + 300 * (index + 1));
    assert.equal(object.y, clipboard.y + 300 * (index + 1));
    assert.equal(object.rotation, clipboard.rotation);
    assert.equal(object.mirrorY, true);
  });
  assert.deepEqual(validatePlan(plan), plan);
});

test('non-furniture and malformed clipboard or offset fail without changing the plan', () => {
  const plan = createInitialPlan();
  const before = JSON.stringify(plan);
  for (const id of ['wall-north', 'door-bedroom1', 'window-north-balcony', 'missing']) {
    assert.throws(() => copyFurniture(plan, id), /家具/);
  }
  const source = copyFurniture(plan, 'living-sofa');
  for (const snapshot of [null, {}, createObject('wall'), createObject('door'), { ...source, width: -1 }, { ...source, x: NaN }]) {
    assert.throws(() => pasteFurniture(plan, snapshot));
    assert.equal(JSON.stringify(plan), before);
  }
  for (const offset of [NaN, Infinity, '300', 100000]) {
    assert.throws(() => pasteFurniture(plan, source, { offset }));
    assert.equal(JSON.stringify(plan), before);
  }
});

test('long names remain valid, distinct, and do not contain split emoji', () => {
  const object = { ...createObject('furniture', 'sofa'), name: '🛋'.repeat(100) };
  const plan = validatePlan({ version: 1, unit: 'mm', objects: [object], rooms: [] });
  const clipboard = copyFurniture(plan, object.id);
  const first = pasteFurniture(plan, clipboard);
  const second = pasteFurniture(plan, clipboard, { offset: 600 });
  for (const item of [first, second]) {
    assert.ok(item.name.length <= 200);
    assert.equal(item.name.isWellFormed(), true);
  }
  assert.notEqual(first.name, second.name);
  assert.match(first.name, / 副本$/);
  assert.match(second.name, / 副本 2$/);
});

test('a full plan rejects another paste atomically', () => {
  const furniture = createObject('furniture', 'chair');
  const plan = validatePlan({ version: 1, unit: 'mm', objects: Array.from({ length: 2000 }, (_, index) => ({ ...furniture, id: `chair-${index}`, name: `餐椅 ${index}` })), rooms: [] });
  const clipboard = copyFurniture(plan, 'chair-0');
  const before = JSON.stringify(plan);
  assert.throws(() => pasteFurniture(plan, clipboard), /2000/);
  assert.equal(JSON.stringify(plan), before);
});
