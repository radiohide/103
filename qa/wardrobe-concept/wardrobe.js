import * as THREE from 'three';

// Concept dimensions only. This module is deliberately separate from src/ and
// the room build; the opening/structure review can change these in one place.
const DEFAULT_DIMENSIONS = Object.freeze({
  left: -1.70, right: -.20, bedSide: .85, corner: 1.45, rear: 2.30,
  returnDepth: .55, height: 2.30, upperSeam: 1.90,
  panel: .018, doorGap: .003, toeKickHeight: .08, toeKickRecess: .05,
});

/** A warm-white rigid L wardrobe. Long-run doors face +Z; return doors face +X.
 * The blind corner is a connected storage bay, not two overlapping cabinets. */
export function buildWardrobe(overrides = {}) {
  const d = { ...DEFAULT_DIMENSIONS, ...overrides };
  const { left, right, bedSide, corner, rear, returnDepth, height, upperSeam, panel, doorGap, toeKickHeight, toeKickRecess } = d;
  if (![left, right, bedSide, corner, rear, returnDepth, height, upperSeam, panel, doorGap, toeKickHeight, toeKickRecess].every(Number.isFinite)
    || right - left <= returnDepth + .3 || corner <= bedSide + panel * 3 || rear <= corner + panel * 3
    || height <= upperSeam + .15 || upperSeam <= toeKickHeight + .5)
    throw new Error('衣柜示意尺寸无效');
  const returnFront = left + returnDepth, depth = corner - bedSide, returnLength = rear - corner;
  const group = new THREE.Group(); group.name = 'L形暖白硬质衣柜 · 独立方案示意';
  const longRun = new THREE.Group(); longRun.name = '长柜 · 门朝卫生间过道'; group.add(longRun);
  const returnRun = new THREE.Group(); returnRun.name = '短返柜 · 门朝过道内侧'; group.add(returnRun);
  const white = new THREE.MeshStandardMaterial({ name: '暖白哑光柜板', color: '#e7e4db', roughness: .78, metalness: 0 });
  const whiteBack = new THREE.MeshStandardMaterial({ name: '床侧整块护墙背板', color: '#e9e6dd', roughness: .84, metalness: 0 });
  const interior = new THREE.MeshStandardMaterial({ name: '浅暖灰柜内板', color: '#d5d0c4', roughness: .85 });
  const oak = new THREE.MeshStandardMaterial({ name: '浅橡木短拉手', color: '#bea78a', roughness: .59, metalness: 0 });
  const kick = new THREE.MeshStandardMaterial({ name: '回缩灰米踢脚', color: '#a9a397', roughness: .92 });
  const rail = new THREE.MeshStandardMaterial({ name: '柜内拉丝挂衣杆', color: '#a7a7a0', roughness: .32, metalness: .72 });

  function box(parent, name, minX, maxX, minY, maxY, minZ, maxZ, material) {
    const geometry = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const longInnerLeft = left + panel, longInnerRight = right - panel;
  const longInnerBack = bedSide + panel, longInnerFront = corner - panel;
  const shortInnerBack = left + panel, shortInnerFront = returnFront - panel;
  const innerFloor = toeKickHeight + panel;

  // Long-run carcass. The bed-facing back is one uninterrupted finished sheet.
  box(longRun, '床侧整幅平整背板', left, right, toeKickHeight, height, bedSide, bedSide + panel, whiteBack);
  box(longRun, '长柜左端板', left, left + panel, toeKickHeight, height, bedSide + panel, corner, white);
  box(longRun, '长柜右侧薄收口', right - panel, right, toeKickHeight, height, bedSide + panel, corner - panel, white);
  box(longRun, '长柜底板', longInnerLeft, longInnerRight, toeKickHeight, innerFloor, longInnerBack, longInnerFront, interior);
  box(longRun, '长柜顶板', longInnerLeft, longInnerRight, height - panel, height, longInnerBack, longInnerFront, white);
  box(longRun, '长柜独立吊柜底板', longInnerLeft, longInnerRight, upperSeam - panel / 2, upperSeam + panel / 2, longInnerBack, longInnerFront, interior);
  // Fill the blind side of the junction right up to the return. The accessible
  // front stops short for the door thickness; the blind corner has no door.
  box(longRun, '盲角连续底板收口', longInnerLeft, returnFront - panel, toeKickHeight, innerFloor, longInnerFront, corner, interior);
  box(longRun, '盲角连续顶板收口', longInnerLeft, returnFront - panel, height - panel, height, longInnerFront, corner, white);
  box(longRun, '盲角吊柜底板收口', longInnerLeft, returnFront - panel, upperSeam - panel / 2, upperSeam + panel / 2, longInnerFront, corner, interior);

  // The return starts at the long-run boundary, with no solid end panel there.
  // This leaves an actual L-shaped storage passage into the 550 mm blind bay.
  box(returnRun, '短柜靠左墙背板', left, left + panel, toeKickHeight, height, corner, rear, white);
  box(returnRun, '短柜后端收口板', left + panel, returnFront - panel, toeKickHeight, height, rear - panel, rear, white);
  box(returnRun, '短柜底板', shortInnerBack, shortInnerFront, toeKickHeight, innerFloor, corner, rear - panel, interior);
  box(returnRun, '短柜顶板', shortInnerBack, shortInnerFront, height - panel, height, corner, rear - panel, white);
  box(returnRun, '短柜独立吊柜底板', shortInnerBack, shortInnerFront, upperSeam - panel / 2, upperSeam + panel / 2, corner, rear - panel, interior);

  // Partition the hanging bay from the blind corner, then carry three usable
  // shelves around the corner. Access is from the first short-return door.
  box(longRun, '盲角与挂衣区隔板', returnFront - panel, returnFront, innerFloor, upperSeam - panel / 2, longInnerBack, longInnerFront, interior);
  for (const shelfY of [.55, 1.03, 1.48]) {
    box(longRun, '盲角内部搁板', longInnerLeft, returnFront - panel, shelfY - panel / 2, shelfY + panel / 2, longInnerBack, corner, interior);
    box(returnRun, '短柜可取物搁板', shortInnerBack, shortInnerFront, shelfY - panel / 2, shelfY + panel / 2, corner, rear - panel, interior);
  }
  const railLength = right - panel - returnFront - .04;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, railLength, 16), rail);
  rod.name = '长柜挂衣杆'; rod.rotation.z = Math.PI / 2;
  rod.position.set((right - panel + returnFront) / 2, 1.73, (longInnerBack + longInnerFront) / 2);
  rod.castShadow = rod.receiveShadow = true; longRun.add(rod);

  // Recessed plinths are 80 mm high and do not fill the floor-to-door shadow gap.
  box(longRun, '长柜80mm回缩踢脚', left + toeKickRecess, right - toeKickRecess, 0, toeKickHeight,
    bedSide + toeKickRecess, corner - toeKickRecess, kick);
  box(returnRun, '短柜80mm回缩踢脚', left + toeKickRecess, returnFront - toeKickRecess, 0, toeKickHeight,
    corner, rear - toeKickRecess, kick);

  const doorBottom = toeKickHeight + doorGap, lowerTop = upperSeam - doorGap / 2;
  const upperBottom = upperSeam + doorGap / 2, doorTop = height - doorGap;
  const doors = [];
  const longStart = returnFront + doorGap, longEnd = right - doorGap;
  const longDoorWidth = (longEnd - longStart - doorGap * 3) / 4;
  for (let i = 0; i < 4; i++) {
    const x1 = longStart + i * (longDoorWidth + doorGap), x2 = x1 + longDoorWidth;
    const lower = box(longRun, `长柜${i < 2 ? '左' : '右'}组双折门 · 第${i % 2 + 1}片 · 朝+Z`, x1, x2, doorBottom, lowerTop, corner - panel, corner, white);
    lower.userData.bifoldGroup = i < 2 ? 'left' : 'right';
    lower.userData.leafWidth = longDoorWidth;
    doors.push(lower);
    if (i === 1 || i === 2) {
      const handleX = i === 1 ? x2 - .029 : x1 + .029;
      box(longRun, '双折柜门奶茶色短拉手', handleX - .007, handleX + .007, 1.055, 1.185, corner + .004, corner + .024, oak);
    }
  }
  const upperDoorWidth = (longEnd - longStart - doorGap) / 2;
  for (let i = 0; i < 2; i++) {
    const x1 = longStart + i * (upperDoorWidth + doorGap), x2 = x1 + upperDoorWidth;
    doors.push(box(longRun, `长柜第${i + 1}扇独立吊柜门 · 朝+Z`, x1, x2, upperBottom, doorTop, corner - panel, corner, white));
    const handleX = i === 0 ? x2 - .029 : x1 + .029;
    box(longRun, '吊柜浅橡木小拉手', handleX - .007, handleX + .007, upperBottom + .029, upperBottom + .119, corner + .004, corner + .022, oak);
  }

  const shortStart = corner + .018, shortEnd = rear - doorGap;
  const shortDoorWidth = (shortEnd - shortStart - doorGap) / 2;
  for (let i = 0; i < 2; i++) {
    const z1 = shortStart + i * (shortDoorWidth + doorGap), z2 = z1 + shortDoorWidth;
    const lower = box(returnRun, `短柜第${i + 1}扇下柜门 · 朝+X`, returnFront - panel, returnFront, doorBottom, lowerTop, z1, z2, white);
    const upper = box(returnRun, `短柜第${i + 1}扇吊柜门 · 朝+X`, returnFront - panel, returnFront, upperBottom, doorTop, z1, z2, white);
    doors.push(lower, upper);
    const handleZ = i === 0 ? z2 - .035 : z1 + .035;
    box(returnRun, '短柜奶茶色短拉手', returnFront + .004, returnFront + .024, 1.055, 1.185, handleZ - .007, handleZ + .007, oak);
    box(returnRun, '短吊柜浅橡木小拉手', returnFront + .004, returnFront + .022, upperBottom + .029, upperBottom + .119, handleZ - .007, handleZ + .007, oak);
  }

  group.userData.dimensions = {
    longRun: { width: right - left, depth, height },
    shortReturn: { length: returnLength, depth: returnDepth, height },
    upperSeam, toeKickHeight,
    longBifoldLeaves: { count: 4, width: longDoorWidth },
    shortDoors: { count: 2, width: shortDoorWidth },
    envelope: { minX: left, maxX: right, minZ: bedSide, maxZ: rear },
    bedSideClearance: bedSide - .75,
  };
  group.userData.cornerStorage = '长柜左端550mm盲角与短返柜内部连通，短柜首扇门取物；床侧无柜门';
  group.userData.doorDirections = { longRun: '+Z', shortReturn: '+X' };
  group.userData.conceptOnly = true;
  group.updateMatrixWorld(true);
  return { group };
}
