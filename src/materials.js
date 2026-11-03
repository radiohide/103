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
    // Slight paper/fabric tooth, without a regular visible checker pattern.
    const tooth = (grain - .5) * 6.8 + (noise(x / 2.2, y / 2.2, 10) - .5) * 3.5;
    image.data[i] = clamp(213 + tooth + cloudy * 2);
    image.data[i + 1] = clamp(213 + tooth + cloudy * 2);
    image.data[i + 2] = clamp(204 + tooth + cloudy * 2);
    image.data[i + 3] = 255;
    relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = 98 + grain * 54;
    relief.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0); hc.putImageData(relief, 0, 0);
  return { map: texture(colour, { repeat: [6, 5] }), bumpMap: texture(height, { colour: false, repeat: [6, 5] }) };
}

function oakMaps() {
  const width = 512, height = 2048;
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
    const n = fbm(x / 150, y / 150, 45);
    const field = x + y * .56 + (fbm(x / 180, y / 180, 29) - .5) * 430;
    const line = Math.abs(Math.sin(field * .018 + .8));
    const mainVein = Math.exp(-line * line * 360);
    const fringe = Math.exp(-line * line * 28);
    const secondary = Math.exp(-Math.pow(Math.sin((field + noise(x / 70, y / 70, 9) * 80) * .035), 2) * 650) * .18;
    const tone = 222 + (n - .5) * 25 - mainVein * 78 - fringe * 15 - secondary * 55;
    const i = (y * 768 + x) * 4;
    image.data[i] = clamp(tone); image.data[i + 1] = clamp(tone + 1); image.data[i + 2] = clamp(tone - 2); image.data[i + 3] = 255;
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
