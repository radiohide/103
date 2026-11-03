import * as THREE from 'three';

const signPower = (value, power) => Math.sign(value) * Math.pow(Math.abs(value), power);
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const v = clamp(value); return v * v * (3 - 2 * v); };

/** A soft closed cuboid, sampled as a superellipsoid rather than a bevelled
 * hard box. Dimensions are its complete local X/Y/Z extents. */
function cushionGeometry(width, height, depth, exponent = .4, columns = 28, rows = 16, relaxed = false) {
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const latitude = -Math.PI / 2 + Math.PI * row / rows;
    for (let column = 0; column <= columns; column++) {
      const longitude = Math.PI * 2 * column / columns;
      const ring = signPower(Math.cos(latitude), exponent);
      let x = width / 2 * ring * signPower(Math.cos(longitude), exponent);
      let y = height / 2 * signPower(Math.sin(latitude), exponent);
      let z = depth / 2 * ring * signPower(Math.sin(longitude), exponent);
      if (relaxed) {
        y += .004 * Math.sin(longitude * 5 + latitude * 3) * Math.cos(latitude);
        z += .004 * Math.sin(longitude * 7 - latitude * 4) * Math.cos(latitude);
      }
      positions.push(x, y, z); uvs.push(column / columns, row / rows);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function fabricTexture(knitted = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const grain = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const noise = grain - Math.floor(grain);
    const weave = knitted
      ? Math.cos(x * .72 + Math.abs(Math.sin(y * .39)) * 2.1) * 17 + Math.cos(y * .78) * 8
      : Math.sin(x * 1.55) * Math.sin(y * 1.54) * 9;
    const value = 145 + weave + (noise - .5) * (knitted ? 11 : 16), i = (y * 256 + x) * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(knitted ? 9 : 5, knitted ? 7 : 5);
  texture.anisotropy = 4;
  return texture;
}

function leatherTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(512, 512), cells = 64;
  const random = (x, y, seed) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 71.3) * 43758.5453;
    return n - Math.floor(n);
  };
  const features = [];
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++)
    features.push([.18 + random(x, y, 1) * .64, .18 + random(x, y, 2) * .64]);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const px = x / 8, py = y / 8, ix = Math.floor(px), iy = Math.floor(py);
    let nearest = Infinity, second = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cy = iy + dy, feature = features[((cy + cells) % cells) * cells + (cx + cells) % cells];
      const distance = Math.hypot(cx + feature[0] - px, cy + feature[1] - py);
      if (distance < nearest) { second = nearest; nearest = distance; }
      else if (distance < second) second = distance;
    }
    // Irregular tiny leather-grain creases, with no woven warp/weft pattern.
    const crease = Math.exp(-(second - nearest) * 16);
    const value = 142 - crease * 24 + (random(x, y, 8) - .5) * 5;
    const i = (y * 512 + x) * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 10); texture.anisotropy = 8;
  return texture;
}

/** One connected padded leather surface. Closely spaced samples at the seams
 * retain shallow 12–16 mm channels without opening gaps between separate cells. */
