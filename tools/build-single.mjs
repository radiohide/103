/**
 * Bundles dist/ (the sources) into one self-contained HTML file (no server, opens from file://).
 * Default output: dist-single/index.html — this is the project's default build artifact.
 * Usage: node tools/build-single.mjs [outfile]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const read = file => readFile(path.join(dist, file), 'utf8');

// key = the specifier name used inside the bundle, file = source in dist/
const MODULES = [
  { key: 'three/core', file: 'vendor/three.core.js' },
  { key: 'three', file: 'vendor/three.module.js' },
  { key: 'three/OrbitControls', file: 'vendor/OrbitControls.js' },
  { key: 'app/measurement', file: 'src/measurement.js' },
  { key: 'app/model', file: 'src/model.js' },
  { key: 'app/scene', file: 'src/scene.js' },
  { key: 'app/app', file: 'src/app.js' },
];

const SPECIFIERS = new Map([
  ['./three.core.js', 'three/core'],
  ['three', 'three'],
  ['three/addons/controls/OrbitControls.js', 'three/OrbitControls'],
  ['./measurement.js', 'app/measurement'],
  ['./model.js', 'app/model'],
  ['./scene.js', 'app/scene'],
]);

const resolveSpecifier = from => {
  const key = SPECIFIERS.get(from);
  if (!key) throw new Error(`Unmapped module specifier: ${from}`);
  return key;
};

const parseNames = list => list
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean)
  .map(entry => {
    const [local, exported] = entry.split(/\s+as\s+/).map(part => part.trim());
    return { local, exported: exported || local };
  });

/** Rewrites one ES module into an IIFE that publishes its exports into __M. */
function toModule(key, source) {
  const exports = [];
  let body = source;

  // export { a, b as c } from './x.js';
  body = body.replace(/^[ \t]*export\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm, (_m, names, from) => {
    const target = `__M[${JSON.stringify(resolveSpecifier(from))}]`;
    for (const { local, exported } of parseNames(names)) exports.push(`${exported}: ${target}.${local}`);
    return '';
  });

  // import { a, b as c } from './x.js';
  body = body.replace(/^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm, (_m, names, from) => {
    const bindings = parseNames(names).map(({ local, exported }) => (local === exported ? local : `${local}: ${exported}`));
    return `const { ${bindings.join(', ')} } = __M[${JSON.stringify(resolveSpecifier(from))}];`;
  });

  // import * as NS from './x.js';
  body = body.replace(/^[ \t]*import\s*\*\s*as\s*([\w$]+)\s*from\s*['"]([^'"]+)['"]\s*;?/gm,
    (_m, ns, from) => `const ${ns} = __M[${JSON.stringify(resolveSpecifier(from))}];`);

  // export { a, b as c };
  body = body.replace(/^[ \t]*export\s*\{([\s\S]*?)\}\s*;?/gm, (_m, names) => {
    for (const { local, exported } of parseNames(names)) exports.push(`${exported}: ${local}`);
    return '';
  });

  // export default ...
  body = body.replace(/^[ \t]*export\s+default\s+/gm, () => {
    exports.push('default: __default');
    return 'const __default = ';
  });

  // export const|let|var|function|class|async function NAME
  body = body.replace(/^([ \t]*)export\s+((?:async\s+)?(?:const|let|var|function|class))\s+([\w$]+)/gm, (_m, indent, kw, name) => {
    exports.push(`${name}: ${name}`);
    return `${indent}${kw} ${name}`;
  });

  const leftovers = [...body.matchAll(/^[ \t]*(import|export)\b.*$/gm)].map(m => m[0].trim());
  if (leftovers.length) throw new Error(`Unhandled ESM syntax in ${key}:\n${leftovers.slice(0, 5).join('\n')}`);
  if (/import\.meta/.test(body)) throw new Error(`${key} still references import.meta`);

  const returned = exports.length ? `{\n${exports.map(line => `  ${line},`).join('\n')}\n}` : '{}';
  return `// ---- ${key} ----\n__M[${JSON.stringify(key)}] = (function () {\n'use strict';\n${body}\n;return ${returned};\n})();\n`;
}

const pngBase64 = (await readFile(path.join(dist, 'assets/reference.png'))).toString('base64');
const referenceUrl = `data:image/png;base64,${pngBase64}`;

const chunks = [];
for (const { key, file } of MODULES) {
  let source = await read(file);
  if (key === 'app/model') source = source.replace(`'./assets/reference.png'`, '__REFERENCE_IMAGE_URL');
  if (key === 'app/scene') source = source.replace(`new URL('../assets/reference.png', import.meta.url).href`, '__REFERENCE_IMAGE_URL');
  chunks.push(toModule(key, source));
}

const bundle = [
  '/* 居所 · 户型编辑器 —— 单文件构建（自动生成，请勿手改；改动请编辑 dist/ 后重新运行 tools/build-single.mjs） */',
  `const __REFERENCE_IMAGE_URL = ${JSON.stringify(referenceUrl)};`,
  'const __M = Object.create(null);',
  ...chunks,
].join('\n');

const css = await read('style.css');
const html = (await read('index.html'))
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace('<script type="module" src="./src/app.js"></script>', () => `<script type="module">\n${bundle}\n</script>`);

if (html.includes('./style.css') || html.includes('importmap') || html.includes('src="./src/app.js"')) {
  throw new Error('index.html was not fully inlined');
}

const outFile = path.resolve(root, process.argv[2] || 'dist-single/index.html');
await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, html, 'utf8');
console.log(`${path.relative(root, outFile).replace(/\\/g, '/')}  ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MiB`);
