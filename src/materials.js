import * as THREE from 'three';

// All surfaces are generated locally. Colour maps are sRGB; height maps retain
// linear data, so a warmer exposure does not exaggerate the micro relief.
const clamp = (n, a = 0, b = 255) => Math.max(a, Math.min(b, n));
const fract = x => x - Math.floor(x);
const smooth = x => x * x * (3 - 2 * x);
const hash = (x, y, seed = 0) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 67.13) * 43758.5453123);
function noise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), sx = smooth(x - ix), sy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x, y, seed = 0) {
  return noise(x, y, seed) * .57 + noise(x * 2.07, y * 2.07, seed + 1) * .27 + noise(x * 4.17, y * 4.17, seed + 2) * .16;
}
function canvas(width, height = width) {
  const element = document.createElement('canvas');
  element.width = width; element.height = height;
  return element;
}
function texture(image, { colour = true, repeat = [1, 1] } = {}) {
  const map = new THREE.CanvasTexture(image);
  map.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(...repeat); map.anisotropy = 8;
  return map;
}
function surface(name, properties) {
  const result = new THREE.MeshStandardMaterial(properties);
  result.name = name;
  return result;
}

function plasterMaps() {
  const colour = canvas(512), height = canvas(512);
  const ctx = colour.getContext('2d'), hc = height.getContext('2d');
  const image = ctx.createImageData(512, 512), relief = hc.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const grain = hash(x, y, 18), cloudy = fbm(x / 65, y / 65, 6) - .5;
    // A subdued woven tooth: elongated, irregular fibres rather than coarse
    // white-noise speckles or a conspicuous regular fabric grid.
    const fibres = (noise(x / 1.8, y / 22, 24) - .5) * 2.5
      + (noise(x / 19, y / 2.3, 28) - .5) * 1.3;
    const tooth = (grain - .5) * 3.7 + (noise(x / 2.2, y / 2.2, 10) - .5) * 2.1 + fibres;
    image.data[i] = clamp(213 + tooth + cloudy * 2);
    image.data[i + 1] = clamp(213 + tooth + cloudy * 2);
    image.data[i + 2] = clamp(204 + tooth + cloudy * 2);
    image.data[i + 3] = 255;
    relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = 113 + grain * 27 + fibres * 3.1;
    relief.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0); hc.putImageData(relief, 0, 0);
  return { map: texture(colour, { repeat: [6, 5] }), bumpMap: texture(height, { colour: false, repeat: [6, 5] }) };
}

function oakMaps() {
  // Lightweight fallback; the application replaces this with the embedded
  // photograph before the first frame, so large generated maps only delay loading.
  const width = 128, height = 512;
  const colour = canvas(width, height), relief = canvas(width, height);
  const ctx = colour.getContext('2d'), hc = relief.getContext('2d');
  const image = ctx.createImageData(width, height), bump = hc.createImageData(width, height);
  const knots = [{ x: 154, y: 532, radius: 24 }, { x: 412, y: 1590, radius: 17 }];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let bend = 12 * Math.sin(y * .0043) + 5 * Math.sin(y * .0108 + .5);
    let knotTone = 0;
    for (const knot of knots) {
      const dx = (x - knot.x) / knot.radius, dy = (y - knot.y) / (knot.radius * 5.5);
      const r = Math.sqrt(dx * dx + dy * dy);
      bend += dx * 24 * Math.exp(-r * r * .32);
      knotTone -= 25 * Math.exp(-r * r * 2.7);
      knotTone += Math.sin(r * 15) * 3.8 * Math.exp(-r * .8);
    }
    const xx = x + bend + (noise(x / 80, y / 400, 14) - .5) * 17;
    const band = noise(xx / 18, y / 660, 9) - .5;
    const grain = Math.sin(xx * .37 + noise(xx / 70, y / 440, 32) * 7);
    const fine = Math.pow(Math.max(0, Math.sin(xx * 1.57 + Math.sin(y * .0017) * 4)), 9);
    const pores = hash(x, y, 17) > .97 ? -6 : 0;
    const weather = fbm(x / 120, y / 260, 11) - .5;
    const light = band * 22 + grain * 3.8 - fine * 5 + weather * 9 + knotTone + pores + (hash(x, y, 21) - .5) * 2.4;
    const i = (y * width + x) * 4;
    image.data[i] = clamp(100 + light);
    image.data[i + 1] = clamp(99 + light * .97);
    image.data[i + 2] = clamp(89 + light * .88);
    image.data[i + 3] = 255;
    bump.data[i] = bump.data[i + 1] = bump.data[i + 2] = clamp(130 + grain * 8 - fine * 18 + band * 16 + pores);
    bump.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0); hc.putImageData(bump, 0, 0);
  return { map: texture(colour), bumpMap: texture(relief, { colour: false }) };
}

