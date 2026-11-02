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
