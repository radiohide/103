import { readFile, writeFile, mkdir } from 'node:fs/promises';
const modules = [
 ['three/core','vendor/three.core.js'],['three','vendor/three.module.js'],['reflector','vendor/Reflector.js'],
 ['materials','src/materials.js'],['bed','src/bed.js'],['room','src/room.js'],['app','src/app.js'],
];
const map = new Map([['./three.core.js','three/core'],['three','three'],['./Reflector.js','reflector'],['./materials.js','materials'],['./bed.js','bed'],['./room.js','room']]);
const names = list => list.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{const [local, exported]=s.split(/\s+as\s+/);return {local,exported:exported||local};});
const target = path => { if (!map.has(path)) throw Error(`Unmapped module ${path}`); return `__M[${JSON.stringify(map.get(path))}]`; };
function bundle(key, source) {
 const exports=[];
 let body=source.replace(/^[ \t]*export\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm,(_,list,from)=>{for(const n of names(list))exports.push(`${n.exported}:${target(from)}.${n.local}`);return '';});
 body=body.replace(/^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/gm,(_,list,from)=>`const {${names(list).map(n=>n.local===n.exported?n.local:`${n.local}:${n.exported}`).join(',')}}=${target(from)};`);
 body=body.replace(/^[ \t]*import\s*\*\s*as\s*([\w$]+)\s*from\s*['"]([^'"]+)['"]\s*;?/gm,(_,name,from)=>`const ${name}=${target(from)};`);
 body=body.replace(/^[ \t]*export\s*\{([\s\S]*?)\}\s*;?/gm,(_,list)=>{for(const n of names(list))exports.push(`${n.exported}:${n.local}`);return '';});
 body=body.replace(/^([ \t]*)export\s+((?:async\s+)?(?:const|let|var|function|class))\s+([\w$]+)/gm,(_,indent,kind,name)=>{exports.push(`${name}:${name}`);return `${indent}${kind} ${name}`;});
 if(/^[ \t]*(import|export)\b/m.test(body)||/import\.meta/.test(body))throw Error(`Unbundled module ${key}`);
 return `__M[${JSON.stringify(key)}]=(function(){\n'use strict';\n${body}\nreturn {${exports.join(',')}};\n})();`;
}
const photoURLs=[];
for(let i=1;i<=5;i++)photoURLs.push('data:image/jpeg;base64,'+(await readFile(`assets/photo-${i}.jpg`)).toString('base64'));
const chunks=[`const __PHOTOS=${JSON.stringify(photoURLs)};\nconst __M=Object.create(null);`];
for(const [key,file] of modules)chunks.push(bundle(key,await readFile(file,'utf8')));
const css=await readFile('src/style.css','utf8');
const page=(await readFile('src/index.html','utf8')).replace('/*__STYLE__*/',()=>css).replace('/*__BUNDLE__*/',()=>chunks.join('\n'));
await mkdir('dist',{recursive:true});await writeFile('dist/index.html',page);
console.log(`dist/index.html · ${(Buffer.byteLength(page)/1048576).toFixed(2)} MiB · fully self-contained`);