function marbleMaps() {
  const c = canvas(768), ctx = c.getContext('2d');
  const image = ctx.createImageData(768, 768);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 768; x++) {
    // Large pale mineral clouds establish the stone before its sparse veins.
    // Bounded domain warping keeps the strata diagonal: no repeating sine
    // contours, closed loops or heavy black meanders.
    const cloud = fbm((x + y * .22) / 230, y / 165, 45);
    const haze = fbm(x / 390, y / 340, 51);
    const drift = (noise(x / 270, y / 270, 29) - .5) * 78
      + (noise(x / 72, y / 105, 41) - .5) * 15;
    const field = x * .76 + y * .56 + drift;
    const mineral = Math.exp(-Math.pow((field - 505) / 112, 2)) * (.55 + haze * .45);
    let veins = 0, feather = 0;
    for (const [index, centre] of [174, 523, 884].entries()) {
      const distance = Math.abs(field - centre);
      const broken = .22 + .78 * smooth(noise(x / 95, y / 135, 63 + index));
      veins += Math.exp(-Math.pow(distance / (1.05 + index * .2), 2)) * broken;
      feather += Math.exp(-Math.pow(distance / (7 + index * 2), 2)) * broken;
    }
    // A few fine offshoots join a parent vein and fade into the cloud layer.
    const branchLength = 285, branchT = clamp((y - 204) / branchLength, 0, 1);
    const branchGate = y >= 204 && y <= 204 + branchLength ? Math.pow(1 - branchT, .8) : 0;
    const branchDistance = Math.abs(field - (523 - branchT * 102 + noise(y / 70, 2, 81) * 3));
    const branch = Math.exp(-Math.pow(branchDistance / .72, 2)) * branchGate;
    const fineDust = (hash(x, y, 92) - .5) * .65;
    const tone = 233 + (cloud - .5) * 21 + (haze - .5) * 8
      - mineral * 7 - veins * 43 - feather * 7 - branch * 24 + fineDust;
    const i = (y * 768 + x) * 4;
    image.data[i] = clamp(tone - .5); image.data[i + 1] = clamp(tone + .4); image.data[i + 2] = clamp(tone + .8); image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return texture(c);
}

export function createMaterials() {
  const plaster = plasterMaps(), oak = oakMaps();
  const wall = surface('米白细纹墙面', { ...plaster, color: '#ffffff', roughness: .94, bumpScale: .00055 });
  const ceiling = surface('哑光白色吊顶', { color: '#e3e3d9', roughness: .98 });
  const wood = surface('灰橡木地板', { ...oak, color: '#ffffff', roughness: .73, bumpScale: .0012, metalness: 0 });
  const woodVariants = [];
  for (let i = 0; i < 6; i++) {
    const material = wood.clone();
    material.name = `灰橡木地板 ${i + 1}`;
    material.map = oak.map.clone(); material.bumpMap = oak.bumpMap.clone();
    material.map.offset.set((i * .173) % 1, (i * .271) % 1);
    material.bumpMap.offset.copy(material.map.offset);
    material.map.repeat.set(i % 2 ? -1 : 1, .63 + (i % 3) * .13);
    material.bumpMap.repeat.copy(material.map.repeat);
    material.map.needsUpdate = material.bumpMap.needsUpdate = true;
    material.color.setScalar([1, .96, 1.045, 1.015, .94, 1.03][i]);
    woodVariants.push(material);
  }
  const glass = new THREE.MeshPhysicalMaterial({ name: '清透窗玻璃', color: '#c5d5ce', transparent: true, opacity: .105, roughness: .085, metalness: .08, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: .75 });
  const bronzeGlass = new THREE.MeshPhysicalMaterial({ name: '茶色反射推拉玻璃', color: '#504737', transparent: true, opacity: .82, roughness: .11, metalness: .72, envMapIntensity: 1.0, side: THREE.DoubleSide });
  return {
    wall, ceiling, wood, woodVariants,
    woodEdge: surface('木地板端面与微缝', { color: '#57574f', roughness: .9 }),
    blackMetal: surface('炭黑窄边铝合金', { color: '#242b2b', roughness: .32, metalness: .72 }),
    brushedMetal: surface('拉丝金属五金', { color: '#a3a6a2', roughness: .27, metalness: .9 }),
    glass, bronzeGlass,
    stone: surface('浅灰石材窗台', { color: '#b7b8ac', roughness: .58, bumpMap: plaster.bumpMap, bumpScale: .00025 }),
    marble: surface('灰白纹大理石', { color: '#ffffff', map: marbleMaps(), roughness: .27 }),
    door: surface('米白木门', { color: '#d9d8cb', roughness: .68 }),
    blackPlastic: surface('深灰开关面板', { color: '#222928', roughness: .47, metalness: .08 }),
    lightDiffuser: surface('乳白灯罩', { color: '#d8dce0', emissive: '#c4d3db', emissiveIntensity: .035, roughness: .43 }),
    ground: surface('卫生间灰石地砖', { color: '#696e69', roughness: .72, bumpMap: plaster.bumpMap, bumpScale: .0007 }),
  };
}
