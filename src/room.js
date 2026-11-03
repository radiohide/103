import * as THREE from 'three';

/** Photo-guided room geometry. Metres; the window is at negative Z. */
export function buildRoom(materials, config = {}) {
  const W = config.width || 3.4, D = config.depth || 4.7;
  const H = config.ceilingHeight || 2.7, S = config.soffitHeight || 2.4;
  const left = -W / 2, right = W / 2, front = -D / 2, back = D / 2;
  const group = new THREE.Group(); group.name = '卧室二 · 含打通阳台';
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = '两级吊顶与灯具';
  ceilingGroup.userData.ceiling = true; group.add(ceilingGroup);
  const ownMaterials = [], geometries = new Set(), spots = [];
  const paint = (colour, roughness = .8, opacity = 1) => {
    const m = new THREE.MeshStandardMaterial({ color: colour, roughness, transparent: opacity < 1, opacity });
    ownMaterials.push(m); return m;
  };
  const seal = paint('#121b19', .9), ceramic = paint('#e5e7df', .2);
  const gasket = paint('#151c1a', .91), drawer = paint('#b7b8af', .63);
  const mirrorMaterial = new THREE.MeshStandardMaterial({ color: '#aaaead', metalness: 1, roughness: .055 });
  ownMaterials.push(mirrorMaterial);
  function mesh(geometry, material, name, parent = group) {
    geometries.add(geometry);
    const m = new THREE.Mesh(geometry, material); m.name = name || '';
    m.castShadow = material !== materials.glass && material !== materials.bronzeGlass;
    m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w, h, d, x, y, z, material, name, parent = group) {
    const m = mesh(new THREE.BoxGeometry(w, h, d), material, name, parent);
    m.position.set(x, y, z); return m;
  }
  function cylinder(radius, height, x, y, z, material, name, parent = group, segments = 32) {
    const m = mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material, name, parent);
    m.position.set(x, y, z); return m;
  }
  const floor = box(W + .02, .09, D + .02, 0, -.048, 0, materials.woodEdge, '地板基层');
  floor.castShadow = false;
  // Individual staggered boards have real narrow joints and varied UV phases.
  const boardWidth = W / Math.round(W / .18), boardLength = 1.22, gap = .0013;
  for (let row = 0; row < Math.round(W / .18); row++) {
    const phase = (row * .381) % boardLength;
    let z0 = front - phase, n = 0;
    while (z0 < back) {
      const z1 = Math.max(front, z0), z2 = Math.min(back, z0 + boardLength);
      const geometry = new THREE.BoxGeometry(boardWidth - gap, .014, z2 - z1 - gap);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (z2 - z1) / boardLength);
      const m = mesh(geometry, materials.woodVariants?.[(row * 3 + n) % materials.woodVariants.length] || materials.wood, `灰橡木板 ${row + 1}-${n + 1}`);
      m.position.set(left + (row + .5) * boardWidth, -.001, (z1 + z2) / 2); m.castShadow = false;
      z0 += boardLength; n++;
    }
  }

  // Solid room shell around actual openings. Walls extend outwards from the clear dimensions.
  const wallT = .12, windowLeft = left - wallT / 2, windowRight = right - .45;
  const windowBottom = .12, windowTop = Math.min(2.35, S - .035);
  const cornerReturn = .46;
  const doorZ0 = back - 1.075, doorZ1 = back - .125, doorHeight = Math.min(2.32, S - .07);
  box(wallT, H, D - cornerReturn, left - wallT / 2, H / 2, front + cornerReturn + (D - cornerReturn) / 2, materials.wall, '左侧细纹墙面');
  box(wallT, windowBottom, cornerReturn, left - wallT / 2, windowBottom / 2, front + cornerReturn / 2, materials.wall, '转角窗下矮墙');
  box(wallT, H - windowTop, cornerReturn, left - wallT / 2, (H + windowTop) / 2, front + cornerReturn / 2, materials.wall, '转角窗顶墙');
  box(wallT, H, doorZ0 - front, right + wallT / 2, H / 2, (front + doorZ0) / 2, materials.wall, '右侧细纹墙面');
  box(wallT, H, back - doorZ1, right + wallT / 2, H / 2, (doorZ1 + back) / 2, materials.wall, '入户门后墙垛');
  box(wallT, H - doorHeight, doorZ1 - doorZ0, right + wallT / 2, (H + doorHeight) / 2, (doorZ0 + doorZ1) / 2, materials.wall, '房门过梁');
  box(W, windowBottom, wallT, 0, windowBottom / 2, front - wallT / 2, materials.wall, '窗下墙');
  box(W, H - windowTop, wallT, 0, (H + windowTop) / 2, front - wallT / 2, materials.wall, '窗上墙');
  box(right - windowRight, H, wallT, (right + windowRight) / 2, H / 2, front - wallT / 2, materials.wall, '窗右侧墙垛');
  const bathLeft = -1.10, bathRight = .60, bathHeight = Math.min(2.30, S - .08);
  box(bathLeft - left, H, wallT, (left + bathLeft) / 2, H / 2, back + wallT / 2, materials.wall, '卫生间门左墙垛');
  box(right - bathRight, H, wallT, (bathRight + right) / 2, H / 2, back + wallT / 2, materials.wall, '卫生间门右墙垛');
  box(bathRight - bathLeft, H - bathHeight, wallT, (bathRight + bathLeft) / 2, (H + bathHeight) / 2, back + wallT / 2, materials.wall, '卫生间门上墙');

  // Almost flush dark shadow skirting as in the reference, deliberately not a tall moulding.
  const skirtH = .015, skirtD = .008;
  box(skirtD, skirtH, D - cornerReturn, left + skirtD / 2, skirtH / 2, front + cornerReturn + (D - cornerReturn) / 2, seal, '左墙地面收边');
  box(skirtD, skirtH, doorZ0 - front, right - skirtD / 2, skirtH / 2, (doorZ0 + front) / 2, seal, '右墙地面收边');
  box(right - bathRight, skirtH, skirtD, (right + bathRight) / 2, skirtH / 2, back - skirtD / 2, seal, '后墙地面收边');
  box(bathLeft - left, skirtH, skirtD, (bathLeft + left) / 2, skirtH / 2, back - skirtD / 2, seal, '后墙左收边');

  // Large front light and its short left-hand return. Every mullion is solid and casts its own shadow.
  // Set the L-shaped window into the wall thickness, not against its room face.
  const frame = .044, frameDepth = .072, winZ = front - wallT / 2;
  const returnX = left - wallT / 2, returnStart = winZ, returnEnd = front + cornerReturn;
  const returnLength = returnEnd - returnStart, returnCentre = (returnStart + returnEnd) / 2;
  const lightWidth = windowRight - windowLeft, lightHeight = windowTop - windowBottom;
  box(lightWidth + .04, .055, wallT + .01, (windowLeft + windowRight) / 2, windowBottom - .01, winZ, materials.stone, '石材窗台');
  box(wallT + .01, .055, returnLength + .04, returnX, windowBottom - .01, returnCentre, materials.stone, '转角石材窗台');
  for (const x of [windowLeft + frame / 2, windowRight - frame / 2]) box(frame, lightHeight, frameDepth, x, (windowTop + windowBottom) / 2, winZ, materials.blackMetal, '窗外框竖梃');
  for (const y of [windowBottom + frame / 2, windowTop - frame / 2]) box(lightWidth, frame, frameDepth, (windowLeft + windowRight) / 2, y, winZ, materials.blackMetal, '窗外框横梃');
  const mullionX = .35, crossY = .76;
  box(.057, lightHeight - frame * 2, .087, mullionX, (windowTop + windowBottom) / 2, winZ + .005, materials.blackMetal, '主窗中梃');
  box(windowRight - mullionX, .057, frameDepth, (windowRight + mullionX) / 2, crossY, winZ, materials.blackMetal, '右窗下横梃');
  function pane(x0, x1, y0, y1, z, name, parent = group) {
    const glass = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), materials.glass, name, parent);
    glass.position.set((x0 + x1) / 2, (y0 + y1) / 2, z); glass.castShadow = false;
    box(.009, y1 - y0, .012, x0, (y0 + y1) / 2, z + .009, gasket, '玻璃密封胶条', parent);
    box(.009, y1 - y0, .012, x1, (y0 + y1) / 2, z + .009, gasket, '玻璃密封胶条', parent);
    for (const y of [y0, y1]) box(x1 - x0, .009, .012, (x0 + x1) / 2, y, z + .009, gasket, '玻璃密封胶条', parent);
    return glass;
  }
  pane(windowLeft + frame, mullionX - .032, windowBottom + frame, windowTop - frame, winZ, '主固定窗玻璃');
  pane(mullionX + .032, windowRight - frame, windowBottom + frame, crossY - .032, winZ, '右下固定窗玻璃');
  const windowLeaf = new THREE.Group(); windowLeaf.name = '右侧内开窗扇';
  windowLeaf.position.set(windowRight - .045, 0, winZ + .012); group.add(windowLeaf);
  const leafWidth = windowRight - mullionX - .085, leafBottom = crossY + .029, leafTop = windowTop - .042;
  for (const x of [0, -leafWidth]) box(.037, leafTop - leafBottom, .048, x, (leafTop + leafBottom) / 2, .015, materials.blackMetal, '活动窗扇竖框', windowLeaf);
  for (const y of [leafBottom, leafTop]) box(leafWidth, .037, .048, -leafWidth / 2, y, .015, materials.blackMetal, '活动窗扇横框', windowLeaf);
  pane(-leafWidth + .021, -.021, leafBottom + .021, leafTop - .021, .015, '活动窗扇玻璃', windowLeaf);
  box(.022, .132, .025, -leafWidth + .045, 1.53, .06, materials.blackMetal, '窗把手', windowLeaf);
  for (const y of [.95, 2.10]) cylinder(.011, .08, .023, Math.min(y, leafTop - .12), .018, materials.blackMetal, '窗铰链', windowLeaf);
  windowLeaf.userData.closedRotation = 0; windowLeaf.userData.openRotation = Math.PI * .31;
  const returnGlass = mesh(new THREE.PlaneGeometry(returnLength - frame * 2, lightHeight - frame * 2), materials.glass, '左侧转角固定窗');
  returnGlass.rotation.y = Math.PI / 2; returnGlass.position.set(returnX, (windowTop + windowBottom) / 2, returnCentre); returnGlass.castShadow = false;
  for (const z of [returnStart + frame / 2, returnEnd - frame / 2]) box(frameDepth, lightHeight, frame, returnX, (windowTop + windowBottom) / 2, z, materials.blackMetal, '转角窗立框');
  for (const y of [windowBottom + frame / 2, windowTop - frame / 2]) box(frameDepth, frame, returnLength, returnX, y, returnCentre, materials.blackMetal, '转角窗横框');

  // White, nearly flush entry door in the right wall. Hinge is at the back edge.
  for (const z of [doorZ0, doorZ1]) box(.15, doorHeight + .02, .025, right, doorHeight / 2, z, materials.blackMetal, '房门细框');
  box(.15, .025, doorZ1 - doorZ0, right, doorHeight, (doorZ0 + doorZ1) / 2, materials.blackMetal, '房门上框');
  const entryDoor = new THREE.Group(); entryDoor.name = '卧室白色平开门';
  entryDoor.position.set(right - .018, 0, doorZ1 - .013); group.add(entryDoor);
  const doorW = doorZ1 - doorZ0 - .03;
  box(.041, doorHeight - .025, doorW, 0, doorHeight / 2, -doorW / 2, materials.door, '平开门门板', entryDoor);
  box(.0015, doorHeight - .035, .003, -.0215, doorHeight / 2, -doorW + .105, seal, '门板细凹缝', entryDoor);
  const rose = cylinder(.021, .014, -.032, 1.02, -doorW + .12, materials.blackMetal, '门把手圆座', entryDoor); rose.rotation.z = Math.PI / 2;
  const lever = cylinder(.008, .115, -.055, 1.02, -doorW + .162, materials.blackMetal, '门把手', entryDoor, 20); lever.rotation.x = Math.PI / 2;
  const lock = cylinder(.012, .012, -.033, .957, -doorW + .12, materials.blackMetal, '锁孔', entryDoor); lock.rotation.z = Math.PI / 2;
  for (const y of [.27, 1.18, doorHeight - .24]) cylinder(.012, .075, -.024, y, -.015, materials.brushedMetal, '暗门铰链', entryDoor, 16);
  entryDoor.rotation.y = Math.PI * .36;
  entryDoor.userData.closedRotation = 0; entryDoor.userData.openRotation = Math.PI * .36;
  // A shallow corridor beyond the real doorway gives the open edge proper depth.
  box(1.18, .08, 1.42, right + .59, -.045, back - .6, materials.ground, '门外走廊地面');
  box(.10, S, 1.45, right + 1.15, S / 2, back - .6, materials.wall, '走廊远侧墙');
  box(1.2, S, .09, right + .6, S / 2, back + .13, materials.marble, '走廊石材端墙');

  // Bathroom sliding door, lintel rail and a small but fully dimensional adjoining interior.
  for (const x of [bathLeft, bathRight]) box(.027, bathHeight + .035, .16, x, bathHeight / 2, back + .015, materials.blackMetal, '卫生间门竖框');
  box(bathRight - bathLeft + .03, .036, .16, (bathLeft + bathRight) / 2, bathHeight, back + .015, materials.blackMetal, '卫生间推拉门上轨');
  box(bathRight - bathLeft + .03, .008, .04, (bathLeft + bathRight) / 2, .012, back + .018, materials.brushedMetal, '推拉门地轨');
  const bathDoor = new THREE.Group(); bathDoor.name = '卫生间茶色玻璃推拉门';
  const sliderW = (bathRight - bathLeft) / 2 + .025;
  bathDoor.position.set(bathLeft + sliderW / 2, 0, back - .035); group.add(bathDoor);
  box(sliderW - .035, bathHeight - .046, .009, 0, bathHeight / 2, 0, materials.bronzeGlass, '茶色玻璃', bathDoor);
  for (const x of [-sliderW / 2, sliderW / 2]) box(.022, bathHeight, .031, x, bathHeight / 2, 0, materials.blackMetal, '推拉门边框', bathDoor);
  for (const y of [.017, bathHeight - .009]) box(sliderW, .025, .031, 0, y, 0, materials.blackMetal, '推拉门上下框', bathDoor);
  box(.018, .27, .025, sliderW / 2 - .06, 1.05, -.025, materials.brushedMetal, '推拉门长把手', bathDoor);
  bathDoor.userData.closedPosition = bathRight - sliderW / 2;
  bathDoor.userData.openPosition = bathLeft + sliderW / 2;
  box(sliderW - .035, bathHeight - .046, .009, bathLeft + sliderW / 2, bathHeight / 2, back + .003, materials.bronzeGlass, '推拉门固定玻璃');
  box(.022, bathHeight, .031, bathLeft + sliderW, bathHeight / 2, back + .003, materials.blackMetal, '固定玻璃边框');
  const bathDepth = 1.55, bathCentre = (bathLeft + bathRight) / 2;
  box(1.98, .08, bathDepth, bathCentre, -.035, back + bathDepth / 2, materials.ground, '卫生间地砖');
  box(1.98, S, .1, bathCentre, S / 2, back + bathDepth, materials.marble, '卫生间背墙');
  box(.1, S, bathDepth, bathLeft - .10, S / 2, back + bathDepth / 2, materials.marble, '卫生间侧墙');
  box(.1, S, bathDepth, bathRight + .10, S / 2, back + bathDepth / 2, materials.marble, '卫生间右墙');
  box(1.98, .06, bathDepth, bathCentre, S + .03, back + bathDepth / 2, materials.ceiling, '卫生间天花');
  const vanityX = -.02, vanityZ = back + 1.16;
  box(1.12, .55, .50, vanityX, .50, vanityZ, drawer, '悬空浴室柜');
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    box(.551, .171, .015, vanityX + (col - .5) * .56, .324 + row * .181, vanityZ - .258, drawer, '浴室柜抽屉');
    box(.552, .005, .003, vanityX + (col - .5) * .56, .407 + row * .181, vanityZ - .268, seal, '抽屉暗拉槽');
  }
  box(1.18, .056, .54, vanityX, .807, vanityZ, materials.marble, '洗手台石材台面');
  const bowl = mesh(new THREE.SphereGeometry(.205, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ceramic, '洗手盆凹槽');
  bowl.scale.set(1.45, .35, .80); bowl.rotation.z = Math.PI; bowl.position.set(vanityX, .84, vanityZ - .03);
  box(.61, .018, .35, vanityX, .841, vanityZ - .03, ceramic, '台盆边沿');
  const basinWell = paint('#a9afaa', .2); box(.53, .007, .275, vanityX, .852, vanityZ - .03, basinWell, '盆内阴影');
  cylinder(.014, .20, vanityX, .94, vanityZ + .19, materials.brushedMetal, '龙头立柱');
  const tap = cylinder(.012, .15, vanityX, 1.03, vanityZ + .12, materials.brushedMetal, '龙头出水口'); tap.rotation.x = Math.PI / 2;
  const mirror = mesh(new THREE.PlaneGeometry(1.16, .87), mirrorMaterial, '浴室镜面');
  mirror.position.set(vanityX, 1.51, back + bathDepth - .058); mirror.rotation.y = Math.PI;
  mirror.userData.mirror = true; mirror.castShadow = false;
  for (const x of [vanityX - .59, vanityX + .59]) box(.017, .90, .025, x, 1.51, back + bathDepth - .065, materials.blackMetal, '镜子窄边');
  // Toilet silhouette sits partly behind the left half of the sliding panel.
  const toilet = cylinder(.21, .27, bathLeft + .32, .285, back + .55, ceramic, '卫生间马桶'); toilet.scale.z = 1.45;
  box(.34, .55, .15, bathLeft + .32, .38, back + .86, ceramic, '马桶水箱');

  // Two-level ceiling; every piece is in one group for the cutaway view.
  const soffitThickness = H - S, sideBand = .28, frontBand = .25, rearBand = .65;
  box(W + .24, .10, D + .24, 0, H + .05, 0, materials.ceiling, '中央顶面 2.7 m', ceilingGroup);
  box(sideBand, soffitThickness, D, left + sideBand / 2, (H + S) / 2, 0, materials.ceiling, '左侧吊顶', ceilingGroup);
  box(sideBand, soffitThickness, D, right - sideBand / 2, (H + S) / 2, 0, materials.ceiling, '右侧吊顶', ceilingGroup);
  box(W - sideBand * 2, soffitThickness, frontBand, 0, (H + S) / 2, front + frontBand / 2, materials.ceiling, '窗上吊顶', ceilingGroup);
  box(W - sideBand * 2, soffitThickness, rearBand, 0, (H + S) / 2, back - rearBand / 2, materials.ceiling, '门侧空调吊顶', ceilingGroup);
  const trimY = S + .024;
  for (const x of [left + sideBand + .012, right - sideBand - .012]) box(.024, .022, D - frontBand - rearBand + .04, x, trimY, (frontBand - rearBand) / 2, materials.ceiling, '内侧细阶梯线脚', ceilingGroup);
  for (const z of [front + frontBand + .012, back - rearBand - .012]) box(W - sideBand * 2 + .02, .022, .024, 0, trimY, z, materials.ceiling, '内侧细阶梯线脚', ceilingGroup);
  // Shadow at the intersection gives the recessed centre its fine outline.
  const revealMaterial = paint('#999d93', 1);
  for (const x of [left + sideBand + .004, right - sideBand - .004]) box(.008, .004, D - frontBand - rearBand, x, H - .006, (frontBand - rearBand) / 2, revealMaterial, '中央天花阴缝', ceilingGroup);
  for (const z of [front + frontBand + .004, back - rearBand - .004]) box(W - sideBand * 2, .004, .008, 0, H - .006, z, revealMaterial, '中央天花阴缝', ceilingGroup);
  // Back-wall long AC grille faces the room; the slots are geometry, not a flat decal.
  const ventW = W - .59, ventH = Math.min(.135, soffitThickness * .54), ventY = S + soffitThickness * .53, ventZ = back - rearBand - .006;
  box(ventW, ventH, .012, 0, ventY, ventZ, gasket, '中央空调深色风口底', ceilingGroup);
  for (let n = 0; n < 8; n++) {
    const y = ventY - ventH / 2 + .005 + n * (ventH - .01) / 7;
    box(ventW - .012, .006, .027, 0, y, ventZ - .006, materials.ceiling, '空调横向百叶', ceilingGroup);
  }
  for (const x of [-ventW / 2, ventW / 2]) box(.014, ventH + .022, .024, x, ventY, ventZ - .003, materials.ceiling, '风口边框', ceilingGroup);
  // Service hatch seam underneath the door-side bulkhead.
  const hatchX = right - .59, hatchZ = back - .30;
  box(.33, .0015, .27, hatchX, S - .001, hatchZ, revealMaterial, '检修口细缝', ceilingGroup);
  box(.326, .002, .266, hatchX, S - .002, hatchZ, materials.ceiling, '检修口面板', ceilingGroup);
  cylinder(.188, .035, 0, H - .019, -.18, materials.ceiling, '吸顶灯底座', ceilingGroup, 64);
  cylinder(.18, .047, 0, H - .052, -.18, materials.lightDiffuser, '圆形乳白吸顶灯', ceilingGroup, 64);
  function downlight(x, z) {
    const ring = mesh(new THREE.TorusGeometry(.028, .0034, 8, 28), materials.brushedMetal, '筒灯金属圈', ceilingGroup);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, S - .003, z);
    cylinder(.025, .007, x, S + .001, z, seal, '筒灯内腔', ceilingGroup);
    const lens = cylinder(.016, .005, x, S - .002, z, materials.lightDiffuser, '筒灯透镜', ceilingGroup);
    spots.push({ x, y: S - .015, z, mesh: lens });
  }
  for (const x of [-.95, 0, .95]) downlight(x, back - .29);
  downlight(left + .14, -.72); downlight(left + .14, .49);
  ceilingGroup.traverse(o => { o.userData.ceiling = true; });

  // Switches and outlet plates, with recessed socket holes rather than simple black squares.
  function wallPlate(side, along, y, count = 1, white = false, socket = true) {
    const plateGroup = new THREE.Group(); plateGroup.name = socket ? '墙面插座' : '墙面开关';
    const w = .086 * count;
    if (side === 'left') { plateGroup.position.set(left + .008, y, along); plateGroup.rotation.y = Math.PI / 2; }
    else if (side === 'right') { plateGroup.position.set(right - .008, y, along); plateGroup.rotation.y = -Math.PI / 2; }
    else { plateGroup.position.set(along, y, back - .009); plateGroup.rotation.y = Math.PI; }
    group.add(plateGroup);
    const mat = white ? materials.door : materials.blackPlastic;
    box(w, .082, .007, 0, 0, 0, mat, '面板', plateGroup);
    for (let n = 0; n < count; n++) {
      const x = (n - (count - 1) / 2) * .086;
      if (socket) {
        box(.004, .013, .001, x - .014, .010, .0045, seal, '插座孔', plateGroup);
        box(.004, .013, .001, x + .014, .010, .0045, seal, '插座孔', plateGroup);
        box(.004, .011, .001, x, -.016, .0045, seal, '接地孔', plateGroup);
      } else {
        box(.062, .060, .003, x, 0, .0055, mat, '开关按键', plateGroup);
        box(.045, .001, .001, x, -.023, .0075, seal, '按键接缝', plateGroup);
      }
    }
  }
  wallPlate('left', front + .85, .69, 2);
  wallPlate('left', front + .85, .31);
  wallPlate('left', .98, .67, 2);
  wallPlate('left', .98, .28);
  wallPlate('left', 1.50, 1.54, 1, false, false);
  wallPlate('right', .15, .32, 2, true);
  wallPlate('right', -.22, .32, 2);
  wallPlate('right', 1.03, 1.12, 2, false, false);
  wallPlate('right', 1.02, .26);

  return {
    group, ceilingGroup, entryDoor, bathDoor, windowLeaf, spots, bathroomMirror: mirror,
    dimensions: { width: W, depth: D, ceilingHeight: H, soffitHeight: S },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of ownMaterials) material.dispose();
      group.removeFromParent(); group.clear();
    },
  };
}
