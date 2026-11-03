import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildRoom } from './room.js';
import { Reflector } from './Reflector.js';

const $ = selector => document.querySelector(selector);
const photos = __PHOTOS;
const config = { width: 3.4, depth: 4.7, ceilingHeight: 2.7, soffitHeight: 2.4 };
const rad = n => n * Math.PI / 180;
let renderer, scene, camera, room, materials, sun, ambient, skylight, reflection, reflectionCamera, mirror;
const bronzeReflectors = [];
let currentView = 'window', photoIndex = 0, toastTimer, activeDrag = null, cameraTransition = null, lastTime = 0, nextReflection = 0;
let yaw = 0, pitch = 0, fov = 70, zoomScale = 1;
const keys = new Set();
const outdoorGroup = new THREE.Group();
const views = {
  window: { number: '01', name: '门口看窗', description: '灰木地板 · 转角采光窗', position: [1.08, 1.52, 1.85], target: [-.23, 1.23, -2.2], fov: 71 },
  back: { number: '02', name: '回望房门', description: '两级吊顶 · 长条风口 · 茶色玻璃', position: [.45, 1.52, -1.8], target: [-.05, 1.30, 2.3], fov: 75 },
  detail: { number: '03', name: '窗边细节', description: '窄边窗框 · 石材窗台 · 斜射日光', position: [.9, 1.5, -.15], target: [-.3, 1.19, -2.35], fov: 74 },
  overhead: { number: '04', name: '俯视空间', description: '3.4 × 4.7 m · 打通阳台', position: [3.8, 7.2, 5.3], target: [0, .25, 0], fov: 43 },
};
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600); }
function resize() {
  const el = $('#scene'), w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
function setAngles() {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  yaw = Math.atan2(-dir.x, -dir.z); pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
}
function applyLook() { camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')); }
function setView(name, instant = false) {
  const view = views[name]; if (!view) return;
  currentView = name; zoomScale = 1; fov = view.fov;
  const targetCamera = new THREE.PerspectiveCamera(); targetCamera.position.fromArray(view.position); targetCamera.lookAt(new THREE.Vector3(...view.target));
  cameraTransition = { from: camera.position.clone(), to: targetCamera.position.clone(), fromQ: camera.quaternion.clone(), toQ: targetCamera.quaternion.clone(), start: performance.now(), fromFov: camera.fov, toFov: fov };
  if (instant) { camera.position.copy(targetCamera.position); camera.quaternion.copy(targetCamera.quaternion); camera.fov = fov; camera.updateProjectionMatrix(); cameraTransition = null; setAngles(); }
  room.group.traverse(o => { if (o.userData.ceiling) o.visible = name !== 'overhead'; });
  if (room.ceilingGroup) room.ceilingGroup.visible = name !== 'overhead';
  bronzeReflectors.forEach(o => { o.visible = name !== 'overhead'; });
  outdoorGroup.visible = name !== 'overhead';
  scene.background.set(name === 'overhead' ? '#e6e5de' : '#b8cccf');
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === name); b.setAttribute('aria-pressed', String(b.dataset.view === name)); });
  $('#view-number').textContent = view.number; $('#view-name').textContent = view.name; $('#view-description').textContent = view.description;
  nextReflection = performance.now() + 700;
}

