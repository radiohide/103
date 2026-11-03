import * as THREE from 'three';

// The build embeds the original generated painting; this scene stays one HTML.
const IMAGE = '__SUNFLOWER_DATA_URL__';
export function buildSunflowerArtwork() {
  const group = new THREE.Group(); group.name = '朝床柜背 · 向日葵油画';
  // Local +Z faces the bedroom after a half turn about Y.
  group.position.set(-.525, 1.45, 1.074); group.rotation.y = Math.PI;
  const texture = new THREE.TextureLoader().load(IMAGE);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const oak = new THREE.MeshStandardMaterial({name:'细橡木画框',color:'#ad8052',roughness:.62});
  const mat = new THREE.MeshStandardMaterial({name:'暖白装裱卡纸',color:'#f3eee1',roughness:.95});
  const backing = new THREE.MeshStandardMaterial({name:'画框背板',color:'#71604b',roughness:.9});
  const paint = new THREE.MeshStandardMaterial({name:'向日葵油画画布',map:texture,roughness:.88});
  const geometries = [];
  function box(name,w,h,d,x,y,z,material) {
    const geometry = new THREE.BoxGeometry(w,h,d); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry,material); mesh.name=name;
    mesh.position.set(x,y,z); mesh.castShadow=mesh.receiveShadow=true; group.add(mesh); return mesh;
  }
  const width=.76,height=.96,rim=.018;
  box('画框薄背板',width-.014,height-.014,.010,0,0,.008,backing);
  for(const x of [-(width-rim)/2,(width-rim)/2]) box('竖向细木框',rim,height,.029,x,0,.023,oak);
  for(const y of [-(height-rim)/2,(height-rim)/2]) box('横向细木框',width-rim*2,rim,.029,0,y,.023,oak);
  box('暖白窄装裱边',width-rim*2,height-rim*2,.003,0,0,.019,mat);
  const canvas = new THREE.PlaneGeometry(.60,.80); geometries.push(canvas);
  const painting = new THREE.Mesh(canvas,paint); painting.name='向日葵原画'; painting.position.z=.021;
  painting.receiveShadow=true; group.add(painting);
  group.userData.dimensions = {width,height,imageWidth:.60,imageHeight:.80,centreHeight:1.45,projection:.0375};
  let disposed=false;
  return {group,dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of [oak,mat,backing,paint])m.dispose();texture.dispose();group.clear();}};
}
