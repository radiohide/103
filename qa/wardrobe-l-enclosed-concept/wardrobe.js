import * as THREE from 'three';

// Same 235 x 122.5 cm planning footprint, now entered from the open right side.
export const DEFAULT_DIMENSIONS = Object.freeze({
  wallLeft: -1.70, wallRight: .65, wallZ: 1.10, wallThickness: .05,
  wallHeight: 2.40, centralCeilingHeight: 2.70,
  roomRear: 2.35,
  longRight: .65, longFront: 1.575, returnFront: -1.10, returnRear: 2.30,
  cornerFiller: .05, cabinetHeight: 2.36, upperSeam: 1.90,
  panel: .018, doorGap: .003, plinthHeight: .08, bedEnd: .20,
});

export function buildWardrobe(overrides = {}) {
  const d = { ...DEFAULT_DIMENSIONS, ...overrides };
  if (!Object.values(d).every(Number.isFinite) || d.wallHeight < d.cabinetHeight
    || d.centralCeilingHeight < d.wallHeight
    || d.longRight <= d.returnFront + d.cornerFiller || d.returnRear <= d.longFront + .6)
    throw new Error('L型衣帽区尺寸无效');
  const group = new THREE.Group(); group.name = 'L型暖白长柜 · 房门侧面开放';
  const partition = new THREE.Group(); partition.name = '235cm床侧整面白色背板 · 无门洞'; group.add(partition);
  const sideWall = new THREE.Group(); sideWall.name = '房门侧面开放入口 · 无封墙'; group.add(sideWall);
  const storage = new THREE.Group(); storage.name = '暖白L型柜体'; group.add(storage);
  const longRun = new THREE.Group(); longRun.name = '235cm长柜 · 四格45cm深叠衣储物'; storage.add(longRun);
  const returnRun = new THREE.Group(); returnRun.name = '72.5cm返柜 · 60cm深挂衣'; storage.add(returnRun);
  const white = new THREE.MeshPhysicalMaterial({ name: '暖白平整烤漆柜门', color: '#eeeae1', roughness: .38, clearcoat: .28, clearcoatRoughness: .4 });
  const wall = new THREE.MeshStandardMaterial({ name: '暖白平整护墙与背板', color: '#eeeae1', roughness: .78 });
  const interior = new THREE.MeshStandardMaterial({ name: '暖橡木色柜内', color: '#c5ab87', roughness: .79 });
  const oak = new THREE.MeshStandardMaterial({ name: '木色内嵌横拉槽', color: '#9a7249', roughness: .61 });
  const shadow = new THREE.MeshStandardMaterial({ name: '回缩踢脚与柜门阴缝', color: '#928878', roughness: .93 });
  const nickel = new THREE.MeshStandardMaterial({ name: '拉丝金属挂衣杆', color: '#b1b0a6', metalness: .8, roughness: .32 });
  const fabrics = ['#d7c9b6', '#e5ddd1', '#86958e', '#695e52'].map(color => new THREE.MeshStandardMaterial({ color, roughness: .98 }));
  function mesh(parent, name, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material); m.name = name; m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, name, x0, x1, y0, y1, z0, z1, material) {
    if (!(x1 > x0 && y1 > y0 && z1 > z0)) throw new Error(`无效部件：${name}`);
    return mesh(parent, name, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), material,
      (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  function rod(parent, name, a, b, radius, material = nickel) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const m = mesh(parent, name, new THREE.CylinderGeometry(radius, radius, delta.length(), 16), material);
    m.position.copy(from).add(to).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  const front = d.wallZ - d.wallThickness / 2, insideFront = d.wallZ + d.wallThickness / 2;
  const innerRight = d.longRight;
  const p = d.panel, h = d.cabinetHeight, base = d.plinthHeight, end = d.longFront, gap = d.doorGap;
  box(partition, '235cm床侧整幅无门背板', d.wallLeft, d.longRight, 0, d.wallHeight, front, insideFront, wall);
  sideWall.userData.open = true;
  sideWall.userData.bounds = { open: true, planeX: innerRight, frontZ: end, rearZ: d.roomRear };

  // Both carcasses meet at the corner; no duplicate solid cupboard occupies it.
  box(longRun, '长柜暖白背板', d.wallLeft, d.longRight, base, h, insideFront, insideFront + p, wall);
  box(longRun, '长柜左端板', d.wallLeft, d.wallLeft + p, base, h, insideFront + p, end, white);
  box(longRun, '房门侧外露暖白完整端板', d.longRight - p, d.longRight, base, h, insideFront + p, end - p, white);
  for (const [name, y0, y1] of [['底板', base, base + p], ['顶板', h - p, h], ['上柜分隔', d.upperSeam - p / 2, d.upperSeam + p / 2]])
    box(longRun, `长柜${name}`, d.wallLeft + p, d.longRight - p, y0, y1, insideFront + p, end - p, interior);
  box(longRun, '50mm转角收口条', d.returnFront, d.returnFront + d.cornerFiller, base, h, end - p, end, white);
  box(longRun, '转角与主柜内隔板', d.returnFront + d.cornerFiller - p, d.returnFront + d.cornerFiller,
    base + p, d.upperSeam - p / 2, insideFront + p, end - p, interior);
  const mainStart = d.returnFront + d.cornerFiller;
  const mainBayCount = 4, mainBayWidth = (d.longRight - mainStart) / mainBayCount;
  for (let i = 1; i < mainBayCount; i++) {
    const x = mainStart + i * mainBayWidth;
    box(longRun, `叠衣柜第${i}道内隔板`, x - p / 2, x + p / 2, base + p, h - p, insideFront + p, end - p, interior);
  }
  for (const y of [.48, .87, 1.26, 1.65]) {
    for (let bay = 0; bay < mainBayCount; bay++) {
      const a = mainStart + bay * mainBayWidth + (bay ? p / 2 : 0);
      const b = mainStart + (bay + 1) * mainBayWidth - (bay === mainBayCount - 1 ? p : p / 2);
      box(longRun, `第${bay + 1}格叠衣搁板`, a, b, y, y + p, insideFront + p, end - p, interior);
    }
    for (let bay = 0; bay < mainBayCount; bay++) for (let layer = 0; layer < 2; layer++) {
      const x = mainStart + (bay + .5) * mainBayWidth;
      box(longRun, '叠放衣物', x - .14, x + .14, y + p + .004 + layer * .045, y + p + .042 + layer * .045,
        insideFront + .07, end - .07, fabrics[(bay + layer) % fabrics.length]);
    }
  }
  // The blind bay stays connected to the return. Its shelves stop before the
  // return's hanging bay; long-term items are reached through the near door.
  for (const y of [.55, 1.10, 1.65])
    box(longRun, '转角季节储物搁板', d.wallLeft + p, d.returnFront - p, y, y + p, insideFront + p, end + .045, interior);
  for (const [name, y0, y1] of [['盲角底板接缝', base, base + p], ['盲角顶板接缝', h - p, h], ['盲角上柜接缝', d.upperSeam - p / 2, d.upperSeam + p / 2]])
    box(longRun, name, d.wallLeft + p, d.returnFront, y0, y1, end - p, end, interior);

  box(returnRun, '返柜贴墙背板', d.wallLeft, d.wallLeft + p, base, h, end, d.returnRear, wall);
  box(returnRun, '返柜后端封板', d.wallLeft + p, d.returnFront - p, base, h, d.returnRear - p, d.returnRear, white);
  for (const [name, y0, y1] of [['底板', base, base + p], ['顶板', h - p, h], ['上柜分隔', d.upperSeam - p / 2, d.upperSeam + p / 2]])
    box(returnRun, `返柜${name}`, d.wallLeft + p, d.returnFront - p, y0, y1, end, d.returnRear - p, interior);
  box(returnRun, '返柜前端转角封边', d.returnFront - p, d.returnFront, base, h, end, end + .05, white);
  rod(returnRun, '60cm深柜内挂衣杆', [(d.wallLeft + d.returnFront) / 2, 1.76, end + .09], [(d.wallLeft + d.returnFront) / 2, 1.76, d.returnRear - .06], .011);
  for (let i = 0; i < 5; i++) {
    const z = end + .15 + i * .102, x = (d.wallLeft + d.returnFront) / 2;
    rod(returnRun, '木衣架左肩', [x - .20, 1.66, z], [x, 1.73, z], .007, oak);
    rod(returnRun, '木衣架右肩', [x, 1.73, z], [x + .20, 1.66, z], .007, oak);
    const shape = new THREE.Shape(); shape.moveTo(-.08, 0); shape.lineTo(-.20, -.055); shape.lineTo(-.23, -.28);
    shape.lineTo(-.15, -.31); shape.lineTo(-.14, -.69); shape.lineTo(.14, -.69); shape.lineTo(.15, -.31);
    shape.lineTo(.23, -.28); shape.lineTo(.20, -.055); shape.lineTo(.08, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .022, bevelEnabled: true, bevelSize: .006, bevelThickness: .005, bevelSegments: 2, steps: 1 });
    mesh(returnRun, '悬挂衣物', geometry, fabrics[i % fabrics.length], x, 1.66, z - .011);
  }
  box(longRun, '长柜回缩踢脚', d.wallLeft + .04, d.longRight - .04, 0, base, insideFront + .04, end - .05, shadow);
  box(returnRun, '返柜回缩踢脚', d.wallLeft + .04, d.returnFront - .05, 0, base, end, d.returnRear - .04, shadow);
  box(longRun, '长柜到顶40mm收口', d.wallLeft, d.longRight, h, d.wallHeight, insideFront, end, white);
  box(returnRun, '返柜到顶40mm收口', d.wallLeft, d.returnFront, h, d.wallHeight, end, d.returnRear, white);

  const doorLeaves = [], lowerTop = d.upperSeam - gap / 2;
  // Main leaves extend local -X; rear-hinged returns extend local +X.
  // Local +Z is always the outward face.
  function door(parent, name, width, y0, y1, hingeX, hingeZ, facing, phase, pull) {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(hingeX, 0, hingeZ);
    pivot.rotation.y = facing; parent.add(pivot);
    const isReturn = phase === 'return', x0 = isReturn ? 0 : -width, x1 = isReturn ? width : 0, z0 = -p, z1 = 0;
    if (pull) {
      const left = (x0 + x1) / 2 - .08, right = (x0 + x1) / 2 + .08, low = 1.055, high = 1.077;
      box(pivot, '柜门横槽下方平板', x0, x1, y0, low, z0, z1, white);
      box(pivot, '柜门横槽上方平板', x0, x1, high, y1, z0, z1, white);
      box(pivot, '横槽左侧门板', x0, left, low, high, z0, z1, white);
      box(pivot, '横槽右侧门板', right, x1, low, high, z0, z1, white);
      box(pivot, '内嵌木色横向拉槽', left, right, low, high, z0, -.007, oak);
    } else box(pivot, '上柜独立平整门板', x0, x1, y0, y1, z0, z1, white);
    for (const y of [y0 + .13, y1 - .13]) box(pivot, '隐蔽柜门铰链', isReturn ? .004 : -.025, isReturn ? .025 : -.004, y, y + .035, -p - .018, -p, nickel);
    pivot.userData.closedRotation = facing; pivot.userData.phase = phase; pivot.userData.width = width;
    doorLeaves.push(pivot); return pivot;
  }
  const mainDoorWidth = (d.longRight - mainStart - gap * (mainBayCount + 1)) / mainBayCount;
  for (let i = 0; i < mainBayCount; i++) {
    const right = mainStart + gap + (i + 1) * mainDoorWidth + i * gap;
    door(longRun, `长柜第${i + 1}扇下门`, mainDoorWidth, base + gap, lowerTop, right, end, 0, 'main', true);
    door(longRun, `长柜第${i + 1}扇上门`, mainDoorWidth, d.upperSeam + gap / 2, h - gap, right, end, 0, 'main', false);
  }
  // Rear-hinged return doors open first. Their fully open edge sits behind the
  // main leaves' sweep, so the single review slider never crashes the L corner.
  // The existing bathroom jamb projects towards the wardrobe. Stop its last
  // leaf before that jamb and use a recessed 25mm finish at the back corner.
  const returnDoorEnd = Math.min(d.returnRear - gap, d.roomRear - .075);
  box(returnRun, '避让卫生间门框的后端内退收口', d.returnFront - p, d.returnFront - .015,
    base, h, returnDoorEnd, d.returnRear, white);
  for (const [i, a, b] of [[0, end + .053, 2.025], [1, 2.028, returnDoorEnd]]) {
    door(returnRun, `返柜第${i + 1}扇下门`, b - a, base + gap, lowerTop, d.returnFront, b, Math.PI / 2, 'return', true);
    door(returnRun, `返柜第${i + 1}扇上门`, b - a, d.upperSeam + gap / 2, h - gap, d.returnFront, b, Math.PI / 2, 'return', false);
  }
  let openValue = 0;
  function setOpen(value) {
    if (!Number.isFinite(value)) throw new Error('柜门开启比例必须为有限数值');
    openValue = THREE.MathUtils.clamp(value, 0, 1);
    for (const leaf of doorLeaves) {
      const amount = leaf.userData.phase === 'return' ? Math.min(openValue * 2, 1) : Math.max(0, openValue * 2 - 1);
      // Main opens +90 degrees; the rear-hinged return opens -90 degrees
      // from its +90-degree closed frame, towards the free aisle.
      leaf.rotation.y = leaf.userData.closedRotation + (leaf.userData.phase === 'return' ? -1 : 1) * amount * Math.PI / 2;
    }
    group.userData.openValue = openValue; group.updateMatrixWorld(true); return openValue;
  }
  group.userData.conceptOnly = true;
  group.userData.dimensions = { ...d,
    footprintWidth: innerRight - d.wallLeft, footprintDepth: d.roomRear - insideFront,
    footprint: { minX: d.wallLeft, maxX: innerRight, minZ: insideFront, maxZ: d.roomRear },
    netArea: (innerRight - d.wallLeft) * (d.roomRear - insideFront),
    areaIncludesCabinets: true, sideOpen: true,
    longRun: { width: d.longRight - d.wallLeft, depth: end - insideFront, accessibleDoorWidth: mainDoorWidth * mainBayCount + gap * (mainBayCount - 1), doors: mainBayCount, doorWidth: mainDoorWidth, cornerFiller: d.cornerFiller },
    shortReturn: { length: d.returnRear - end, depth: d.returnFront - d.wallLeft },
    clearAisle: d.roomRear - end, clearOpening: d.roomRear - end, frontBedGap: front - d.bedEnd,
    sideOpening: { axis: 'x', x: innerRight, minZ: end, maxZ: d.roomRear, width: d.roomRear - end },
    outerHallWidth: 1.70 - innerRight,
    handlesProjection: 0, sideWall: { ...sideWall.userData.bounds },
    ceiling: { height: d.wallHeight, frontZ: front, alignedWithPartition: true },
    openingSequence: '先返柜后长柜；柜门开启时取衣通道暂被占用',
  };
  setOpen(0);
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(), materials = new Set();
    group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); group.clear();
  }
  return { group, dimensions: group.userData.dimensions, partition, sideWall, storage, doorLeaves, setOpen, dispose,
    get openValue() { return openValue; } };
}