// Soft contact shading complements the sun's actual shadow map. It is applied
// to indirect light only: the moving sun patches keep their full brightness.
function addContactShading(material) {
  if (!material?.isMeshStandardMaterial || material.userData.contactShading) return;
  material.userData.contactShading = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.roomHeight = { value: config.ceilingHeight };
    material.userData.roomShader = shader;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 roomPosition; varying vec3 roomNormal;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nroomPosition=(modelMatrix*vec4(transformed,1.0)).xyz; roomNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 roomPosition; varying vec3 roomNormal; uniform float roomHeight;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      vec3 roomN=abs(normalize(roomNormal));
      float dx=max(0.0,1.7-abs(roomPosition.x));
      float dz=max(0.0,2.35-abs(roomPosition.z));
      float dy=max(0.0,min(roomPosition.y,roomHeight-roomPosition.y));
      float edge=roomN.y>.7?min(dx,dz):(roomN.x>.7?min(dy,dz):min(dx,dy));
      float shade=.73+.27*smoothstep(0.0,.27,edge);
      reflectedLight.indirectDiffuse*=shade;
      ${material === materials.bronzeGlass ? 'reflectedLight.directSpecular*=.06;' : ''}
    `);
  };
  material.customProgramCacheKey = () => material === materials.bronzeGlass ? 'bedroom-contact-v1-bronze' : 'bedroom-contact-v1-standard';
}
function createEnvironment() {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#a1a6a6');
  const shell = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 12), new THREE.MeshBasicMaterial({ color: '#b0b6b8', side: THREE.BackSide })); envScene.add(shell);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.7, 2.8), side: THREE.DoubleSide })); glow.position.set(0, 1, -6); envScene.add(glow);
  const pmrem = new THREE.PMREMGenerator(renderer); const map = pmrem.fromScene(envScene, .25, .1, 30); scene.environment = map.texture; scene.environmentIntensity = .18;
  pmrem.dispose(); shell.geometry.dispose(); shell.material.dispose(); glow.geometry.dispose(); glow.material.dispose();
}
function cropPhoto(image, corners, width = 900, height = 1100) {
  // A photograph supplies the view beyond the real window; all interior walls,
  // openings, surfaces and shadows remain geometry, independently navigable.
  const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight;
  const ctx = source.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  const input = ctx.getImageData(0, 0, source.width, source.height).data;
  const output = document.createElement('canvas'); output.width = width; output.height = height;
  const outCtx = output.getContext('2d'), frame = outCtx.createImageData(width, height), pixels = frame.data;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1), v = y / (height - 1);
    const px = ((1-u)*(1-v)*corners[0][0]+u*(1-v)*corners[1][0]+u*v*corners[2][0]+(1-u)*v*corners[3][0])*source.width;
    const py = ((1-u)*(1-v)*corners[0][1]+u*(1-v)*corners[1][1]+u*v*corners[2][1]+(1-u)*v*corners[3][1])*source.height;
    const ix = Math.max(0,Math.min(source.width-1,Math.round(px))), iy = Math.max(0,Math.min(source.height-1,Math.round(py))), a = (iy*source.width+ix)*4, b=(y*width+x)*4;
    pixels[b]=input[a];pixels[b+1]=input[a+1];pixels[b+2]=input[a+2];pixels[b+3]=255;
  }
  outCtx.putImageData(frame, 0, 0);
  const texture = new THREE.CanvasTexture(output); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}
function neutralWood(texture) {
  const canvas=texture.image, ctx=canvas.getContext('2d'), image=ctx.getImageData(0,0,canvas.width,canvas.height), {data}=image;
  const w=canvas.width,h=canvas.height,stride=w+1, integral=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){const i=(y*w+x)*4;sum+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;}}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const x0=Math.max(0,x-90),x1=Math.min(w,x+91),y0=Math.max(0,y-160),y1=Math.min(h,y+161),i=(y*w+x)*4;
    const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
    const detail=THREE.MathUtils.clamp((data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722-mean)*.75,-22,22);
    data[i]=107+detail;data[i+1]=106+detail;data[i+2]=102+detail;
  }
  ctx.putImageData(image,0,0);texture.needsUpdate=true;
}
async function outdoors() {
  const floorPhoto = new Image(); floorPhoto.src = photos[0]; await floorPhoto.decode();
  const realOak = cropPhoto(floorPhoto, [[.496,.768],[.540,.782],[.392,.995],[.322,.995]], 320, 1200);
  neutralWood(realOak);
  realOak.wrapS = realOak.wrapT = THREE.ClampToEdgeWrapping;
  for (const [i, mat] of [materials.wood, ...materials.woodVariants].entries()) {
    mat.map = realOak.clone(); mat.map.offset.set(i%2 ? 1 : 0, i%3 === 1 ? 1 : 0); mat.map.repeat.set(i%2 ? -1 : 1, i%3 === 1 ? -1 : 1);
    mat.bumpMap = mat.map.clone(); mat.bumpMap.colorSpace = THREE.NoColorSpace;
    mat.map.needsUpdate = mat.bumpMap.needsUpdate = true; mat.bumpScale = .00012; mat.roughness = .61; mat.needsUpdate = true;
  }
  const image = new Image(); image.src = photos[2]; await image.decode();
  const texture = cropPhoto(image, [[.168,.397],[.354,.401],[.355,.666],[.168,.700]], 1100, 1300);
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 6.9), new THREE.MeshBasicMaterial({ map: texture, color: '#eeeee9', toneMapped: false, side: THREE.DoubleSide }));
  backdrop.name = '实拍窗外建筑'; backdrop.position.set(-.75, 1.65, -5.5); outdoorGroup.add(backdrop);
  const treeImage = new Image(); treeImage.src = photos[3]; await treeImage.decode();
  const sideTexture = cropPhoto(treeImage, [[.394,.376],[.569,.331],[.571,.788],[.395,.720]], 750, 1200);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.75), new THREE.MeshBasicMaterial({ map: sideTexture, color: '#e9eee5', toneMapped: false, side: THREE.DoubleSide }));
  side.position.set(-4.2, 1.65, -2.25); side.rotation.y = Math.PI / 2; outdoorGroup.add(side); scene.add(outdoorGroup);
}
function updateSun() {
  const azimuth = +$('#sun-angle').value, altitude = +$('#sun-height').value, enabled = $('#sun-enabled').checked;
  const a = rad(azimuth), e = rad(altitude), radius = 16;
  sun.position.set(Math.sin(a)*Math.cos(e)*radius, Math.sin(e)*radius, -Math.cos(a)*Math.cos(e)*radius);
  sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); sun.intensity = enabled ? 3.8 : 0;
  renderer.toneMappingExposure = +$('#brightness').value / 100 * 1.04;
  $('#sun-angle-value').value = `${azimuth}°`; $('#sun-height-value').value = `${altitude}°`; $('#brightness-value').value = `${$('#brightness').value}%`;
  $('#light-state').innerHTML = `<i></i> ${enabled ? '自然日光' : '柔和天光'}`;
  nextReflection = performance.now() + 300;
}
const roomLights = new THREE.Group();
function setLights() {
  roomLights.visible = $('#lights-enabled').checked;
  materials.lightDiffuser.emissive = new THREE.Color(roomLights.visible ? '#ffdfae' : '#000000');
  materials.lightDiffuser.emissiveIntensity = roomLights.visible ? 1.8 : 0;
  nextReflection = performance.now() + 300;
}
function updateDoors() {
  const degrees = +$('#door-open').value;
  if (room.entryDoor) {
    room.entryDoor.rotation.y = (room.entryDoor.userData.closedRotation || 0) + rad(degrees);
  }
  if (room.bathDoor) {
    const { closedPosition, openPosition } = room.bathDoor.userData;
    room.bathDoor.position.x = THREE.MathUtils.lerp(closedPosition, openPosition, +$('#bath-open').value / 100);
  }
  $('#door-open-value').value = `${degrees}°`;
  $('#bath-open-value').value = +$('#bath-open').value === 0 ? '关闭' : +$('#bath-open').value === 100 ? '打开' : `${$('#bath-open').value}%`;
  nextReflection = performance.now() + 300;
}
function installLights() {
  roomLights.clear();
  const lamp = new THREE.PointLight('#ffe3bb', 4.5, 7, 2); lamp.position.set(0, config.ceilingHeight - .15, -.2); roomLights.add(lamp);
  const list = room.spots || [];
  for (const spot of list) {
    const light = new THREE.SpotLight('#ffe4ba', 4.5, 4, .65, .8, 2);
    const p = spot.isObject3D ? spot.getWorldPosition(new THREE.Vector3()) : spot.position || spot;
    light.position.set(p.x ?? p[0], (p.y ?? p[1]) - .04, p.z ?? p[2]); light.target.position.copy(light.position); light.target.position.y = 0;
    roomLights.add(light, light.target);
  }
  scene.add(roomLights); setLights();
}
function rebuild() {
  const top = +$('#ceiling-height').value, low = +$('#soffit-height').value;
  if (!Number.isFinite(top) || !Number.isFinite(low) || top < 2.5 || top > 3.2 || low < 2.1 || low > 2.7 || low > top - .1) {
    $('#ceiling-height').value = config.ceilingHeight; $('#soffit-height').value = config.soffitHeight; toast('中央顶面需比吊顶高至少 0.1 m'); return;
  }
  config.ceilingHeight = top; config.soffitHeight = low;
  for (const surface of [mirror, ...bronzeReflectors]) if (surface) { surface.dispose(); surface.geometry.dispose(); }
  mirror = null; bronzeReflectors.length = 0;
  scene.remove(room.group); room.dispose(); room = buildRoom(materials, config); scene.add(room.group); installMirror();
  room.group.traverse(o => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) { addContactShading(m); if (m.userData.roomShader) m.userData.roomShader.uniforms.roomHeight.value = top; } });
  installLights(); updateDoors(); setView(currentView, true);
  $('footer>span:nth-child(2)').textContent = `3.4 × 4.7 m · 吊顶 ${low} m / 中央 ${top} m`;
}
function updateReflection() {
  if (!reflectionCamera || currentView === 'overhead') return;
  const hidden = [];
  room.group.traverse(o => { if (o.isMesh && [materials.glass, materials.bronzeGlass].includes(o.material) && o.visible) { o.visible = false; hidden.push(o); } });
  for (const surface of [mirror, ...bronzeReflectors]) if (surface?.visible) { surface.visible = false; hidden.push(surface); }
  reflectionCamera.update(renderer, scene);
  hidden.forEach(o => o.visible = true);
  materials.bronzeGlass.envMap = reflection.texture; materials.bronzeGlass.envMapIntensity = .75;
  materials.glass.envMap = reflection.texture; materials.glass.envMapIntensity = .25;
}
function installMirror() {
  if (!room.bathroomMirror) return;
  const original = room.bathroomMirror;
  mirror = new Reflector(original.geometry.clone(), { color: '#aeb3ac', textureWidth: 768, textureHeight: 768, clipBias: .003 });
  mirror.position.copy(original.position); mirror.position.z -= .001; mirror.quaternion.copy(original.quaternion);
  original.visible = false; room.group.add(mirror);
  const panels = [];
  room.group.traverse(o => { if (o.isMesh && o.material === materials.bronzeGlass) panels.push(o); });
  for (const panel of panels) {
    const { width, height } = panel.geometry.parameters;
    const reflected = new Reflector(new THREE.PlaneGeometry(width, height), { textureWidth: 512, textureHeight: 768, clipBias: .002, multisample: 0 });
    reflected.name = '茶色玻璃实时反射';
    reflected.position.copy(panel.position); reflected.position.z -= .006;
    reflected.rotation.y = Math.PI;
    reflected.material.fragmentShader = reflected.material.fragmentShader.replace('vec4( blendOverlay( base.rgb, color ), 1.0 )', 'vec4( base.rgb * vec3(.32, .27, .20) + vec3(.012, .009, .006), .88 )');
    reflected.material.transparent = true; reflected.material.depthWrite = false;
    reflected.renderOrder = 3;
    panel.parent.add(reflected); bronzeReflectors.push(reflected);
  }
  // One reflected bounce avoids recursive render passes between facing glass.
  for (const surface of [mirror, ...bronzeReflectors]) {
    const renderReflection = surface.onBeforeRender;
    surface.onBeforeRender = function (...args) {
      const hidden = [mirror, ...bronzeReflectors].filter(o => o !== surface && o.visible);
      hidden.forEach(o => { o.visible = false; });
      try { renderReflection.apply(surface, args); }
      finally { hidden.forEach(o => { o.visible = true; }); }
    };
  }
}
function bindNavigation() {
  const el = renderer.domElement; el.tabIndex = 0;
  el.setAttribute('aria-label', '卧室三维画布：拖动环顾，WASD 移动，滚轮调整视野');
  el.addEventListener('pointerdown', e => { if (e.button !== 0) return; cameraTransition = null; setAngles(); activeDrag = { id:e.pointerId, x:e.clientX,y:e.clientY }; el.setPointerCapture(e.pointerId); el.focus({preventScroll:true}); });
  el.addEventListener('pointermove', e => { if (!activeDrag || e.pointerId !== activeDrag.id) return; yaw -= (e.clientX-activeDrag.x)*.0035; pitch = THREE.MathUtils.clamp(pitch-(e.clientY-activeDrag.y)*.0035, -1.45, 1.30); activeDrag.x=e.clientX;activeDrag.y=e.clientY; applyLook(); });
  const release = e => { if(activeDrag?.id!==e.pointerId)return;activeDrag=null;try{el.releasePointerCapture(e.pointerId);}catch{} };
  el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);
  el.addEventListener('wheel',e=>{e.preventDefault();cameraTransition=null;setAngles();zoomScale=THREE.MathUtils.clamp(zoomScale*Math.exp(e.deltaY*.0007),.65,1.25);camera.fov=THREE.MathUtils.clamp(fov*zoomScale,35,90);camera.updateProjectionMatrix();},{passive:false});
  window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||$('#photo-dialog').open)return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();keys.add(key);cameraTransition=null;setAngles();}if(e.key==='Escape'&&document.body.classList.contains('immersive')){document.body.classList.remove('immersive');resize();}});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();activeDrag=null;});
}
function frame(time) {
  const dt = Math.min(.05,(time-lastTime)/1000 || .016); lastTime=time;
  if(cameraTransition){const p=THREE.MathUtils.clamp((time-cameraTransition.start)/800,0,1),t=p*p*(3-2*p);camera.position.lerpVectors(cameraTransition.from,cameraTransition.to,t);camera.quaternion.slerpQuaternions(cameraTransition.fromQ,cameraTransition.toQ,t);camera.fov=THREE.MathUtils.lerp(cameraTransition.fromFov,cameraTransition.toFov,t);camera.updateProjectionMatrix();if(p===1){cameraTransition=null;setAngles();}}
  if(keys.size&&currentView!=='overhead'){
    const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
    const side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
    camera.position.x+=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*dt*.9;camera.position.z+=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*dt*.9;
    camera.position.x=THREE.MathUtils.clamp(camera.position.x,-1.50,1.50);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-2.12,2.12);
  }
  if(nextReflection&&time>nextReflection){nextReflection=0;updateReflection();}
  renderer.render(scene,camera);requestAnimationFrame(frame);
}
function showPhoto(index) {
  photoIndex=(index+photos.length)%photos.length;
  $('#reference-image').src=photos[photoIndex];$('#reference-image').alt=`卧室二现场照片 ${photoIndex+1}`;
  $('#photo-title').textContent=`照片 ${photoIndex+1} · ${['门与吊顶','房间光影','门口看窗','转角窗细节','墙面与浴室门'][photoIndex]}`;
  document.querySelectorAll('[data-photo]').forEach(b=>b.classList.toggle('active',+b.dataset.photo===photoIndex));
}
function bindUI() {
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#reset-camera').onclick=()=>setView(currentView);
  ['sun-angle','sun-height','brightness','sun-enabled'].forEach(id=>$('#'+id).addEventListener('input',updateSun));
  $('#reset-light').onclick=()=>{$('#sun-angle').value=31;$('#sun-height').value=32;$('#brightness').value=100;$('#sun-enabled').checked=true;updateSun();};
  $('#lights-enabled').onchange=setLights;$('#door-open').oninput=updateDoors;$('#bath-open').oninput=updateDoors;
  $('#ceiling-height').onchange=rebuild;$('#soffit-height').onchange=rebuild;
  $('#immersive').onclick=()=>{document.body.classList.toggle('immersive');resize();};
  $('#references').onclick=()=>{showPhoto(photoIndex);$('#photo-dialog').showModal();};$('#photo-close').onclick=()=>$('#photo-dialog').close();$('#photo-prev').onclick=()=>showPhoto(photoIndex-1);$('#photo-next').onclick=()=>showPhoto(photoIndex+1);
  $('#photo-tabs').replaceChildren(...photos.map((_,i)=>{const b=document.createElement('button');b.textContent=`0${i+1}`;b.dataset.photo=i;b.onclick=()=>showPhoto(i);return b;}));
  $('#photo-dialog').addEventListener('click',e=>{if(e.target===$('#photo-dialog'))$('#photo-dialog').close();});
  $('#save-image').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(!blob){toast('画面生成失败，请重试');return;}const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`卧室二-${views[currentView].name}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('已生成 PNG，正在下载');},'image/png');};
}
async function init() {
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  $('#scene').appendChild(renderer.domElement);scene=new THREE.Scene();scene.background=new THREE.Color('#b8cccf');
  camera=new THREE.PerspectiveCamera(71,1,.035,80);createEnvironment();
  materials=createMaterials();room=buildRoom(materials,config);scene.add(room.group);
  room.group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])addContactShading(m);});
  installMirror();
  ambient=new THREE.HemisphereLight('#edf3fa','#bab6ae',1.18);scene.add(ambient);
  skylight=new THREE.Group();
  for(const x of [-.85,.7]){const fill=new THREE.PointLight('#e4edf8',3.7,11,2);fill.position.set(x,1.65,-2.55);skylight.add(fill);}scene.add(skylight);
  sun=new THREE.DirectionalLight('#fff0d5',3.8);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:35});sun.shadow.bias=-.00012;sun.shadow.normalBias=.012;sun.shadow.radius=2;scene.add(sun,sun.target);
  reflection=new THREE.WebGLCubeRenderTarget(192,{type:THREE.HalfFloatType});reflectionCamera=new THREE.CubeCamera(.08,30,reflection);reflectionCamera.position.set(-.3,1.25,2.10);scene.add(reflectionCamera);
  await outdoors();installLights();updateSun();updateDoors();bindNavigation();bindUI();resize();setView('window',true);
  new ResizeObserver(resize).observe($('#scene'));requestAnimationFrame(frame);
  $('#loading').classList.add('loaded');setTimeout(()=>$('#loading').hidden=true,600);
}
init().catch(error=>{console.error(error);$('#loading').hidden=true;$('#error').hidden=false;$('#error').textContent=`场景载入失败：${error.message}。请使用支持 WebGL 2 的浏览器，并开启硬件加速。`;});
