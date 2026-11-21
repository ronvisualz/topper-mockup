/* mockup v6.3 — the theatre from Blender (plan §14, phase C), loaded as scenery for the Work page's 3D stage.
   Everything static shows its baked light as it came out of Cycles (through the same AgX view): no real-time light on it.
   Two light states, «sala acesa» and «espetáculo», are mixed per pixel (uMix 0 → 1). The seats are one seat with its
   own map, instanced, each instance carrying its own light level per state. The curtains and the valance come with
   their pleats from Blender but no baked light: the stage shades them (so they can open and close).
   Files (assets/theatre/): theatre.glb.js, seat.glb.js, curtains.glb.js, hat-stage.glb.js, lm-*.jpg, seats.json. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DIR = new URL('../assets/theatre/', import.meta.url).href;
async function glb(name) {
  const b64 = (await import(DIR + name + '.js')).default, bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new GLTFLoader().parseAsync(bin.buffer, '');
}
function tex(name) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(DIR + name, t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4; res(t); }, undefined, rej));
}
/* a material with no light of its own: the two baked states, mixed */
function baked(a, b) {
  const m = new THREE.MeshBasicMaterial({ map: a, toneMapped: false });
  m.userData.uMix = { value: 0 }; m.userData.mapB = { value: b };
  m.onBeforeCompile = sh => {
    sh.uniforms.uMix = m.userData.uMix; sh.uniforms.mapB = m.userData.mapB;
    sh.fragmentShader = 'uniform sampler2D mapB;\nuniform float uMix;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      // highlights compressed above ~60% of display brightness (linear 0.31), at 15%: on the site the film keeps the file's own
      // colours, so the baked lamps' glow and the pilasters' friezes must stay under it (nothing passes ~67%)
      'vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( mapB, vMapUv ), uMix );' +
      ' float lumK = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );' +
      ' if ( lumK > 0.31 ) sampledDiffuseColor.rgb *= ( 0.31 + ( lumK - 0.31 ) * 0.15 ) / lumK;' +
      ' diffuseColor *= sampledDiffuseColor;');
  };
  m.customProgramCacheKey = () => 'baked-mix';
  return m;
}

/* the brand hat for the stage (≤ 3 000 triangles): white shell repainted in a Brand Kit colour, black trim, red lining */
let hatSrc = null;
export async function loadHat() {
  if (!hatSrc) hatSrc = glb('hat-stage.glb').then(g => { let geo = null; g.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; }); return geo; });
  return hatSrc;
}
export function paintHat(geo, hex) {
  const g = geo.clone(), c = g.getAttribute('color'), col = new THREE.Color().setHex(hex), n = c.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = c.getX(i), gg = c.getY(i), b = c.getZ(i), white = r > 0.9 && gg > 0.9 && b > 0.9;
    out.set(white ? [col.r, col.g, col.b] : [r, gg, b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}

let theatreOnce = null;
export function loadTheatre() { return theatreOnce || (theatreOnce = loadTheatreNow()); }   // one load, shared: the page starts it at boot
async function loadTheatreNow() {
  const t0 = performance.now();
  const [th, seatG, curt, seatsJson, ...maps] = await Promise.all([glb('theatre.glb'), glb('seat.glb'), glb('curtains.glb'), fetch(DIR + 'seats.json').then(r => r.json()),
    tex('lm-arch-acesa.jpg'), tex('lm-arch-espetaculo.jpg'), tex('lm-hall-acesa.jpg'), tex('lm-hall-espetaculo.jpg'), tex('lm-seat-acesa.jpg'), tex('lm-seat-espetaculo.jpg')]);
  const [archA, archB, hallA, hallB, seatA, seatB] = maps;
  const group = new THREE.Group(); group.name = 'theatre';
  const mats = [];
  th.scene.traverse(o => {
    if (!o.isMesh) return;
    const n = o.name.toLowerCase();
    if (n.includes('black')) o.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    else { o.material = n.includes('arch') ? baked(archA, archB) : baked(hallA, hallB); mats.push(o.material); }
    o.matrixAutoUpdate = false;
  });
  group.add(th.scene);
  // the seats: one mesh, instanced
  let seatGeo = null; seatG.scene.traverse(o => { if (o.isMesh && !seatGeo) seatGeo = o.geometry; });
  const seatMat = baked(seatA, seatB); mats.push(seatMat);
  const S = seatsJson.seats, L = seatsJson.levels, seats = new THREE.InstancedMesh(seatGeo, seatMat, S.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  S.forEach(([x, y, z, yaw], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, yaw), one); seats.setMatrixAt(i, m4); seats.setColorAt(i, new THREE.Color(1, 1, 1)); });
  seats.instanceMatrix.needsUpdate = true; group.add(seats);
  // the curtains: closed panels with an «open» morph (moved on the CPU, so any shader can shade them)
  const cloth = {};
  curt.scene.traverse(o => { if (o.isMesh) cloth[o.name] = o; });
  const panels = ['Curtain_L', 'Curtain_R'].map(n => cloth[n]).filter(Boolean).map(m => {
    const g = m.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    const dp = g.morphAttributes.position && g.morphAttributes.position[0], dn = g.morphAttributes.normal && g.morphAttributes.normal[0];
    const base = pos.array.slice(), baseN = nor ? nor.array.slice() : null;
    g.morphAttributes = {}; m.morphTargetInfluences = undefined; m.morphTargetDictionary = undefined;
    return { mesh: m, set(k) {
      for (let i = 0; i < base.length; i++) pos.array[i] = base[i] + (dp ? dp.array[i] * k : 0);
      if (baseN && dn) for (let i = 0; i < baseN.length; i++) nor.array[i] = baseN[i] + dn.array[i] * k;
      pos.needsUpdate = true; if (nor) nor.needsUpdate = true; g.computeBoundingSphere();
    } };
  });
  const curtains = new THREE.Group(); curtains.name = 'theatre-curtains';
  for (const k of Object.keys(cloth)) curtains.add(cloth[k]);
  group.add(curtains);
  let mix = 0;
  return {
    group, curtains, valance: cloth.SM_Valance, braid: cloth.SM_Valance_Braid, panels: panels.map(p => p.mesh), seats,
    loadMs: Math.round(performance.now() - t0),
    setOpen(k) { panels.forEach(p => p.set(k)); },                 // 0 closed → 1 open
    setLight(k) {                                                  // 0 «sala acesa» → 1 «espetáculo»
      mix = k; for (const m of mats) m.userData.uMix.value = k;
      const c = new THREE.Color(); S.forEach((_, i) => { const v = (L.acesa[i] ?? 1) * (1 - k) + (L.espetaculo[i] ?? 1) * k; seats.setColorAt(i, c.setScalar(v)); }); seats.instanceColor.needsUpdate = true;
    },
    get light() { return mix; },
    textures: maps
  };
}
