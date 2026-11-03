import * as THREE from 'three';

// Standalone design study only; every architectural extent lives here.
export const DEFAULT_DIMENSIONS = Object.freeze({
  wallLeft: -1.70, wallRight: .70, wallZ: 1.10, wallThickness: .05, wallHeight: 2.40,
  sideWallOuterX: .70, sideWallThickness: .05, centralCeilingHeight: 2.70,
  openingLeft: -.80, openingRight: .10, openingHeight: 2.16,
  doorWidth: .48, doorHeight: 2.18, doorThickness: .035, doorBottom: .012,
  doorZ: 1.025, doorGap: .004, doorOpenClearance: .02,
  trackY: 2.24, trackZ: .985, trackLeft: -1.38, trackRight: .68,
  leftBack: -1.70, leftFront: -1.10, leftStart: 1.17, leftEnd: 2.26,
  rightFront: .30, rightBack: .65, rightStart: 1.17, rightEnd: 1.65,
  cabinetHeight: 2.30, panel: .018, plinthHeight: .08,
  bedEnd: .20, roomRear: 2.35,
});

function oakTexture() {
  const size = 512, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const warp = Math.sin(v * 7.3 + u * 5) * 1.9 + Math.sin(v * 21 + u * 8) * .45;
    const fine = Math.sin(u * 190 + warp) * 2.6 + Math.sin(u * 511 + warp * 2) * 1.7;
    const coarse = Math.sin(u * 29 + Math.sin(v * 5) * .8) * 5;
    const rnd = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const grain = fine + coarse + (rnd - Math.floor(rnd) - .5) * 4;
    const i = (y * size + x) * 4;
    data[i] = 196 + grain; data[i + 1] = 164 + grain; data[i + 2] = 123 + grain; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

function softFoldGeometry(width, height, depth) {
  const position = [], uv = [], index = [], columns = 24, rows = 12;
  const pow = (a, e) => Math.sign(a) * Math.pow(Math.abs(a), e);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const a = -Math.PI / 2 + Math.PI * j / rows, b = 2 * Math.PI * i / columns;
    const ring = pow(Math.cos(a), .28);
    position.push(width * .5 * ring * pow(Math.cos(b), .28),
      height * .5 * pow(Math.sin(a), .4) + Math.sin(b * 4 + a * 3) * .0018 * Math.cos(a),
      depth * .5 * ring * pow(Math.sin(b), .32));
    uv.push(i / columns, j / rows);
    if (i < columns && j < rows) {
      const p = j * (columns + 1) + i, q = p + columns + 1;
      index.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index); geometry.computeVertexNormals(); return geometry;
}

/** Enclosed wardrobe study: an unbroken side wall meets the aligned flat soffit.
 * The original through-wardrobe design and production room remain untouched. */
export function buildWardrobe(overrides = {}) {
  const d = { ...DEFAULT_DIMENSIONS, ...overrides };
  if (!Object.values(d).every(Number.isFinite)
    || d.openingRight <= d.openingLeft || d.leftFront >= d.rightFront
    || d.leftEnd <= d.leftStart || d.rightEnd <= d.rightStart
    || d.cabinetHeight <= 1 || d.wallHeight < d.cabinetHeight
    || d.sideWallThickness <= 0 || d.sideWallOuterX <= d.sideWallThickness
    || d.centralCeilingHeight < d.wallHeight
    || d.rightBack > d.sideWallOuterX - d.sideWallThickness + 1e-8)
    throw new Error('过道衣帽间尺寸无效');
  const group = new THREE.Group(); group.name = '侧面完全封闭衣帽间 · 独立设计示意';
  const partition = new THREE.Group(); partition.name = '白色隔断与外露谷仓门轨'; group.add(partition);
  const sideWall = new THREE.Group(); sideWall.name = '右侧连续封闭墙 · 平接衣帽区吊顶'; group.add(sideWall);
  const storage = new THREE.Group(); storage.name = '原木色开放柜内'; group.add(storage);
  const white = new THREE.MeshStandardMaterial({ name: '暖白硬质哑光柜板', color: '#eeeae1', roughness: .73 });
  const insetWhite = new THREE.MeshStandardMaterial({ name: 'Shaker内凹门芯', color: '#e5e1d8', roughness: .78 });
  const oak = new THREE.MeshStandardMaterial({ name: '天然暖橡木柜内', color: 0xffffff, map: oakTexture(), roughness: .69 });
  const black = new THREE.MeshStandardMaterial({ name: '谷仓门黑色钢五金', color: '#202321', roughness: .42, metalness: .72 });
  const nickel = new THREE.MeshStandardMaterial({ name: '拉丝衣杆', color: '#aca99f', roughness: .29, metalness: .85 });
  const shadow = new THREE.MeshStandardMaterial({ name: '柜内踢脚阴影色', color: '#998572', roughness: .92 });
  const clothes = ['#d9caba', '#eee6d8', '#85928c', '#615b53', '#a58e77'].map((color, i) =>
    new THREE.MeshStandardMaterial({ name: `织物衣物 ${i + 1}`, color, roughness: .96 }));

  function mesh(parent, name, geometry, material, x = 0, y = 0, z = 0) {
    const result = new THREE.Mesh(geometry, material); result.name = name;
    result.position.set(x, y, z); result.castShadow = result.receiveShadow = true; parent.add(result); return result;
  }
  function box(parent, name, x1, x2, y1, y2, z1, z2, material) {
    if (!(x2 > x1 && y2 > y1 && z2 > z1)) throw new Error(`部件尺寸无效：${name}`);
    return mesh(parent, name, new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), material,
      (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  }
  function rod(parent, name, from, to, radius, material = black, segments = 12) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
    const result = mesh(parent, name, new THREE.CylinderGeometry(radius, radius, delta.length(), segments), material);
    result.position.copy(a).add(b).multiplyScalar(.5);
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return result;
  }
  function tube(parent, name, points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v)));
    return mesh(parent, name, new THREE.TubeGeometry(curve, 20, radius, 6, false), material);
  }
  const front = d.wallZ - d.wallThickness / 2, back = d.wallZ + d.wallThickness / 2;
  box(partition, '左侧实心隔断', d.wallLeft, d.openingLeft, 0, d.openingHeight, front, back, white);
  box(partition, '右侧实心隔断', d.openingRight, d.wallRight, 0, d.openingHeight, front, back, white);
  box(partition, '门洞上方通顶横梁', d.wallLeft, d.wallRight, d.openingHeight, d.wallHeight, front, back, white);
  const sideInner = d.sideWallOuterX - d.sideWallThickness;
  // The lower side wall meets the front partition without coplanar duplicate
  // faces. Their union is continuous from front to rear with no slit.
  box(sideWall, '右侧封闭墙 · 平接吊顶底部', sideInner, d.sideWallOuterX,
    0, d.wallHeight, back, d.roomRear, white);
  sideWall.userData.bounds = { innerX: sideInner, outerX: d.sideWallOuterX, thickness: d.sideWallThickness,
    frontZ: front, rearZ: d.roomRear, height: d.wallHeight,
    frontHeight: d.wallHeight, rearHeight: d.wallHeight };
  // The rail is supported only above the opening, with actual stand-off posts.
  box(partition, '外露黑色承重扁钢轨道', d.trackLeft, d.trackRight, d.trackY - .023, d.trackY + .023,
    d.trackZ - .006, d.trackZ + .006, black);
  for (let i = 0; i < 6; i++) {
    const x = d.trackLeft + .10 + (d.trackRight - d.trackLeft - .20) * i / 5;
    rod(partition, '轨道墙面间隔柱', [x, d.trackY, d.trackZ + .007], [x, d.trackY, front], .011);
    rod(partition, '轨道固定螺栓帽', [x, d.trackY, d.trackZ - .010], [x, d.trackY, d.trackZ - .006], .010, black, 6);
  }
  for (const x of [d.trackLeft + .012, d.trackRight - .012]) {
    box(partition, '轨道防撞限位器', x - .010, x + .010, d.trackY - .010, d.trackY + .055,
      d.trackZ - .013, d.trackZ + .014, black);
  }

  const doorLeaves = [], middle = (d.openingLeft + d.openingRight) / 2;
  for (let i = 0; i < 2; i++) {
    const leaf = new THREE.Group(); leaf.name = `${i === 0 ? '左' : '右'}扇白色硬质Shaker谷仓门`;
    leaf.position.set(0, d.doorBottom, d.doorZ); group.add(leaf); doorLeaves.push(leaf);
    const w = d.doorWidth, h = d.doorHeight, t = d.doorThickness, stile = .061;
    for (let side = 0; side < 2; side++) {
      const a = side === 0 ? -w / 2 : w / 2 - stile, b = a + stile;
      if (side !== (i === 0 ? 1 : 0)) box(leaf, '门板整条硬质直边框', a, b, 0, h, -t / 2, t / 2, white);
      else {
        // Recessed pulls preserve the full 807.5 mm bed-side circulation gap.
        const slotA = (a + b) / 2 - .014, slotB = (a + b) / 2 + .014;
        box(leaf, '拉槽下方直框', a, b, 0, .95, -t / 2, t / 2, white);
        box(leaf, '拉槽上方直框', a, b, 1.17, h, -t / 2, t / 2, white);
        box(leaf, '拉槽左边硬框', a, slotA, .95, 1.17, -t / 2, t / 2, white);
        box(leaf, '拉槽右边硬框', slotB, b, .95, 1.17, -t / 2, t / 2, white);
        box(leaf, '内嵌黑色短拉槽', slotA, slotB, .95, 1.17, -t / 2 + .008, t / 2, black);
        box(leaf, '内嵌拉槽抓握边', slotA, slotA + .004, .963, 1.157, -t / 2 + .002, -t / 2 + .008, black);
      }
    }
    for (const [name, y1, y2] of [['门板下横框', 0, .12], ['门板中横框', 1.03, 1.12], ['门板上横框', h - .10, h]])
      box(leaf, name, -w / 2 + stile, w / 2 - stile, y1, y2, -t / 2, t / 2, white);
    for (const [y1, y2] of [[.12, 1.03], [1.12, h - .10]])
      box(leaf, '内凹硬质平门芯', -w / 2 + stile, w / 2 - stile, y1, y2, -.005, .008, insetWhite);
    // Black steel straps, rollers and axle heads move with each leaf.
    for (const x of [-w * .30, w * .30]) {
      box(leaf, '黑色外露吊轮钢带', x - .018, x + .018, h - .18, d.trackY - d.doorBottom + .058,
        -t / 2 - .014, -t / 2 - .006, black);
      const wheelY = d.trackY + .058 - d.doorBottom, wheelZ = d.trackZ - d.doorZ;
      rod(leaf, '谷仓门实心吊轮', [x, wheelY, wheelZ - .010], [x, wheelY, wheelZ + .010], .035, black, 28);
      rod(leaf, '吊轮中心轴帽', [x, wheelY, wheelZ - .015], [x, wheelY, wheelZ - .010], .009, nickel, 12);
      for (const y of [h - .125, h - .035])
        rod(leaf, '门板吊带螺栓', [x, y, -t / 2 - .020], [x, y, -t / 2 - .014], .006, black, 6);
    }
    leaf.userData.closedX = middle + (i === 0 ? -1 : 1) * (w + d.doorGap) / 2;
    leaf.userData.openX = i === 0 ? d.openingLeft - d.doorOpenClearance - w / 2 : d.openingRight + d.doorOpenClearance + w / 2;
  }
  for (const x of [d.openingLeft - .025, d.openingRight + .025])
    box(partition, '隐蔽地面防摆导向件', x - .010, x + .010, 0, .018, d.doorZ + .016, d.doorZ + .027, black);

  function cabinet(name, x1, x2, z1, z2, face) {
    const part = new THREE.Group(); part.name = name; storage.add(part);
    const p = d.panel, base = d.plinthHeight, h = d.cabinetHeight;
    const backX = face === 1 ? x1 : x2, frontX = face === 1 ? x2 : x1;
    box(part, '暖白外背板', face === 1 ? x1 : x2 - p, face === 1 ? x1 + p : x2,
      base, h, z1, z2, white);
    const innerBack = backX + face * p;
    box(part, '内侧原木贴面', Math.min(innerBack, innerBack + face * .002), Math.max(innerBack, innerBack + face * .002),
      base + p, h - p, z1 + p, z2 - p, oak);
    for (const z of [z1, z2 - p]) box(part, '端部暖白直立板', x1, x2, base, h, z, z + p, white);
    box(part, '原木底板', x1 + p, x2 - p, base, base + p, z1 + p, z2 - p, oak);
    box(part, '暖白顶板', x1, x2, h - p, h, z1 + p, z2 - p, white);
    box(part, '80mm回缩踢脚', x1 + .045, x2 - .045, 0, base, z1 + .035, z2 - .035, shadow);
    const usableX1 = x1 + p, usableX2 = x2 - p;
    function shelf(y, start = z1 + p, end = z2 - p) {
      return box(part, '原木开放层板', usableX1, usableX2, y, y + p, start, end, oak);
    }
    function drawers(start, end, count = 2) {
      const bottom = base + p, total = .48, frontCentre = frontX - face * .009;
      for (let i = 0; i < count; i++) {
        const low = bottom + i * total / count + .003, high = bottom + (i + 1) * total / count - .003;
        box(part, '原木实心抽屉面板', frontCentre - .009, frontCentre + .009, low, high, start + .004, end - .004, oak);
        box(part, '抽屉收纳盒', usableX1 + .018, usableX2 - .018, low + .015, high - .015, start + .015, end - .015, oak);
        rod(part, '抽屉短拉手', [frontX + face * .016, (low + high) / 2, (start + end) / 2 - .06],
          [frontX + face * .016, (low + high) / 2, (start + end) / 2 + .06], .005, black);
      }
      shelf(bottom + total, start, end); return bottom + total + p;
    }
    return { part, shelf, drawers, x: (x1 + x2) / 2, front: frontX, face };
  }

  function shirt(parent, x, top, z, material, length = .67) {
    const garment = new THREE.Group(); garment.name = '有厚度的自然垂挂衬衫'; garment.position.set(x, top - length, z); parent.add(garment);
    const shape = new THREE.Shape();
    const points = [[-.064, length], [-.18, length - .055], [-.26, length - .29], [-.19, length - .31],
      [-.148, length - .19], [-.155, .015], [-.085, 0], [.08, .006], [.16, .019], [.15, length - .19],
      [.19, length - .31], [.26, length - .29], [.18, length - .055], [.064, length], [.045, length - .036], [-.045, length - .036]];
    shape.moveTo(...points[0]); points.slice(1).forEach(point => shape.lineTo(...point)); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: .042, bevelEnabled: true, bevelThickness: .009,
      bevelSize: .009, bevelSegments: 3, steps: 2, curveSegments: 8 });
    geometry.translate(0, 0, -.021);
    mesh(garment, '衬衫衣身及垂袖实体', geometry, material);
    tube(garment, '衬衫门襟浅缝', [[0, .03, -.031], [.003, length * .40, -.033], [-.002, length - .06, -.031]], .0018, material);
    for (let k = 0; k < 4; k++) mesh(garment, '衣物纽扣', new THREE.SphereGeometry(.003, 6, 4), white, 0, .13 + k * .10, -.034);
    tube(parent, '木衣架肩部', [[x - .19, top - .035, z], [x, top + .035, z], [x + .19, top - .035, z]], .0055, oak);
    rod(parent, '衣架下横杆', [x - .18, top - .035, z], [x + .18, top - .035, z], .004, oak);
    tube(parent, '金属衣架挂钩', [[x, top + .03, z], [x, top + .074, z], [x + .013, top + .095, z],
      [x + .027, top + .08, z], [x + .018, top + .067, z]], .0025, nickel);
    return garment;
  }
  function folded(parent, x, y, z, index, width = .36, depth = .40) {
    const result = mesh(parent, '叠放针织衣物', softFoldGeometry(width, .048, depth), clothes[index % clothes.length], x, y + .025, z);
    result.rotation.y = (index % 3 - 1) * .035;
    tube(parent, '折衣边缘细缝', [[x - width * .42, y + .022, z - depth * .493],
      [x, y + .024, z - depth * .49], [x + width * .42, y + .022, z - depth * .493]], .0012, clothes[index % clothes.length]);
  }
  const left = cabinet('左排600mm深挂衣柜', d.leftBack, d.leftFront, d.leftStart, d.leftEnd, 1);
  const divider = (d.leftStart + d.leftEnd) / 2, p = d.panel;
  box(left.part, '左柜两格原木中隔板', d.leftBack + p, d.leftFront, d.plinthHeight + p,
    d.cabinetHeight - p, divider - p / 2, divider + p / 2, oak);
  const bays = [[d.leftStart + p, divider - p / 2], [divider + p / 2, d.leftEnd - p]];
  for (let i = 0; i < bays.length; i++) {
    const [a, b] = bays[i];
    if (i === 0) left.drawers(a, b, 2);
    left.shelf(1.98, a, b);
    rod(left.part, '挂衣区横向金属衣杆', [left.x, 1.86, a + .025], [left.x, 1.86, b - .025], .011, nickel, 20);
    for (let j = 0; j < 3; j++) shirt(left.part, left.x, 1.77, a + .12 + j * (b - a - .24) / 2,
      clothes[(i * 2 + j) % clothes.length], i === 0 ? .68 : .84 - j * .05);
    folded(left.part, left.x, 2.00, (a + b) / 2, i, .38, Math.min(.42, b - a - .08));
    folded(left.part, left.x, 2.05, (a + b) / 2, i + 1, .35, Math.min(.39, b - a - .10));
  }
  const right = cabinet('右排350mm深抽屉叠衣浅柜', d.rightFront, d.rightBack, d.rightStart, d.rightEnd, -1);
  right.drawers(d.rightStart + p, d.rightEnd - p, 2);
  for (const [s, y] of [.98, 1.32, 1.67, 1.98].entries()) {
    right.shelf(y);
    for (let j = 0; j < (s === 3 ? 1 : 3); j++)
      folded(right.part, right.x, y + p + j * .050, (d.rightStart + d.rightEnd) / 2, s + j,
        Math.min(.38, d.rightBack - d.rightFront - .075), Math.min(.42, d.rightEnd - d.rightStart - .075) - j * .015);
  }

  let openValue = 1;
  function setOpen(value) {
    if (!Number.isFinite(value)) throw new Error('门开启比例必须为有限数值');
    openValue = THREE.MathUtils.clamp(value, 0, 1);
    for (const leaf of doorLeaves) leaf.position.x = THREE.MathUtils.lerp(leaf.userData.closedX, leaf.userData.openX, openValue);
    group.userData.openValue = openValue; return openValue;
  }
  group.userData.conceptOnly = true;
  group.userData.dimensions = { ...d, clearAisle: d.rightFront - d.leftFront,
    frontBedGap: d.doorZ - d.doorThickness / 2 - d.bedEnd,
    rearTurnDepth: d.roomRear - d.rightEnd, clearOpening: d.openingRight - d.openingLeft,
    sideWall: { ...sideWall.userData.bounds },
    enclosedOutsideWidth: d.sideWallOuterX - d.wallLeft,
    enclosedInsideWidth: sideInner - d.wallLeft,
    enclosedOutsideDepth: d.roomRear - front,
    ceiling: { height: d.wallHeight, frontZ: front, alignedWithPartition: true } };
  setOpen(1);
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    group.clear();
  }
  return { group, setOpen, doorLeaves, dimensions: group.userData.dimensions, partition, sideWall, storage, dispose,
    get openValue() { return openValue; } };
}