function headboardGeometry() {
  const width = 1.99, bottom = .03, top = 1.12, centreY = (bottom + top) / 2, height = top - bottom;
  const fractions = [0, .018, .035, .065, .12, .20, .31, .43, .5, .57, .69, .80, .88, .935, .965, .982, 1];
  const xs = [], ys = [bottom, .07, .13, .20, .26];
  for (let column = 0; column < 7; column++) for (const fraction of fractions)
    if (column === 0 || fraction > 0) xs.push(-width / 2 + (column + fraction) * width / 7);
  for (let row = 0; row < 3; row++) for (const fraction of fractions)
    if (row === 0 || fraction > 0) ys.push(.30 + (row + fraction) * (top - .30) / 3);
  const positions = [], uvs = [], indices = [], nx = xs.length, ny = ys.length;
  for (let row = 0; row < ny; row++) for (let column = 0; column < nx; column++) {
    const rawX = xs[column], y = ys[row], cornerRadius = .066;
    const verticalCorner = Math.max(0, Math.abs(y - centreY) - (height / 2 - cornerRadius));
    const rowHalfWidth = width / 2 - cornerRadius + Math.sqrt(Math.max(0, cornerRadius ** 2 - verticalCorner ** 2));
    const x = rawX / (width / 2) * rowHalfWidth;
    const tx = (rawX + width / 2) / (width / 7), ty = (y - .30) / ((top - .30) / 3);
    const cellX = tx - Math.floor(tx), cellY = ty - Math.floor(ty);
    const inflate = y >= .30 ? .017 * Math.pow(Math.max(0, Math.sin(Math.PI * cellX) * Math.sin(Math.PI * cellY)), .7) : 0;
    let xSeamDistance = Infinity, ySeamDistance = Infinity;
    for (let boundary = 1; boundary < 7; boundary++)
      xSeamDistance = Math.min(xSeamDistance, Math.abs(rawX - (-width / 2 + boundary * width / 7)));
    for (let boundary = 1; boundary < 3; boundary++)
      ySeamDistance = Math.min(ySeamDistance, Math.abs(y - (.30 + boundary * (top - .30) / 3)));
    const verticalSeam = y >= .30 ? Math.exp(-Math.pow(xSeamDistance / .007, 2)) : 0;
    const horizontalSeam = Math.exp(-Math.pow(ySeamDistance / .007, 2));
    // The channels are 7 mm deep; their intersections have only a further
    // 1.5 mm dimple. All use the same leather, with no dark buttons or piping.
    const seam = .007 * Math.max(verticalSeam, horizontalSeam) + .0015 * verticalSeam * horizontalSeam;
    const edge = Math.min(rowHalfWidth - Math.abs(x), y - bottom, top - y);
    const roll = smooth(edge / .055);
    const z = -1.007 + roll * (.090 + inflate - seam);
    positions.push(x, y, z); uvs.push((x + width / 2) / width, (y - bottom) / height);
    if (row + 1 < ny && column + 1 < nx) {
      const a = row * nx + column, b = a + 1, c = a + nx, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Continuous rounded edge strip and a closed rear surface overlap the soft
  // backing. Sharing the boundary vertices keeps the perimeter normals smooth.
  const border = [];
  for (let c = 0; c < nx; c++) border.push(c);
  for (let r = 1; r < ny; r++) border.push(r * nx + nx - 1);
  for (let c = nx - 2; c >= 0; c--) border.push((ny - 1) * nx + c);
  for (let r = ny - 2; r > 0; r--) border.push(r * nx);
  let previous = border;
  for (let ring = 1; ring <= 3; ring++) {
    const t = ring / 3, current = [];
    for (const index of border) {
      const i = index * 3, scale = 1 - .008 * smooth(t);
      current.push(positions.length / 3);
      positions.push(positions[i] * scale, centreY + (positions[i + 1] - centreY) * scale, -1.007 - .093 * t);
      uvs.push(uvs[index * 2], uvs[index * 2 + 1]);
    }
    for (let i = 0; i < border.length; i++) {
      const next = (i + 1) % border.length;
      indices.push(previous[i], current[i], previous[next], previous[next], current[i], current[next]);
    }
    previous = current;
  }
  const backCentre = positions.length / 3; positions.push(0, centreY, -1.10); uvs.push(.5, .5);
  for (let i = 0; i < previous.length; i++) indices.push(previous[i], backCentre, previous[(i + 1) % previous.length]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function sheetHeight(x, z) {
  const side = smooth((Math.abs(x) - .86) / .128);
  const foot = smooth((z - .93) / .17);
  const wave = Math.sin(x * 20 + z * 8) * .003 + Math.sin(x * 39 - z * 13) * .002;
  const ripple = Math.sin(z * 38 + x * 13) * .009 * side;
  return .532 + wave - side * .145 - foot * .115 + ripple;
}

function clothGeometry(width, from, to, { blanket = false } = {}) {
  const columns = 56, rows = blanket ? 28 : 54, positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, baseZ = from + (to - from) * v;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, baseX = (u - .5) * width;
      const side = smooth((Math.abs(baseX) - .86) / .128);
      const foot = blanket ? 0 : smooth((baseZ - .93) / .17);
      const foldedEdge = blanket ? Math.exp(-Math.pow((v - .14) / .10, 2)) : 0;
      // A restrained hem irregularity makes the drape soft, while staying
      // inside the nominal upholstered footprint.
      const x = baseX + side * Math.sin(baseZ * 24) * .004;
      const z = baseZ + (blanket ? Math.sin(baseX * 8 + v * 3) * .012 : foot * Math.sin(baseX * 30) * .003);
      // Both layers follow the SAME finished-position surface, including its
      // hanging sides. A small positive separation also covers interpolation
      // error between the two meshes' differently spaced triangle grids.
      const clearance = blanket ? .013 + .002 * (.5 + .5 * Math.sin(x * 18 + z * 9)) + foldedEdge * .006 : 0;
      const y = sheetHeight(x, z) + clearance;
      positions.push(x, y, z); uvs.push(u, v);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
        // Cloth faces up; material is two-sided for hanging hems.
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function seamGeometry(width, height, depth, plane = 'xy') {
  const points = [];
  for (let i = 0; i < 36; i++) {
    const angle = i / 36 * Math.PI * 2;
    const a = width / 2 * signPower(Math.cos(angle), .42);
    const b = height / 2 * signPower(Math.sin(angle), .42);
    points.push(plane === 'xy' ? new THREE.Vector3(a, b, depth) : new THREE.Vector3(a, depth, b));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 36, .0017, 3, true);
}

/** NICOROOM marshmallow-style upholstered bed, facing +Z, headboard at -Z.
 * Entire model is native geometry; no photograph is used as a bed cutout. */
export function buildBed() {
  const group = new THREE.Group(); group.name = '法式棉花糖软包床 · 2000 × 2250';
  const model = new THREE.Group(); group.add(model);
  const linen = fabricTexture(), knit = fabricTexture(true);
  const head = new THREE.MeshPhysicalMaterial({ name: '奶茶咖皮革软包床头', color: '#b49a83', roughness: .54, metalness: 0, ior: 1.45, specularIntensity: .65, clearcoat: .035, clearcoatRoughness: .5, bumpMap: leatherTexture(), bumpScale: .0002, envMapIntensity: .65 });
  head.userData.isBedLeather = true;
  const base = new THREE.MeshStandardMaterial({ name: '浅米色分块床围', color: '#d4c9b5', roughness: .94, bumpMap: linen, bumpScale: .00065 });
  const sheet = new THREE.MeshStandardMaterial({ name: '暖白棉质床单', color: '#eeeae1', roughness: .91, bumpMap: linen, bumpScale: .0003, side: THREE.DoubleSide });
  const mattressMaterial = new THREE.MeshStandardMaterial({ name: '白色床垫', color: '#e9e5dc', roughness: .88, bumpMap: linen, bumpScale: .0004 });
  const throwMaterial = new THREE.MeshStandardMaterial({ name: '浅灰针织搭毯', color: '#aaa8a4', roughness: .98, bumpMap: knit, bumpScale: .00125, side: THREE.DoubleSide });
  const cottonSeam = new THREE.MeshStandardMaterial({ name: '枕套细滚边', color: '#dfdacf', roughness: .96 });
  const dark = new THREE.MeshStandardMaterial({ name: '床底暗部', color: '#585047', roughness: .96 });
  const mesh = (name, geometry, material, x = 0, y = 0, z = 0) => {
    const object = new THREE.Mesh(geometry, material); object.name = name;
    object.position.set(x, y, z); object.castShadow = object.receiveShadow = true;
    model.add(object); return object;
  };
  const soft = (name, width, height, depth, material, x, y, z, exponent = .4, columns = 28, rows = 16) =>
    mesh(name, cushionGeometry(width, height, depth, exponent, columns, rows), material, x, y, z);

  // Low concealed supports and the upholstered carcass keep the bed grounded.
  for (const x of [-.72, .72]) for (const z of [-.68, .87])
    soft('隐藏床脚', .09, .07, .09, dark, x, .035, z, .45, 12, 8);
  soft('连续浅米床围基底', 1.95, .31, 2.01, base, 0, .17, .1025, .28, 32, 16);
  // Seven pillowy foot sections echo the seven columns of the headboard.
  for (let i = 0; i < 7; i++)
    soft(`床尾软包 ${i + 1}`, .279, .31, .20, base, (i - 3) * .278, .17, 1.025, .43, 24, 14);
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++)
    soft(`${side < 0 ? '左' : '右'}床围软包 ${i + 1}`, .19, .31, .333, base, side * .902, .17, -.747 + i * .332, .43, 24, 14);

  soft('床头皮革软包背板', 1.99, 1.09, .14, head, 0, .575, -1.055, .28, 32, 18).userData.isBedLeather = true;
  mesh('连续浅槽皮革床头 · 7列3排', headboardGeometry(), head).userData.isBedLeather = true;

  soft('圆角白床垫', 1.865, .195, 1.965, mattressMaterial, 0, .4225, .0825, .28, 40, 18);
  mesh('白床垫包边', seamGeometry(1.80, 1.90, .492, 'xz'), cottonSeam, 0, 0, .0825);
  mesh('自然下垂白床单', clothGeometry(1.976, -.875, 1.105), sheet);
  for (let i = 0; i < 2; i++) {
    const pillow = mesh(`白色枕头 ${i + 1}`, cushionGeometry(.775, .136, .49, .47, 36, 18, true), sheet,
      i === 0 ? -.419 : .419, .61, -.535 + i * .025);
    pillow.rotation.set(-.05, i === 0 ? -.028 : .035, i === 0 ? -.022 : .016);
    const piping = new THREE.Mesh(seamGeometry(.745, .455, -.012, 'xz'), cottonSeam);
    piping.name = '枕套滚边'; piping.castShadow = piping.receiveShadow = true; pillow.add(piping);
  }
  mesh('床尾浅灰针织搭毯', clothGeometry(1.995, .31, .93, { blanket: true }), throwMaterial);

  // A broad, low-opacity grounding shadow supplements real light shadows when
  // the room is in its overcast/evening mode. It stays inside the bed footprint.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 256;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(128, 128, 35, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(35,29,23,.38)'); gradient.addColorStop(.70, 'rgba(35,29,23,.25)'); gradient.addColorStop(1, 'rgba(35,29,23,0)');
  shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 256, 256);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({ name: '床底柔和接触阴影', map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false });
  const shadow = mesh('床底接触阴影', new THREE.PlaneGeometry(1.99, 2.235), shadowMaterial, 0, .008, 0);
  shadow.rotation.x = -Math.PI / 2; shadow.castShadow = shadow.receiveShadow = false; shadow.renderOrder = 1;

  // Explicitly fit all hems, soft edges, and shadow into the requested envelope.
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
  model.scale.set(2 / size.x, 1, 2.25 / size.z);
  model.position.set(-centre.x * model.scale.x, -bounds.min.y, -centre.z * model.scale.z);
  group.updateMatrixWorld(true);
  const finalBounds = new THREE.Box3().setFromObject(group), finalSize = finalBounds.getSize(new THREE.Vector3());
  group.userData.dimensions = { width: 2, length: 2.25, height: finalSize.y };
  group.userData.headDirection = '-z';

  return {
    group, dimensions: { ...group.userData.dimensions },
    dispose() {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
