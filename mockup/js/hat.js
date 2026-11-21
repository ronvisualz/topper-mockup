/* mockup v6 — the hat. One transparent WebGL canvas over the page draws the v5 hat (meshopt-free copy),
   posed in screen space: pose({ x, y, h }) puts its centre at viewport fractions x, y with a height of h screen heights.
   If WebGL or the model fails, the brand icon stands in with the same interface. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, EASE, frameStats } from './util.js';

const LOOKS = [
  null,                                                                                                   // felt: the hat as it is
  { shell: { color: 0x81cfe3, roughness: 0.82, sheen: 0.3, sheenColor: 0xe6f7fc }, trim: { color: 0x1b2a44, roughness: 0.7 } },     // clay
  { shell: { color: 0xbfe8f2, roughness: 0.04, transmission: 1, thickness: 0.9, ior: 1.45, attenuationColor: 0x5fb8d6, attenuationDistance: 1.4 }, trim: { color: 0x101012, roughness: 0.25, clearcoat: 1 } },   // glass
  { shell: { color: 0xd9a441, metalness: 1, roughness: 0.28 }, trim: { color: 0x101012, roughness: 0.5 } },                        // gold
  { shell: { color: 0x2f77b1, roughness: 0.18, transmission: 0.65, thickness: 1.2, ior: 1.35, attenuationColor: 0x0d2f57, attenuationDistance: 0.9, clearcoat: 1 }, trim: { color: 0xffffff, roughness: 0.3 } },   // jelly
  { shell: { color: 0xffffff, metalness: 1, roughness: 0.06 }, trim: { color: 0x101012, roughness: 0.35, clearcoat: 1 } }         // chrome
];
const SPIN_MS = 1150, SWAP_MS = 320, D = 10, FOV = 30;

export async function createHat(canvas, url, { fallbackSrc, reduced = () => false, source = null } = {}) {
  try { return await glHat(canvas, url, reduced, source); }
  catch (e) { console.warn('[mockup] 3D hat unavailable, using the icon', e); canvas.hidden = true; return imgHat(fallbackSrc, reduced); }
}

async function glHat(canvas, url, reduced, source) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no webgl');
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100); camera.position.set(0, 0, D); camera.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.4); key.position.set(2, 5, 6); scene.add(key);
  const rimA = new THREE.DirectionalLight(0xffeab0, 2.2); rimA.position.set(-5, 2.5, -4); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(0x81cfe3, 2.0); rimB.position.set(5, 1.8, -3.5); scene.add(rimB);

  // the model ships as a script module (base64 of the .glb): the artifact host serves no .glb, and parsing needs no fetch
  let gltf;
  if (/\.js$/.test(url)) {
    // source: the base64 already fetched by the page (with progress); otherwise the module itself
    const b64 = (source && await source.catch(() => null)) || (await import(url)).default, bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    gltf = await new GLTFLoader().parseAsync(bin.buffer, '');
  } else gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene.getObjectByName('Hat') || gltf.scene;
  const body = new THREE.Group(); body.add(root);
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
  root.position.sub(c);
  const H = box.max.y - box.min.y, W = box.max.x - box.min.x, bottom = box.min.y - c.y;
  const hat = new THREE.Group(); hat.add(body); scene.add(hat);
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = (o.name + ' ' + (o.parent ? o.parent.name : '')).toLowerCase();
    o.userData.role = n.includes('lining') ? 'lining' : (n.includes('crown') || (n.includes('brim') && !n.includes('binding'))) ? 'shell' : 'trim';
    meshes.push(o);
  });
  // the lining: the brand red #E02727, shaded only toward black, never lighter (colours written as-is, no tone mapping)
  const liningMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uRed: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uRed; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; float l = clamp(dot(n, normalize(vec3(0.3, 0.7, 0.6))), 0.0, 1.0); float f = clamp(dot(n, normalize(vV)), 0.0, 1.0); float k = 0.5 + 0.3 * smoothstep(0.0, 0.6, f) + 0.2 * l; gl_FragColor = vec4(uRed * min(k, 1.0), 1.0); }'
  });
  // ShaderMaterial colours are sRGB values used directly: keep them out of the linear conversion
  liningMat.uniforms.uRed.value.setHex(0xe02727, THREE.LinearSRGBColorSpace);
  for (const m of meshes) if (m.userData.role === 'lining') m.material = liningMat;
  const base = new Map(meshes.map(m => [m, m.material]));
  const built = LOOKS.map(look => look && Object.fromEntries(['shell', 'trim'].map(role => {
    const o = Object.assign({ envMapIntensity: 0.7 }, look[role]);
    for (const k of ['color', 'sheenColor', 'attenuationColor']) if (o[k] != null) o[k] = new THREE.Color(o[k]);
    return [role, new THREE.MeshPhysicalMaterial(o)];
  })));
  let look = 0;
  function setLook(k) {
    look = ((k % LOOKS.length) + LOOKS.length) % LOOKS.length;
    for (const m of meshes) {
      const b = base.get(m), role = m.userData.role;
      if (!built[look] || role === 'lining') { m.material = b; continue; }
      const mat = built[look][role];
      if (b.aoMap && !mat.aoMap) { mat.aoMap = b.aoMap; mat.needsUpdate = true; }
      m.material = mat;
    }
  }
  // compile every look once so the first tap never stutters
  for (let k = 1; k < LOOKS.length; k++) { setLook(k); renderer.compile(scene, camera); } setLook(0);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v = new THREE.Vector3();
  // a few hundred real surface points (body space) give a tight screen box, unlike the rotated bounding box
  const corners = [];
  hat.updateMatrixWorld(true);
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, stride = Math.max(1, Math.floor(pos.count / 160));
    for (let i = 0; i < pos.count; i += stride) { const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); p.role = m.userData.role; corners.push(p); }
  }
  let w = 0, h = 0, spinT = -1, swapped = true, last = null, scaleK = 1;
  const visH = () => 2 * D * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  function resize() {
    w = innerWidth; h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w < 700 ? 1.5 : 1.75));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  function apply(p) {
    const vH = visH(), vW = vH * camera.aspect;
    hat.visible = p.visible !== false;
    hat.position.set((p.x - 0.5) * vW, (0.5 - p.y) * vH, p.z || 0);
    let spin = 0, hop = 0;
    if (spinT >= 0) {
      const k = clamp((performance.now() - spinT) / SPIN_MS);
      if (!swapped && performance.now() - spinT >= SWAP_MS) { swapped = true; setLook(look + 1); }
      spin = reduced() ? 0 : EASE.cam(k) * Math.PI * 2; hop = reduced() ? 0 : Math.sin(k * Math.PI) * 0.06 * p.h * vH;
      if (k >= 1) spinT = -1;
    }
    const drift = reduced() ? 0 : (p.drift || 0);
    const tt = performance.now() / 1000;
    hat.position.y += hop + Math.sin(tt * 0.9) * 0.012 * vH * drift;
    hat.rotation.set(p.rx || 0, (p.ry || 0) + spin + Math.sin(tt * 0.35) * 0.18 * drift, p.rz || 0, 'YXZ');
    const s = p.h * vH / H * (p.s || 1) * scaleK;
    hat.scale.set(s, s * (p.sy || 1), s);     // sy: a vertical stretch, only while the hat stands in for the logo's hat
    hat.updateMatrixWorld(true);
  }
  function project(p3) { v.copy(p3).project(camera); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h }; }
  function rect(role) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of corners) { if (role && k.role !== role) continue; const q = project(v.copy(k).applyMatrix4(hat.matrixWorld)); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return new DOMRect(x0, y0, x1 - x0, y1 - y0);
  }
  const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  // warm-up: draw it once now (textures reach the GPU here, not on the first frame the visitor sees — that froze ~700 ms),
  // then clear, so nothing shows until a view poses it
  apply({ x: 0.5, y: 0.5, h: 0.3 }); renderer.render(scene, camera);
  for (let k = 1; k < LOOKS.length; k++) { setLook(k); renderer.render(scene, camera); } setLook(0);
  renderer.clear();
  return {
    kind: '3d', height: H, width: W,
    pose(p) { last = p; scaleK = 1; apply(p); },
    // «text wins»: shrink (never below half) until the hat's box clears every text box
    fitAway(rects, { inside = false } = {}) {
      if (!last || !hat.visible) return 1;
      const out = r => inside && (r.left < 8 || r.right > w - 8 || r.top < 8 || r.bottom > h - 8);
      for (let i = 0; i < 14; i++) { const r = rect(); if (!out(r) && !rects.some(q => hits(r, q))) break; scaleK *= 0.95; apply(last); if (scaleK < 0.5) break; }
      return scaleK;
    },
    mouth() { return project(new THREE.Vector3(0, bottom, 0).applyMatrix4(body.matrixWorld)); },
    rect, get visible() { return hat.visible; },
    hit(x, y) { if (!hat.visible) return false; ndc.set(x / w * 2 - 1, -(y / h) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObject(hat, true).length > 0; },
    trick() { if (spinT >= 0) return false; spinT = performance.now(); swapped = false; return true; },
    setLook, get look() { return look; },
    render() { if (last) apply(last); renderer.render(scene, camera); }
  };
}

function imgHat(src, reduced) {
  const img = new Image(); img.src = src; img.alt = ''; img.className = 'hat-img';
  document.body.appendChild(img);
  let last = null, spinT = -1;
  return {
    kind: 'img', pose(p) { last = p; }, fitAway() { return 1; },
    render() {
      if (!last) return;
      img.hidden = last.visible === false;
      const hh = last.h * innerHeight * (last.s || 1);
      const spin = spinT >= 0 && !reduced() ? clamp((performance.now() - spinT) / SPIN_MS) * 360 : 0; if (spinT >= 0 && performance.now() - spinT > SPIN_MS) spinT = -1;
      img.style.cssText = `position:fixed;left:${last.x * innerWidth}px;top:${last.y * innerHeight}px;height:${hh}px;transform:translate(-50%,-50%) rotate(${(last.rz || 0) + (last.rx || 0) * 0}rad) rotateY(${spin}deg);z-index:${getComputedStyle(document.getElementById('hatCanvas')).zIndex};pointer-events:none`;
    },
    mouth() { const r = img.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; },
    rect() { return img.getBoundingClientRect(); }, get visible() { return !img.hidden; },
    hit(x, y) { const r = img.getBoundingClientRect(); return !img.hidden && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; },
    trick() { spinT = performance.now(); return true; }, setLook() {}, look: 0
  };
}
