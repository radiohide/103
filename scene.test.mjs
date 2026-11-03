import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanScene } from './dist/src/scene.js';
import { createInitialPlan, mirrorPlanHorizontally } from './dist/src/model.js';

// Exercise the actual geometry builders without a DOM or WebGL context.
function viewport(view) {
  const scene = Object.create(PlanScene.prototype);
  Object.assign(scene, {
    view, world: new THREE.Group(), items: new Map(), labels: [],
    options: { labels: false, dimensions: false, reference: false, fullHeight: true },
    drawSelection() {},
  });
  return scene;
}

function vertices(group) {
  group.updateMatrixWorld(true);
  const points = [];
  const point = new THREE.Vector3();
  group.traverse(node => {
    const position = node.geometry?.attributes.position;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      points.push(point.x, point.y, point.z);
    }
  });
  return points;
}

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);

for (const view of ['2d', '3d']) {
  test(`${view}: mirror reflects every rendered object vertex, including door arcs and furniture details`, () => {
    const scene = viewport(view);
    const plan = createInitialPlan();
    scene.setPlan(plan);
    const before = new Map([...scene.items].map(([id, group]) => [id, vertices(group)]));
    const outline = scene.exteriorPolygon();
    mirrorPlanHorizontally(plan);
    scene.setPlan(plan);
    for (const [id, group] of scene.items) {
      const original = before.get(id), reflected = vertices(group);
      assert.equal(reflected.length, original.length, `${id} geometry count`);
      for (let i = 0; i < reflected.length; i += 3) {
        near(reflected[i], 9.8 - original[i], `${id} X`);
        near(reflected[i + 1], original[i + 1], `${id} height`);
        near(reflected[i + 2], original[i + 2], `${id} plan Y`);
      }
    }
    const mirroredOutline = scene.exteriorPolygon();
    assert.equal(mirroredOutline.length, outline.length);
    mirroredOutline.forEach(([x, z], i) => {
      near(x, 9.8 - outline[i][0], 'perimeter X');
      near(z, outline[i][1], 'perimeter Y');
    });
    const floor = scene.world.children[0];
    floor.updateMatrixWorld(true);
    for (const room of plan.rooms) {
      const ray = new THREE.Raycaster(new THREE.Vector3(room.x * .001, 20, room.y * .001), new THREE.Vector3(0, -1, 0));
      assert.ok(ray.intersectObject(floor).length, `${room.name} retains its upward-facing floor`);
    }
    // Picking must still work through the negative-scale transform.
    for (const id of ['bedroom1-bed', 'living-sofa', 'dining-table']) {
      const object = plan.objects.find(o => o.id === id);
      const ray = new THREE.Raycaster(new THREE.Vector3(object.x * .001, 20, object.y * .001), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(scene.items.get(id), true);
      assert.ok(hits.some(hit => hit.object.isMesh && hit.object.userData.id === id), `${id} remains selectable`);
    }
    scene.disposeGroup(scene.world);
  });
}

test('reference image pixels retain their registration after horizontal reflection', () => {
  const scene = viewport('2d');
  scene.referenceTexture = new THREE.Texture();
  scene.plan = { meta: { referenceTransform: { scaleX: 1, offsetX: 0 } } };
  scene.buildReference();
  const original = vertices(scene.world.children.at(-1));
  scene.plan.meta.referenceTransform = { scaleX: -1, offsetX: 9800 };
  scene.buildReference();
  const reflected = vertices(scene.world.children.at(-1));
  for (let i = 0; i < reflected.length; i += 3) {
    near(reflected[i], 9.8 - original[i], 'reference X');
    near(reflected[i + 1], original[i + 1], 'reference height');
    near(reflected[i + 2], original[i + 2], 'reference Y');
  }
  scene.disposeGroup(scene.world);
  scene.referenceTexture.dispose();
});

for (const view of ['2d', '3d']) {
  test(`${view}: sideboard geometry fits its editable footprint, including minimum dimensions`, () => {
    const scene = viewport(view);
    for (const [width, depth, height] of [[1600, 400, 850], [10, 5, 1], [50000, 50000, 15000]]) {
      const group = new THREE.Group();
      scene.buildFurniture(group, { kind: 'sideboard', width, depth, height, color: '#c7ae87' });
      assert.ok(vertices(group).every(Number.isFinite));
      const bounds = new THREE.Box3().setFromObject(group);
      near(bounds.min.x, -width / 2000, 'left edge');
      near(bounds.max.x, width / 2000, 'right edge');
      near(bounds.min.z, -depth / 2000, 'back edge');
      near(bounds.max.z, depth / 2000, 'front edge');
      near(bounds.min.y, 0, 'floor contact');
      near(bounds.max.y, view === '2d' ? .062 : height / 1000, 'cabinet height');
      scene.disposeGroup(group);
    }
  });
}

test('sideboard worktop is continuous and its front remains readable in plan view', () => {
  const scene = viewport('2d'), group = new THREE.Group();
  scene.buildFurniture(group, { kind: 'sideboard', width: 1600, depth: 400, height: 850 });
  group.updateMatrixWorld(true);
  const hit = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 1, z), new THREE.Vector3(0, -1, 0)).intersectObject(group, true).find(result => result.object.isMesh);
  const top = hit(0, 0);
  for (const x of [-.6, -1.6 / 6, .1, 1.6 / 6, .6]) assert.equal(hit(x, 0).object, top.object, 'no partitions across the worktop');
  assert.notEqual(hit(0, .191).object, top.object, 'front reveal identifies the cabinet direction');
  assert.equal(hit(0, -.191).object, top.object, 'back edge remains a continuous worktop');
  scene.disposeGroup(group);
});

test('sideboard front details survive reflection and remain selectable', () => {
  const scene = viewport('3d'), plan = createInitialPlan();
  const sideboard = { id:'test-sideboard', type:'furniture', kind:'sideboard', name:'餐边柜测试', room:'餐厅', x:4500, y:6000, width:1600, depth:400, height:850, rotation:0, mirrorY:false, visible:true, locked:false, estimated:true };
  plan.objects.push(sideboard); scene.setPlan(plan);
  const original = vertices(scene.items.get(sideboard.id));
  const frontRay = new THREE.Raycaster(new THREE.Vector3(4.5, .7325, 7), new THREE.Vector3(0, 0, -1));
  const handleHit = frontRay.intersectObject(scene.items.get(sideboard.id), true).find(hit => hit.object.isMesh);
  near(handleHit.point.z, 6.2, 'front handle is inside the specified depth');
  assert.equal(handleHit.object.userData.id, sideboard.id);
  mirrorPlanHorizontally(plan); scene.setPlan(plan);
  const reflected = vertices(scene.items.get(sideboard.id));
  assert.equal(reflected.length, original.length);
  for (let i = 0; i < reflected.length; i += 3) {
    near(reflected[i], 9.8 - original[i], 'reflected X');
    near(reflected[i + 1], original[i + 1], 'unchanged height');
    near(reflected[i + 2], original[i + 2], 'unchanged plan Y');
  }
  const ray = new THREE.Raycaster(new THREE.Vector3(5.3, 2, 6), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(scene.items.get(sideboard.id), true).some(hit => hit.object.isMesh && hit.object.userData.id === sideboard.id));
  scene.disposeGroup(scene.world);
});
