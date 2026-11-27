/* mockup v6.1 — the Work page's 3D stage (plan §6): a theatre seen from the stalls, in simple three.js shapes.
   Units are metres. The stage top is at y = 1, its front edge at z = 0. Review of 20 Nov: the proscenium opening is 10.5 × 6 and
   stands just in front of the screen (z −3.45), so curtains and valance frame the screen whole; the hats stay at the front edge.
   The works play on a screen hung in the air (8.4 × 4.725, centre (0, 3.9, −4)); the film is drawn as-is (no tone mapping, no tint).
   One hat per work along the front of the stage, in Brand Kit order; clicking a hat takes its work out of it.
   Tricks (each a timeline, queued): curtains 1200 ms · out of the hat 1100 ms (back into one: 400 ms) · the silk 900 ms.
   Phase C (plan §14): with «Theatre» on, the theatre baked in Blender replaces the simple house (theatre3d.js). Two framings on a
   laptop — «à porta» (the entry: curtains open, the light goes from «sala acesa» to «espetáculo», the first work comes out) and
   «no lugar» (the rest), joined by a 2 400 ms descent; the phone has one. The hats are the brand hat (≤ 3 000 triangles). */
import * as THREE from 'three';
import { clamp, lerp, fit, damp, EASE, onFrame, frameStats, log, isPhone } from './util.js';
import { asset } from './data.js';
import { loadTheatre, loadHat, paintHat } from './theatre3d.js';
import { loadAnfi } from './anfi3d.js';
import { pickHat, aimAt, descentAt, DESCENT_MS, LAST_JUMP_MS, wheelLook } from './anfie.js';
import { createCloth, smoothGrid, gridNormals } from './silkcloth.js';

const RED = 0xe02727;
const HAT_COLOURS = [0xfbae9c, 0x81cfe3, 0xffc718, 0x2f77b1, 0xe02727, 0x2a7928];   // Brand Kit order: pink, light blue, yellow, blue, red, green
const SCREEN = { w: 8.4, h: 4.725, c: new THREE.Vector3(0, 3.9, -4) };
const ARCH = { w: 10.5, h: 6, z: -3.45 };          // the proscenium opening, from the stage top (y 1 → 7)
const ENTRY_BACK = 3;                              // the entry shot starts this many metres further back
const T_CURTAIN = 1200, T_OUT = 1100, T_IN = 400, T_SILK = 900, T_FADE = 200, T_CASE = 1400, T_CAM_BACK = 800;
const CAM = { y: 2.1, look: new THREE.Vector3(0, 3.6, -4), fov: 32, sway: { x: 0.45, y: 0.2 } };   // look y: 3.2 was decided; measured, it lifts the stage front past the seat band (see the review report) — 3.6 keeps it
// tests only: ?look=<y> tries another height for where the camera looks
const LOOK_Q = +new URLSearchParams(location.search).get('look'); if (LOOK_Q) CAM.look.y = LOOK_Q;

/* a lit-red material whose brightest point is exactly the brand red: colour = red × shade, shade ≤ 1, no tone mapping */
function redCloth({ side = THREE.FrontSide, waves = false } = {}) {
  return new THREE.ShaderMaterial({
    side, transparent: false,
    uniforms: { uRed: { value: new THREE.Color().setHex(RED, THREE.LinearSRGBColorSpace) }, uT: { value: 0 }, uAmp: { value: 0 }, uPhase: { value: 0 }, uK: { value: waves ? 1 : 0 }, uAmb: { value: 0.30 }, uFoot: { value: 0 }, uKey: { value: 1 }, uIdOn: { value: 0 }, uId: { value: new THREE.Color() },
      uCrumple: { value: 0 }, uDiag: { value: 0 }, uPullT: { value: 0 }, uPullDir: { value: new THREE.Vector3() }, uCorner: { value: new THREE.Vector2(5.25, 3.5) } },
    // C2b: the silk can be crumpled (a ball of cloth, folded unevenly towards its centre) and pulled away by one corner (each point
    // leaves later the further it is from that corner, so the cloth stretches out behind it)
    vertexShader: `uniform float uT; uniform float uAmp; uniform float uPhase; uniform float uCrumple; uniform float uDiag; uniform float uPullT; uniform vec3 uPullDir; uniform vec2 uCorner; varying vec3 vN; varying vec3 vW;
      /* C2c: the crumple from value noise in four octaves, turned at each one, plus ridged creases: folds of many sizes, no regular relief */
      float h2(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 q) { vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y) * 2.0 - 1.0; }
      float fbm(vec2 q) { float s = 0.0, a = 0.55; mat2 R = mat2(0.8, -0.6, 0.6, 0.8); for (int i = 0; i < 4; i++) { s += a * vn(q); q = R * q * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      vec3 crm(vec2 c) { return vec3(fbm(c * 0.38 + uPhase), fbm(c * 0.55 + vec2(5.2, 1.3) - uPhase * 0.5), 1.0 - abs(fbm(c * 0.7 + vec2(3.1, 7.4) + uPhase))); }
      float crz(vec3 m) { return 1.1 * m.x + 0.55 * m.y + 0.45 * m.z; }
      void main(){ vec3 p = position; vec3 n = normal;
        ${waves ? `float a = uAmp, ky = 0.6 + 0.9 * uDiag, k2 = 1.6 * uDiag;   /* uDiag: folds running across the cloth, not down it like a curtain's */
        float w = sin(p.x * 1.4 + p.y * ky - uT * 9.0 + uPhase) * a + sin(p.x * 3.1 + p.y * k2 - uT * 13.0) * a * 0.444;
        p.z += w; float dx = cos(p.x * 1.4 + p.y * ky - uT * 9.0 + uPhase) * 1.4 * a + cos(p.x * 3.1 + p.y * k2 - uT * 13.0) * 3.1 * a * 0.444, dy = cos(p.x * 1.4 + p.y * ky - uT * 9.0 + uPhase) * ky * a + cos(p.x * 3.1 + p.y * k2 - uT * 13.0) * k2 * a * 0.444; n = normalize(vec3(-dx, -dy, 1.0));
        if (uCrumple > 0.0) { vec2 c = position.xy; vec3 m = crm(c); float f = m.x * 1.6, g = m.y * 1.6, e = 0.12;
          vec3 cr = vec3(c * vec2(0.24 + 0.12 * f, 0.09 + 0.07 * g) + vec2(0.45 * g, 0.35 * f * f), crz(m));   /* a long, uneven twist of cloth */
          float z0 = crz(m), zx = (crz(crm(c + vec2(e, 0.0))) - z0) / e, zy = (crz(crm(c + vec2(0.0, e))) - z0) / e;   /* the creases' own slope, for the light */
          p = mix(p, cr, uCrumple); n = normalize(mix(n, normalize(vec3(-zx, -zy, 0.6)), uCrumple)); }
        if (uPullT > 0.0) { float d = distance(position.xy, uCorner) / 12.6, k = clamp(uPullT * 1.6 - d * 0.6, 0.0, 1.0); p += uPullDir * k * k * (3.0 - 2.0 * k); }` : ''}
        vec4 w4 = modelMatrix * vec4(p, 1.0); vW = w4.xyz; vN = normalize(mat3(modelMatrix) * n); gl_Position = projectionMatrix * viewMatrix * w4; }`,
    fragmentShader: `uniform vec3 uRed; uniform float uK; uniform float uAmb; uniform float uFoot; uniform float uKey; uniform float uIdOn; uniform vec3 uId; varying vec3 vN; varying vec3 vW;
      void main(){ if (uIdOn > 0.5) { gl_FragColor = vec4(uId, 1.0); return; }   /* tests: an id pass with the cloth's own waves */
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        float a = max(dot(n, normalize(vec3(-0.55, 0.35, 0.75))), 0.0), b = max(dot(n, normalize(vec3(0.55, 0.35, 0.75))), 0.0);
        float soft = uAmb + uKey * (0.55 * a + 0.35 * b) + uFoot * exp(-(vW.y - 1.0) / 1.1) * (0.55 + 0.45 * max(n.z, 0.0));   // curtains: ambient, two side spots, the footlights' glow at the base
        float hard = 0.06 + 1.10 * pow(a, 1.6) + 0.25 * b;                  // the silk: darker folds, the key spot catching the crests
        gl_FragColor = vec4(uRed * min(mix(soft, hard, uK), 1.0), 1.0); }`
  });
}
/* a cloth panel with vertical pleats in relief (9 pleats across, whatever its width once scaled) */
function pleated(w, h, pleats, depth, segX = 72) {
  const g = new THREE.PlaneGeometry(1, h, segX, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + 0.5; p.setZ(i, Math.sin(x * pleats * Math.PI * 2) * depth); }
  g.computeVertexNormals(); g.scale(w, 1, 1);
  return g;
}
/* a simple hat (lathe), in one mesh with vertex colours: shell (the given colour), band (black), lining (brand red) */
function hatGeometry(shellHex) {
  const V = (x, y) => new THREE.Vector2(x, y), SEG = 40, parts = [];
  const add = (geo, rgb) => { const n = geo.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(rgb, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(geo.index ? geo.toNonIndexed() : geo); };
  const sc = new THREE.Color().setHex(shellHex), shell = [sc.r, sc.g, sc.b], band = [0.03, 0.03, 0.035], red = new THREE.Color().setHex(RED);
  add(new THREE.LatheGeometry([V(0.555, 0), V(0.562, 0.5), V(0.586, 1.08), V(0.6, 1.29), V(0.585, 1.322), V(0.25, 1.331), V(0, 1.332)], SEG), shell);
  add(new THREE.LatheGeometry([V(0.53, -0.005), V(0.54, 0.6), V(0.545, 1.25), V(0.3, 1.288), V(0, 1.29)], SEG), [red.r, red.g, red.b]);
  const brim = new THREE.LatheGeometry([V(0.5, 0.018), V(0.95, 0.018), V(1.055, 0), V(1.045, -0.022), V(0.75, -0.026), V(0.5, -0.022), V(0.5, 0.018)], SEG), bp = brim.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), r = Math.hypot(x, z), phi = Math.atan2(z, x), t = clamp((r - 0.56) / 0.5); bp.setY(i, bp.getY(i) + t * t * (0.24 * Math.cos(phi) ** 2 - 0.045 * Math.sin(phi) ** 2)); }
  add(brim, shell);
  add(new THREE.LatheGeometry([V(0.566, 0.03), V(0.579, 0.05), V(0.579, 0.24), V(0.569, 0.265)], SEG), band);
  // merge (all non-indexed, same attributes)
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0), pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals(); geo.scale(0.45 / 1.56, 0.45 / 1.56, 0.45 / 1.56);   // 0.45 m tall including the curled brim
  return geo;
}
/* E3 (the creative chat's point 4): the entry's hat, cleaned at load (the model as it is, by code):
   (1) its seams welded — the lining's and the felt's boundary vertices within 0.1 mm of another boundary vertex of their kind, or within
   1 mm with normals under 40° apart (the model's seams, at φ ≈ 116° and −90°: their two sides never joined — up to 0.8 mm apart on the
   brim — a hairline crack, lit by normals 10–40° apart), are merged, their normals averaged when within 40° (a hard edge keeps its two
   normals, only its crack closes). No other vertex moves nor any other normal changes: merging the whole mesh would round the crown's top
   edge and its join with the brim;
   (2) the brim's black edge raised 0.3 mm along its normals off the felt it lies on — fighting for depth, they drew dashes along the
   brim's back;
   (3) the lining starting just above the felt's ring at the mouth (y ≥ 0.031; it went down to 0.022, inside the ring, r 0.160–0.178,
   y 0.017–0.030) — through the ring's hairline cracks it showed as red specks along the lip. And in the shader, the felt seen from inside
   the crown (above that ring) takes the lining's colour: a hairline crack in the lining (at φ ≈ −90°, the back wall seen through the
   mouth) showed the felt behind it as a dark line. */
export function cleanHat(src) {
  const g = src.clone(), P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index.array, n = P.count;
  const kind = i => C.getX(i) > 0.5 && C.getY(i) < 0.35 ? 1 : C.getX(i) > 0.9 ? 2 : 3;   // lining, felt (white before painting), black trim
  const uses = new Map(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? a * n + b : b * n + a; uses.set(k, (uses.get(k) || 0) + 1); }
  const onB = new Uint8Array(n); for (const [k, c] of uses) if (c === 1) { onB[Math.floor(k / n)] = 1; onB[k % n] = 1; }
  const T = 1e-3, cells = new Map(), cell = (x, y, z) => Math.floor(x / T) + ',' + Math.floor(y / T) + ',' + Math.floor(z / T), c40 = Math.cos(Math.PI * 40 / 180);
  for (let i = 0; i < n; i++) if (onB[i] && kind(i) !== 3) { const k = cell(P.getX(i), P.getY(i), P.getZ(i)); (cells.get(k) || cells.set(k, []).get(k)).push(i); }
  const up = new Int32Array(n); for (let i = 0; i < n; i++) up[i] = i; const root = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  for (const list of cells.values()) for (const i of list) { const cx = Math.floor(P.getX(i) / T), cy = Math.floor(P.getY(i) / T), cz = Math.floor(P.getZ(i) / T);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of cells.get((cx + dx) + ',' + (cy + dy) + ',' + (cz + dz)) || []) {
      if (j <= i || kind(j) !== kind(i)) continue; const d = Math.hypot(P.getX(i) - P.getX(j), P.getY(i) - P.getY(j), P.getZ(i) - P.getZ(j));
      if (d < 1e-4 || (d < T && N.getX(i) * N.getX(j) + N.getY(i) * N.getY(j) + N.getZ(i) * N.getZ(j) >= c40)) up[root(j)] = root(i); } }
  const groups = new Map(); for (let i = 0; i < n; i++) if (onB[i]) { const r = root(i); if (r !== i || groups.has(r)) (groups.get(r) || groups.set(r, [r]).get(r)).push(i); }
  const map = new Int32Array(n); for (let i = 0; i < n; i++) map[i] = i; const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (const [r, ids] of groups) { const m = [...new Set(ids)]; if (m.length < 2) continue;
    v.set(0, 0, 0); for (const i of m) v.add(w.fromBufferAttribute(P, i)); v.divideScalar(m.length); for (const i of m) P.setXYZ(i, v.x, v.y, v.z);
    let soft = true; for (const a of m) for (const b of m) if (w.fromBufferAttribute(N, a).dot(v.fromBufferAttribute(N, b)) < Math.cos(Math.PI * 40 / 180)) soft = false;
    if (!soft) continue; v.set(0, 0, 0); for (const i of m) v.add(w.fromBufferAttribute(N, i)); v.normalize(); for (const i of m) { N.setXYZ(i, v.x, v.y, v.z); map[i] = r; } }
  for (let t = 0; t < I.length; t++) I[t] = map[I[t]];
  for (let i = 0; i < n; i++) { const k = kind(i), x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z);
    if (k === 3 && r > 0.30) P.setXYZ(i, x + N.getX(i) * 3e-4, P.getY(i) + N.getY(i) * 3e-4, z + N.getZ(i) * 3e-4);
    else if (k === 1 && P.getY(i) < 0.031) P.setY(i, 0.031); }
  P.needsUpdate = N.needsUpdate = g.index.needsUpdate = true; g.computeBoundingBox();
  return g;
}
const _sb = new THREE.Vector3(), _sb2 = new THREE.Vector3();   // E3: screenBehind's ray and screenSpan's points, reused
const _qScreen = new THREE.Quaternion();                          // E3: the screen's plane (the card lands in it), the identity

export function createStage3D(canvas, { projects, reduced, onShown, onState, theatreOn = () => false, anfiOn = () => false }) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); if (!renderer.getContext()) throw new Error('no webgl'); }
  catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050507);
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.1, 120); scene.add(camera);

  /* light: ambient 8%, a spot on the hats, two on the curtains (the cloth shades itself in its shader), three faint beams */
  const amb = new THREE.AmbientLight(0xffffff, 0.08 * Math.PI); scene.add(amb);
  const hatSpot = new THREE.SpotLight(0xfff1e2, 60, 14, 0.35, 0.6, 1.4); hatSpot.position.set(0, 9, 2.5); hatSpot.target.position.set(0, 1, -0.7); scene.add(hatSpot, hatSpot.target);
  const key = new THREE.DirectionalLight(0xffffff, 0.6); key.position.set(2, 6, 8); scene.add(key);

  /* the house and the stage */
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.35, metalness: 0 });
  const stage = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 8), wood); stage.position.set(0, 0.5, -4); scene.add(stage);
  const house = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x060608, roughness: 1 })); house.rotation.x = -Math.PI / 2; scene.add(house);
  // the proscenium wall with its 10.5 × 6 opening (from the stage top), just in front of the screen
  const wall = new THREE.Shape(); wall.moveTo(-20, -2); wall.lineTo(20, -2); wall.lineTo(20, 16); wall.lineTo(-20, 16); wall.lineTo(-20, -2);
  const AW = ARCH.w / 2, AT = 1 + ARCH.h;
  const hole = new THREE.Path(); hole.moveTo(-AW, 1); hole.lineTo(AW, 1); hole.lineTo(AW, AT); hole.lineTo(-AW, AT); hole.lineTo(-AW, 1); wall.holes.push(hole);
  const arch = new THREE.Mesh(new THREE.ShapeGeometry(wall), dark); arch.position.z = ARCH.z; scene.add(arch);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial({ color: 0x000000 })); back.position.set(0, 5, -8); scene.add(back);

  /* curtains (6 m tall, 9 pleats) and the valance (0.6 tall); open: 0.95 m each side (x ±4.3 → ±5.25, clear of the screen's ±4.2); closed: they meet */
  const clothMat = redCloth({ side: THREE.DoubleSide });
  const curtainGeo = pleated(1, ARCH.h, 9, 0.09), CZ = ARCH.z - 0.12;
  const curtL = new THREE.Mesh(curtainGeo, clothMat), curtR = new THREE.Mesh(curtainGeo, clothMat);
  curtL.position.set(0, 1 + ARCH.h / 2, CZ); curtR.position.set(0, 1 + ARCH.h / 2, CZ); scene.add(curtL, curtR);
  const valance = new THREE.Mesh(pleated(ARCH.w + 0.2, 0.6, 22, 0.07), clothMat); valance.position.set(0, AT - 0.3, ARCH.z - 0.06); scene.add(valance);
  function setCurtains(k) {          // k: 0 open, 1 closed
    const wOpen = 0.95, wClosed = AW + 0.05, w = lerp(wOpen, wClosed, k);
    curtL.scale.x = curtR.scale.x = w;
    curtL.position.x = -AW + w / 2; curtR.position.x = AW - w / 2;
    if (TH) TH.setOpen(1 - k);
  }

  /* the screen: the film as it is (MeshBasic, no tone mapping), floating ±4 cm over 7 s; and its faint reflection on the stage (18%) */
  const video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true; video.crossOrigin = 'anonymous'; video.preload = 'auto';
  const vtex = new THREE.VideoTexture(video); vtex.colorSpace = THREE.SRGBColorSpace;
  const posterTex = new THREE.Texture(); posterTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: posterTex, toneMapped: false, transparent: true });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat); scene.add(screen);
  const reflMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { map: { value: posterTex }, uO: { value: 0.18 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float uO; varying vec2 vUv; void main(){ vec4 c = texture2D(map, vec2(vUv.x, 1.0 - vUv.y * 0.55)); gl_FragColor = vec4(c.rgb, uO * vUv.y); }'
  });
  const refl = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, 3.6), reflMat); refl.rotation.x = -Math.PI / 2; refl.position.set(0, 1.002, -2.2); scene.add(refl);

  /* hats along the front of the stage, one per work, 1.1 m apart */
  const hats = projects.map((p, i) => {
    const m = new THREE.Mesh(hatGeometry(HAT_COLOURS[i % HAT_COLOURS.length]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, emissive: 0x000000 }));
    m.userData = { i, x: 0, y: 1.0, lift: 0, sink: 0, tx: 0 }; m.rotation.x = 0.12; scene.add(m); return m;
  });
  let hatsReal = false;
  const hatLoad = loadHat().then(geo => { hatRaw = geo; hats.forEach((h, i) => { h.geometry.dispose(); h.geometry = paintHat(geo, HAT_COLOURS[i % HAT_COLOURS.length]); }); hatsReal = true; }).catch(e => console.warn('[mockup] stage hat', e));

  /* the stalls: three rows of seat tops in silhouette (#111116), raked, at z = 5 · 6.2 · 7.4 */
  const seatMat = new THREE.MeshBasicMaterial({ color: 0x111116 });
  const seatGeo = new THREE.BoxGeometry(0.52, 0.5, 0.12); seatGeo.translate(0, -0.25, 0);
  const rows = [[5, 1.62], [6.2, 1.75], [7.4, 1.88]], perRow = 26;
  const seats = new THREE.InstancedMesh(seatGeo, seatMat, rows.length * perRow); const mm = new THREE.Matrix4();
  function placeSeats() {      // every row's tops on one screen line (raked: further rows sit higher): over the stage's front edge,
    // but no higher than 12% of the screen from the bottom (16% below a 1.55 aspect, e.g. 1180×820); the phone keeps one row at 11.5%
    const v = new THREE.Vector3(), ph = isPhone(); let si = 0;
    const fe = (1 - v.set(0, 1, 0).project(camera).y) / 2, band = camera.aspect >= 1.55 ? 0.12 : 0.16;
    const target = ph ? 1 - 0.115 : Math.max(1 - band, Math.min(1 - 0.115, fe - 0.004));
    // the phone's camera sits far back: one row only, a few metres in front of it (plan §9), the other two left out
    if (ph) { rows[0][0] = camera.position.z - 4; rows[1][0] = rows[2][0] = camera.position.z + 50; } else { rows[0][0] = 5; rows[1][0] = 6.2; rows[2][0] = 7.4; }
    for (const r of rows) {
      let lo = -2, hi = 6; for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; v.set(0, mid, r[0]).project(camera); if ((1 - v.y) / 2 > target) lo = mid; else hi = mid; }
      r[1] = (lo + hi) / 2;
      for (let k = 0; k < perRow; k++) { mm.makeTranslation((k - perRow / 2 + 0.5) * 0.58 + (r[0] % 2 ? 0.29 : 0), r[1], r[0]); seats.setMatrixAt(si++, mm); }
    }
    seats.instanceMatrix.needsUpdate = true;
  }
  scene.add(seats);

  /* three faint beams with dust in them */
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * 0.05 * vY, 1.0); }' });
  const beams = [-3.5, 0, 3.5].map((x, i) => { const b = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 24, 1, true), beamMat); b.position.set(x * 1.6, 6.2, -6.2); /* behind the screen: nothing is drawn over the film */ b.rotation.z = (i - 1) * 0.18; scene.add(b); return b; });
  const dustN = 360, dpos = new Float32Array(dustN * 3), dseed = new Float32Array(dustN);
  for (let i = 0; i < dustN; i++) { const b = i % 3; dpos.set([(b - 1) * 5.6 + (Math.random() - 0.5) * 2.4, 1.5 + Math.random() * 7.5, -6.2 + (Math.random() - 0.5) * 1.6], i * 3); dseed[i] = Math.random() * 10; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dustGeo.setAttribute('seed', new THREE.BufferAttribute(dseed, 1));
  const dustMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uPR: { value: 1 } },
    vertexShader: 'attribute float seed; uniform float uT; uniform float uPR; varying float vA; void main(){ vec3 p = position; p.x += sin(uT * 0.3 + seed) * 0.15; p.y += mod(uT * 0.08 + seed, 1.0) * 0.4; vA = 0.35 + 0.35 * sin(uT * 1.3 + seed * 3.0); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 2.2 * uPR * (8.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * vA * 0.5, 1.0); }' });
  const dust = new THREE.Points(dustGeo, dustMat); scene.add(dust);
  // the burst out of a hat: 120 motes along the work's arc
  const burstN = 120, bpos = new Float32Array(burstN * 3), bdir = new Float32Array(burstN * 3);
  for (let i = 0; i < burstN; i++) bdir.set([(Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 2.4, (Math.random() - 0.5) * 0.8], i * 3);
  const burstGeo = new THREE.BufferGeometry(); burstGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3)); burstGeo.setAttribute('dir', new THREE.BufferAttribute(bdir, 3));
  const burstMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uK: { value: 0 }, uO: { value: new THREE.Vector3() }, uPR: { value: 1 } },
    vertexShader: 'attribute vec3 dir; uniform float uK; uniform vec3 uO; uniform float uPR; varying float vA; void main(){ vec3 p = uO + dir * uK * 1.6 + vec3(0.0, -uK * uK * 0.8, 0.0); vA = sin(uK * 3.14159); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 3.0 * uPR * (8.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA, 1.0); }' });
  const burst = new THREE.Points(burstGeo, burstMat); burst.frustumCulled = false; burst.visible = false; scene.add(burst);

  /* the silk: one 3D cloth, 10.5 × 7.0 m, 48 × 32 segments, 0.75 m in front of the screen, tilted 12°, rippling (waves 0.36 and 0.16 m at their peak) */
  const silkMat = redCloth({ side: THREE.DoubleSide, waves: true });
  const silk = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 7.0, 48, 32), silkMat); silk.visible = false; silk.frustumCulled = false; scene.add(silk);
  /* round E (Task 5): the silk of the viewing mode, real cloth (silkcloth.js, 32 × 20 particles) — its mesh follows the simulation every
     frame. Its material: the brand red (#E02727) × a shade capped at 1, so its brightest point is exactly the brand red (criterion 5): a
     key from the upper left, a fill from the right, a soft sheen at grazing angles, the film's light through it; both faces */
  // E2: the mesh it is drawn with (SRX × SRY) apart from the simulation's particles (SNX × SNY)
  const SNX = 32, SNY = 20, SRK = 3, SRX = SRK * (SNX - 1) + 1, SRY = SRK * (SNY - 1) + 1, silkCGeo = new THREE.BufferGeometry(), silkCN = new Float32Array(SRX * SRY * 3);
  { const idx = []; for (let j = 0; j < SRY - 1; j++) for (let i = 0; i < SRX - 1; i++) { const q = j * SRX + i; idx.push(q, q + 1, q + SRX, q + 1, q + SRX + 1, q + SRX); }
    silkCGeo.setIndex(idx); silkCGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SRX * SRY * 3), 3)); silkCGeo.setAttribute('normal', new THREE.BufferAttribute(silkCN, 3)); }
  const silkCMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide,
    uniforms: { uRed: { value: new THREE.Color().setHex(RED, THREE.LinearSRGBColorSpace) }, uAmb: { value: 0.14 }, uKey: { value: 1 }, uFilm: { value: 0 }, uIdOn: { value: 0 }, uId: { value: new THREE.Color() },
      uSheen: { value: 1 }, uSheenMap: { value: 0 }, uSheenCol: { value: new THREE.Vector3(0.30, 0.16, 0.13) } },   /* E2: a lighter, saturated red on the crests */
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uRed; uniform float uAmb; uniform float uKey; uniform float uFilm; uniform float uIdOn; uniform vec3 uId; uniform float uSheen; uniform float uSheenMap; uniform vec3 uSheenCol; varying vec3 vN; varying vec3 vW;
      void main(){ if (uIdOn > 0.5) { gl_FragColor = vec4(uId, 1.0); return; }   /* tests: the id pass */
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 v = normalize(cameraPosition - vW);
        vec3 kd = normalize(vec3(-0.55, 0.35, 0.75)); float a = max(dot(n, kd), 0.0), b = max(dot(n, normalize(vec3(0.55, 0.35, 0.75))), 0.0);
        float sheen = 0.30 * pow(1.0 - max(dot(n, v), 0.0), 3.0);                 /* silk: brighter at grazing angles */
        float shade = uAmb + uKey * (1.10 * pow(a, 1.6) + 0.25 * b) + sheen + uFilm; /* the film behind, through the cloth */
        float spec = pow(max(dot(n, normalize(kd + v)), 0.0), 80.0);               /* E2: the silk's sheen on the folds' crests (the key's highlight) */
        if (uSheenMap > 0.5) { gl_FragColor = vec4(vec3(spec), 1.0); return; }      /* tests: where the crests are */
        gl_FragColor = vec4(uRed * min(shade, 1.0) + uSheenCol * spec * uSheen, 1.0); }` });
  const silkC = new THREE.Mesh(silkCGeo, silkCMat); silkC.visible = false; silkC.frustumCulled = false; scene.add(silkC);

  /* the theatre (phase C) */
  let TH = null, thLoading = null, thMode = false, camT = 1, lightMix = 1, TP = null;
  const SIMPLE = [stage, house, arch, back, curtL, curtR, valance, seats, dust, ...beams];
  const thCloth = redCloth({ side: THREE.DoubleSide }), brassMat = new THREE.MeshBasicMaterial({ color: 0x4a3418 });
  function ensureTheatre() {
    if (!thLoading) {
      const t0 = performance.now();
      thLoading = loadTheatre().then(t => {
        TH = t; TH.group.visible = false; scene.add(TH.group);
        TH.panels.forEach(m => { m.material = thCloth; }); if (TH.valance) TH.valance.material = thCloth; if (TH.braid) TH.braid.material = brassMat;
        TH.readyMs = Math.round(performance.now() - t0); log({ name: 'theatre-ready', ms: TH.readyMs }); return TH;
      }).catch(e => { console.warn('[mockup] theatre unavailable', e); return null; });
    }
    return thLoading;
  }
  if (theatreOn()) ensureTheatre();            // start loading at once: by the time the Work page opens it is usually there
  /* the amphitheatre (plan §15, phases C1 and C2): the opening with the silk, swaps in the seat, the 360° gallery; see C2 below */
  let anFilmK = 1;                                // C2: the film lights the room in its true proportion (was 0.6 in C1)
  const AN_LIGHT = { key: 3.8, fill: 0.1, amb: 0.015 };        // tuned against the B2 render (hats' medians) under the 60% cap
  let AN = null, anLoading = null, anMode = false, anCam = 'lugar', anYaw = 0, anPitch = 0, anFilm = [0, 0, 0], anFilmT = 0;
  const SCREEN0 = { c: SCREEN.c.clone() }, AN_SCREEN = new THREE.Vector3(0, 4.3, -7.9), AN_SCALE = 9.6 / SCREEN.w;
  const filmCv = document.createElement('canvas'); filmCv.width = filmCv.height = 16; const filmCx = filmCv.getContext('2d', { willReadFrequently: true });
  function ensureAnfi() {
    if (!anLoading) {
      const t0 = performance.now();
      anLoading = loadAnfi().then(a => {
        AN = a; AN.group.visible = false; scene.add(AN.group);
        const ld = new THREE.TextureLoader(); AN.setPosters(projects.map(p => { const t = ld.load(asset(p.poster)); t.colorSpace = THREE.SRGBColorSpace; return t; }));
        AN.readyMs = Math.round(performance.now() - t0); log({ name: 'anfi-ready', ms: AN.readyMs }); return AN;
      }).catch(e => { console.warn('[mockup] amphitheatre unavailable', e); return null; });
    }
    return anLoading;
  }
  if (anfiOn()) ensureAnfi();
  function setAnfi(on) {
    anMode = !!(on && AN);
    if (AN) AN.group.visible = anMode;
    if (anMode) { for (const o of SIMPLE) o.visible = false; if (TH) TH.group.visible = false; }
    SCREEN.c.copy(anMode ? AN_SCREEN : SCREEN0.c); shown.pos.copy(SCREEN.c);
    screen.material = anMode ? AN.screenMat : screenMat;
    for (const h of hats) { const u = h.userData; if (!u.matStd) u.matStd = h.material; if (anMode && !u.matLut) u.matLut = AN.hatMaterial(HAT_COLOURS[u.i % HAT_COLOURS.length]); h.material = anMode ? u.matLut : u.matStd; }   // B2: roughness 0.6, through Blender's view                                // the film through Blender's view, as in the render
    camera.far = anMode ? 400 : 120; camera.updateProjectionMatrix();                 // the sky (140 m) and the far ground stay inside the frustum
    renderer.toneMapping = anMode ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    // the hats under neutral light, as the site will light them (decision 8)
    // the hats (decision 8, review of C1): a neutral key from the screen's side, as the film lights them in the render, and a soft
    // fill from the seats so they keep their volume; their colour stays the Brand Kit's, at most 60% of the film
    amb.intensity = (anMode ? AN_LIGHT.amb : 0.08) * Math.PI; hatSpot.color.set(anMode ? 0xffffff : 0xfff1e2); hatSpot.intensity = anMode ? AN_LIGHT.key : (thMode ? 34 : 60); key.intensity = anMode ? AN_LIGHT.fill : (thMode ? 0.32 : 0.6);
    if (anMode) { hatSpot.position.set(0, 6.5, -7.4); hatSpot.target.position.set(0, 0.4, -2.4); hatSpot.angle = 0.75; key.position.set(-3, 4, 9); }
    else { hatSpot.position.set(0, 9, 2.5); hatSpot.target.position.set(0, 1, -0.7); hatSpot.angle = 0.35; key.position.set(2, 6, 8); }
  }
  /* phase C2: the camera as a state — a pose (position, where it looks, lens) per place, and journeys between them on the house curve.
     States: «abertura» (the opening) → «lugar» (the seat) ⇄ «ida» → «galeria» (the stage's centre, turned by hand) ⇄ «volta». */
  let readyP = Promise.resolve();
  let anState = 'lugar', anTextIn = true, anFrom = null, anCamK = 1, anSeen = false, anPortal = -1, anDragged = false;
  const anLook = new THREE.Vector3(0, 3.9, -7.9), VER_SHARE = 0.80;   // round E: the screen's share of the width in the viewing pose (75–85 %)
  function poseOf(name) {
    const I = AN.info.cams, wide = innerWidth / innerHeight >= 1.55, ph = isPhone(), V = a => new THREE.Vector3(a[0], a[1], a[2]);
    if (name === 'galeria') { const c = I.galeria, pos = V(c.pos), y = THREE.MathUtils.degToRad(anYaw), p = THREE.MathUtils.degToRad(anPitch);
      return { name, pos, look: pos.clone().add(new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p))), fov: lerp(ph ? 84 : c.fov, galFov, galZoom) }; }   // a phone held upright: a wider lens, about 45° across; closer on a portal (C2b)
    // round E: the descent (descentAt at descMs, on the house curve): over the stage's centre, the gaze from straight down to the screen;
    // the gallery's lens. A pitch of −90° exactly would leave lookAt no «up»: −89.5 at most
    if (name === 'descida') { const d = descentAt(descMs, EASE.cam), p = THREE.MathUtils.degToRad(Math.max(-89.5, d.pitch)), pos = V(d.pos);
      return { name, pos, look: pos.clone().add(new THREE.Vector3(0, Math.sin(p), -Math.cos(p))), fov: ph ? 84 : I.galeria.fov }; }
    // round E: the viewing pose, close to the screen. A computer: level with the screen's centre (4.3 m: face on, no keystone — 4.0 m
    // looking up made its lower edge wider), 8 m from it, the lens worked out from the window's shape so the screen fills VER_SHARE of the
    // width (at most 90 % of the height) — a resize keeps it; the hats stay below the frame. A phone: the pose «telemovel», hats in view (owner)
    if (name === 'ver' && !ph) { const pos = new THREE.Vector3(0, AN_SCREEN.y, 0.1), d = pos.z - AN_SCREEN.z, asp = innerWidth / innerHeight, R = THREE.MathUtils.radToDeg;
      const fw = 2 * R(Math.atan(SCREEN.w * AN_SCALE / 2 / (d * VER_SHARE * asp))), fh = 2 * R(Math.atan(SCREEN.h * AN_SCALE / 2 / (d * 0.9)));
      return { name, pos, look: AN_SCREEN.clone(), fov: Math.max(fw, fh) }; }
    // the final review: a phone's «ver» along the pose «telemovel»'s own line of sight, as far from the screen as its window's shape needs
    // for the screen to fill 92 % of the width — the fixed pose gave ≥ 90 % only at 390 × 844 with no browser bars (0.72–0.86 with them)
    if (name === 'ver' && ph) { const c = I.telemovel, pos = V(c.pos), look = V(c.look), dir = look.clone().sub(pos).normalize(), asp = innerWidth / innerHeight;
      const d = SCREEN.w * AN_SCALE / 2 / (0.92 * Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * asp), t = (AN_SCREEN.z + d - pos.z) / dir.z;
      return { name, pos: pos.addScaledVector(dir, t), look, fov: c.fov }; }
    const n = name === 'lugar' && ph ? 'telemovel' : name, c = I[n];
    return { name, pos: V(c.pos), look: V(c.look), fov: n === 'lugar' && !wide ? c.fov_narrow : n === 'chegada' && ph ? 84 : c.fov };   // the arrival on a phone: a wider lens, the ring still whole
  }
  const UP_Y = new THREE.Vector3(0, 1, 0);
  function anPose() {   // round E (Task 7): in «ver», the wheel's sway turns the gaze about the camera (±8°, back to the centre in ~600 ms)
    const P = poseOf(anCam); if (anCam === 'ver' && verSway) P.look = P.pos.clone().add(P.look.clone().sub(P.pos).applyAxisAngle(UP_Y, -THREE.MathUtils.degToRad(verSway))); return P; }
  /* tweens: timed, logged like the timelines (name, start, end, took), several at once (the descent and the light run together) */
  const tweens = []; let slowmo = 1;            // tests only: slow motion, to measure a moving shape at an exact moment
  function tween(name, dur, fn) {
    return new Promise(res => { const tw = { name, dur: dur * slowmo, fn, start: performance.now(), res }; log({ name, dir: 1, start: tw.start });
      if (reduced() || dur <= 0) { fn(1); log({ name, dir: 1, end: tw.start, took: 0 }); res(); return; } fn(0); tweens.push(tw); });
  }
  function runTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i], t = Math.min(1, (now - tw.start) / tw.dur); tw.fn(t);
      if (t >= 1) { tweens.splice(i, 1); log({ name: tw.name, dir: 1, end: now, took: Math.round(now - tw.start) }); tw.res(); } }
  }
  function finishTweens() { while (tweens.length) { const tw = tweens.pop(); tw.fn(1); tw.res(); } }
  function camTo(name, dur, label = name, open = null) {     // a journey from wherever the camera is now; open: {ms, fov} — the lens opens to fov over the first ms
    anFrom = { pos: camera.position.clone(), look: anLook.clone(), fov: camera.fov, open: open ? { ...open, dur } : null }; anCam = name; anCamK = 0;
    return tween(label, dur, t => { anCamK = t; });
  }
  function lightTo(k, dur) { const k0 = AN.mix; return tween('luz', dur, t => AN.setMix(lerp(k0, k, EASE.cam(t)))); }
  function strandsFlash() { return tween('fios', 600, t => AN.setStrandFlash(Math.sin(t * Math.PI))); }   // 8% → 40% → 8%
  const SILK_AN = 1.25;                            // the silk at 13.1 × 8.75 m: it covers the 9.6 × 5.4 screen with a margin (the other stages' silk)
  /* round E (E-DESIGN «Entrada»), replacing the opening with the silk: the site's hat appears facing the visitor, its mouth toward us
     (400 ms); the camera dives into it (600 ms) until its lining — the brand red at the mouth, black within — fills the frame. That dark is
     the new veil: the room is drawn under it and cleared (its shaders warm, the light guard measures it, as under the page's veil before),
     with a waiting sign after 1 s; it lasts as long as the room needs (300 ms at least). Then a cut to 22 m over the stage, looking straight
     down through the shell's opening, and the descent in three jumps (descentAt, 2 400 ms) to the 360°. Later entries in the visit: the
     last jump only, 800 ms, after the page's veil. An entry that brings a work: out of the dark into the last jump, then the hat trick.
     Reduced motion: no hat, no descent — the 360° at once, under the page's fade. The hat and the dive have a scene of their own: they are
     drawn before the room has loaded. */
  const introScene = new THREE.Scene(); introScene.background = new THREE.Color(0x050507);
  const introCam = new THREE.PerspectiveCamera(36, 1, 0.01, 20), introPivot = new THREE.Group(); introScene.add(introPivot);
  const introMat = new THREE.ShaderMaterial({ vertexColors: true, side: THREE.DoubleSide,   // opaque: it appears by its colour rising from the dark (a fading alpha showed the hat through itself)
    uniforms: { uOp: { value: 0 }, uY0: { value: 0 }, uH: { value: 1 }, uIdMode: { value: 0 }, uCX: { value: 0 }, uCZ: { value: 0 }, uCrownR: { value: 1 }, uRimK: { value: 0.10 }, uRimP: { value: 4 }, uMouthC: { value: new THREE.Vector3() }, uMouthN: { value: new THREE.Vector3(0, 0, 1) }, uMouthR: { value: 0 } },
    vertexShader: 'uniform float uCX; uniform float uCZ; varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vY; varying float vR; void main(){ vC = color; vY = position.y; vR = length(position.xz - vec2(uCX, uCZ)); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    // the colours are linear (as the stage's hats'); written through the sRGB curve here, so the lining at the mouth is exactly #E02727
    fragmentShader: `uniform float uOp; uniform float uY0; uniform float uH; uniform float uIdMode; uniform float uCrownR; uniform float uRimK; uniform float uRimP; uniform vec3 uMouthC; uniform vec3 uMouthN; uniform float uMouthR; varying vec3 vC; varying vec3 vN; varying vec3 vW; varying float vY; varying float vR;
      vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
      void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW); float nv0 = dot(n, v); if (!gl_FrontFacing) n = -n;
        float lining = step(0.5, vC.r) * step(vC.g, 0.35), depth = (vY - uY0) / uH;
        /* E3: the felt seen from inside the crown THROUGH THE MOUTH (a back face turned well away, n·v ≤ −0.3; above the mouth's ring; not
           the band; the way from the camera crossing the mouth's disc, or the camera already in) takes the lining's colour: a hairline crack
           in the lining shows lining, not a dark line — and a crack in the crown's outside still shows the dark inside, as in E2 */
        vec3 dd = vW - cameraPosition; float den = dot(dd, uMouthN), tq = abs(den) > 1e-6 ? dot(uMouthC - cameraPosition, uMouthN) / den : -1.0;
        vec3 cm = cameraPosition - uMouthC; float ca = dot(cm, uMouthN);   /* the camera in: past the mouth's plane, within its radius of the axis (the dive) */
        float viaMouth = max(step(ca, 0.0) * step(length(cm - uMouthN * ca), uMouthR), step(0.0, tq) * step(tq, 1.0) * step(length(cameraPosition + dd * tq - uMouthC), uMouthR));
        float inside = (gl_FrontFacing ? 0.0 : 1.0) * step(nv0, -0.3) * (1.0 - step(uCrownR * 1.04, vR)) * step(0.08, depth) * step(max(vC.r, max(vC.g, vC.b)), 0.02) * viaMouth;
        float lid = max(lining, inside); if (uIdMode > 0.5) { gl_FragColor = vec4(lid, (1.0 - lid) * step(uCrownR * 1.04, vR), (1.0 - lid) * (1.0 - step(uCrownR * 1.04, vR)), 1.0); return; }   /* tests (E2): lining red (E3: and the felt drawn as lining), brim green, crown blue */
        float key = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.35, 0.45, 0.82))), 0.0), rim = uRimK * pow(1.0 - abs(dot(n, v)), uRimP);   /* the key from the camera's side; a faint rim (neutral; E3: 0.10, power 4 — with the cut line it keeps the crown's top edge and the band as sharp as in E2, and leaves the brim's top, seen edge-on at 100 ms, dark) */
        /* E2 (the creative chat's point 1): black felt — a base of 1 % (the band a little more), so the brim's median stays ≤ 12 % lightness;
           the rim separates the silhouette from the dark */
        float base = mix(0.010, 0.016, step(0.02, max(vC.r, max(vC.g, vC.b))));
        vec3 shell = srgb(vec3(base * key)) + vec3(rim), lin = vec3(0.8784, 0.1529, 0.1529) * (1.0 - smoothstep(0.06, 0.55, depth));   /* the lining: the brand red #E02727 at the mouth, black within */
        gl_FragColor = vec4(mix(vec3(0.0196, 0.0196, 0.0275), mix(shell, lin, max(lining, inside)), uOp), 1.0); }` });   /* from the background (#050507) to the hat */
  const introHat = new THREE.Mesh(hatGeometry(0x000000), introMat); introPivot.add(introHat);
  /* E3 (the creative chat's point 4): the cut line — the felt's shell (the crown and the brim; not the band nor the lining) drawn again by
     its back faces, pushed out on screen by uW px along its normals: what shows is a line of constant width at the silhouette (and where the
     crown stands over the brim), neutral, 18–25 %. A rim light by n·v could not do it: the model's normals at the silhouette stay 0.2–0.3
     from it (a stronger, narrower rim got darker at the edge), and at 100 ms it lit the whole brim's top, seen edge-on */
  const introHullMat = new THREE.ShaderMaterial({ side: THREE.BackSide,
    uniforms: { uW: { value: 1.25 }, uRes: { value: new THREE.Vector2(1, 1) }, uCol: { value: 0.38 }, uOp: { value: 0 }, uIdMode: { value: 0 } },
    vertexShader: 'uniform float uW; uniform vec2 uRes; void main(){ vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vec4 m = projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0); vec2 d = m.xy; float l = length(d); if (l > 1e-6) c.xy += d / l * uW * 2.0 / uRes * c.w; gl_Position = c; }',
    fragmentShader: 'uniform float uCol; uniform float uOp; uniform float uIdMode; void main(){ if (uIdMode > 0.5) { gl_FragColor = vec4(0.3, 0.3, 0.3, 1.0); return; } gl_FragColor = vec4(mix(vec3(0.0196, 0.0196, 0.0275), vec3(uCol), uOp), 1.0); }' });
  const introHull = new THREE.Mesh(new THREE.BufferGeometry(), introHullMat); introHull.visible = false; introHat.add(introHull); let hullW = 1.25, hullCol = null;
  let introRT = null, introTurn = 0, hatRaw = null, introK = 1, introOn = false, introAppear = 0, introDive = 0, anDark = false, anDarkSince = 0, entryId = 0, anHint = false, descMs = 0;
  let hatClean = null, introModel = false, rimSet = null;   // E3: the model's hat cleaned for the entry (cleanHat), once; the hat set up is the model's
  function introSetup() {          // the site's hat (the brand hat, black felt), its mouth toward the camera, 0.45 m tall
    introModel = !!hatRaw; introMat.uniforms.uRimK.value = rimSet != null ? rimSet : hatRaw ? 0.10 : 0.16;   // the lathe (no cut line) keeps E2's rim
    const g = hatRaw ? paintHat(hatClean || (hatClean = cleanHat(hatRaw)), 0x000000) : hatGeometry(0x000000); if (introHat.geometry !== g) { introHat.geometry.dispose(); introHat.geometry = g; }
    if (hatRaw && !introHull.visible) {   // the hull: the cleaned model's felt triangles (white before painting), its positions and normals shared
      const C = hatClean.attributes.color, I = hatClean.index.array, felt = i => C.getX(i) > 0.9 && C.getY(i) > 0.9, idx = [];
      for (let t = 0; t < I.length; t += 3) if (felt(I[t]) && felt(I[t + 1]) && felt(I[t + 2])) idx.push(I[t], I[t + 1], I[t + 2]);
      const hg = new THREE.BufferGeometry(); hg.setAttribute('position', hatClean.attributes.position); hg.setAttribute('normal', hatClean.attributes.normal); hg.setIndex(idx);
      introHull.geometry.dispose(); introHull.geometry = hg; introHull.visible = true; }
    g.computeBoundingBox(); const b = g.boundingBox, H = b.max.y - b.min.y; introK = 0.45 / H;
    introMat.uniforms.uY0.value = b.min.y; introMat.uniforms.uH.value = H;
    // E2 (tests): the crown's radius — the felt above 30 % of the height, from the axis; past 1.04 × that is the brim
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, P = g.attributes.position, C = g.attributes.color; let cr = 0;
    for (let i = 0; i < P.count; i++) { if (C.getX(i) > 0.5 && C.getY(i) < 0.35) continue; if ((P.getY(i) - b.min.y) / H > 0.3) cr = Math.max(cr, Math.hypot(P.getX(i) - cx, P.getZ(i) - cz)); }
    introMat.uniforms.uCX.value = cx; introMat.uniforms.uCZ.value = cz; introMat.uniforms.uCrownR.value = cr || 1;
    introHat.position.set(-cx, -b.min.y, -cz); introPivot.scale.setScalar(introK); introPivot.rotation.set(-Math.PI / 2, 0, 0);   // the mouth (y min) faces +z
    introAppear = 0; introDive = 0; introTurn = 0; introMat.uniforms.uOp.value = 0;
  }
  // E2 (the creative chat's point 1): in its first 400 ms the hat is seen at three quarters — standing, the camera above and in front (the
  // crown's top and the brim as an ellipse) — and turns its mouth to the viewer as the camera comes down and closer; it rises from the dark
  // in the first 180 ms
  function introAt(ms) { introAppear = EASE.cam(Math.min(1, ms / 180)); introTurn = EASE.between(Math.min(1, ms / 400)); }   // the house «between» curve (symmetric): EASE.cam turned it 80 % by 200 ms
  const introLook = new THREE.Vector3();
  function introFrame() {           // then the camera on the hat's axis: 1.7 m out, into its mouth, 0.25 m deep (its lining black there)
    introCam.aspect = innerWidth / innerHeight; introCam.fov = lerp(36, 30, introDive); introCam.updateProjectionMatrix();
    const rx = -Math.PI / 2 * introTurn; introPivot.rotation.set(rx, 0, 0);   // the pivot is the mouth's centre: standing (0) → mouth to the camera (−90°)
    // E3 (the creative chat's point 4): a narrow window steps the camera back, so the hat at 100 ms takes ≤ 84 % of its width (on a 16:10
    // window it takes 30 %: 0.477 / aspect; on a phone it took 103 %, the brim cut on both sides) — from 0.57:1 down
    const kD = Math.max(1, 0.568 / introCam.aspect);
    if (introDive > 0) { introCam.position.set(0, 0, lerp(1.7 * kD, -0.25, introDive)); introCam.lookAt(0, 0, -1); }
    else { introLook.set(0, 0.225 * Math.cos(rx), 0.225 * Math.sin(rx)).multiplyScalar(1 - introTurn); introCam.position.set(0, lerp(0.8, 0, introTurn), lerp(2.1, 1.7, introTurn)).sub(introLook).multiplyScalar(kD).add(introLook); introCam.lookAt(introLook); }
    introMat.uniforms.uOp.value = introAppear; introPivot.scale.setScalar(introK * lerp(0.9, 1, introAppear));   // it grows a little as it appears, about its mouth
    // E3: the mouth's disc in the world (the felt's ring at the mouth: its top, 0.03 of the model's 0.45 up, its opening r 0.160), its
    // normal out of the hat — the felt's inside takes the lining's colour only seen through it
    const mu = introMat.uniforms; introPivot.updateMatrixWorld(true);
    mu.uMouthC.value.set(mu.uCX.value, mu.uY0.value + 0.03 * mu.uH.value / 0.45, mu.uCZ.value).applyMatrix4(introHat.matrixWorld);
    mu.uMouthN.value.set(0, -1, 0).transformDirection(introHat.matrixWorld); mu.uMouthR.value = 0.160 * mu.uH.value / 0.45 * introPivot.scale.x;
    const hu = introHullMat.uniforms; hu.uOp.value = introAppear; renderer.getDrawingBufferSize(hu.uRes.value); hu.uW.value = hullW * renderer.getPixelRatio();   // E3: the cut line, hullW CSS px
    hu.uCol.value = hullCol != null ? hullCol : isPhone() ? 0.33 : Math.max(0.28, 0.38 - 0.1 * (renderer.getPixelRatio() - 1));   // measured: 0.38 on a computer at 1× (a denser screen a touch darker), 0.33 on a phone (at 0.38 its contour read 0.25–0.26)
  }
  const anDescend = short => { const from = short ? LAST_JUMP_MS : 0; return tween(short ? 'ultimo-salto' : 'descida-e', short ? 800 : DESCENT_MS, t => { descMs = from + (DESCENT_MS - from) * t; }); };
  function anLand(p, carried) {     // the 360° at eye height in the centre, facing the screen; the hint until the first move
    anState = 'galeria'; anCam = 'galeria'; anYaw = 0; anPitch = 0; galZoom = 0; anFrom = null; anCamK = 1; anHint = true; anTextIn = true;
    const t = performance.now(); log({ name: 'aterra', t }); log({ name: 'texto-entra', t });
    if (carried) enqueue(() => chooseFrom360(p));
  }
  async function anEntry(id, p, carried, gate, roomReady, diveRes = () => {}) {
    await gate; if (id !== entryId) return;
    log({ name: 'entrada-cartola', t: performance.now() });
    await tween('cartola', 400, t => { introAt(t * 400); }); if (id !== entryId) return;
    await tween('mergulho', 600, t => { introDive = EASE.cam(t); }); diveRes(); if (id !== entryId) return;   // the room's synchronous warm-up may start: the dark hides it
    const t0 = performance.now(); introOn = false; anDark = true; anDarkSince = t0; log({ name: 'entrada-escuro', dir: 1, start: t0 });
    anCam = 'descida'; anCamK = 1; anFrom = null; descMs = carried ? LAST_JUMP_MS : 0;
    await Promise.all([roomReady, new Promise(r => setTimeout(r, 300))]); if (id !== entryId) return;
    const t1 = performance.now(); anDark = false; anDarkSince = 0; log({ name: 'entrada-escuro', dir: 1, end: t1, took: Math.round(t1 - t0) });
    await anDescend(carried); if (id !== entryId) return;
    anLand(p, carried);
  }
  /* round E (Task 7): the wheel over the room — two fingers on a touchpad look around (pixels: across turns, along tilts), a pinch
     (ctrlKey) changes the lens (45–75°), a classic wheel turns step by step (wheelLook, anfie.js). In the 360° only; in «ver» a small sway
     (±8°) that comes back to the centre within ~600 ms — the room does not turn (reduced motion: none). Elsewhere, and with the case
     study open (the page unlocked, its wheel the page's), it lets the event be: no preventDefault (the creative chat's note 5). */
  // E2 (the creative chat's point 6, minor 15): the wheel is heard over the whole room — the hats' buttons and the portals' names too, not
  // only the canvas — and in every state of it the room takes the event (no page zoom, no sideways «back» in the browser); the filters' row
  // keeps its own sideways scroll. The case study (the page unlocked) keeps its wheel
  let verSway = 0;
  (canvas.closest('.k3') || canvas.parentElement || canvas).addEventListener('wheel', e => {
    if (!(anMode || introOn || anDark) || !document.documentElement.classList.contains('stage-lock')) return;   // the hat and its dark too
    if (e.target && e.target.closest && e.target.closest('.k-filters')) return;
    e.preventDefault();
    if (anState === 'galeria') { anHint = false; const w = wheelLook(e);
      if (w.dfov) { galFov = clamp(camera.fov + w.dfov, 45, 75); galZoom = 1; return; }
      anYaw += w.dyaw; anPitch = clamp(anPitch + w.dpitch, -20, 20); return; }
    if (anState === 'ver') { if (reduced()) return; const w = wheelLook(e); verSway = clamp(verSway + w.dyaw, -8, 8); }
  }, { passive: false });
  /* the gallery: stops at the portals and the oculus; the centred portal lit at 100% playing its clip (a second video: the main
     screen goes to its poster meanwhile, one film at a time), the others at 55% on their posters */
  const portalAngles = () => AN.info.portals.map(o => o.theta).sort((a, b) => a - b);   // the posters are sorted the same way (by angle)
  // the final review (decision 2 of E-DESIGN: in the 360° the filters only filter the portals and the list): a portal whose work is
  // filtered out is no stop, takes no focus or click, and dims
  const portalIn = k => list.includes(projects[k % projects.length]);
  const STOPS = () => [...portalAngles().filter((a, k) => portalIn(k)), 0].sort((a, b) => a - b);
  const portalTone = (k, i) => k === i ? 1 : portalIn(k) ? 0.55 : 0.18;
  const pvideo = document.createElement('video'); pvideo.muted = true; pvideo.loop = true; pvideo.playsInline = true; pvideo.crossOrigin = 'anonymous'; pvideo.preload = 'auto';
  const ptex = new THREE.VideoTexture(pvideo); ptex.colorSpace = THREE.SRGBColorSpace;
  function setPortalFocus(i) {
    if (i === anPortal) return; anPortal = i;
    AN.posters.forEach((o, k) => { const m = o.material; if (!m.userData.poster) m.userData.poster = m.map; m.map = k === i ? ptex : m.userData.poster; m.color.setScalar(portalTone(k, i)); m.needsUpdate = true; });
    pvideo.pause();
    if (i >= 0) { const p = projects[i % projects.length]; pvideo.src = asset(p.clip); pvideo.load(); const pr = pvideo.play(); if (pr && pr.catch) pr.catch(() => {});
      video.pause(); screenMat.map = posterTex; screenMat.needsUpdate = true; }                    // one film at a time
  }
  function galleryOff() {          // the portals back on their posters at 55%, the main film playing again
    setPortalFocus(-1); AN.posters.forEach((o, k) => { o.material.color.setScalar(portalTone(k, -1)); });
    if (cur) { const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  function nearestPortal() {
    const ang = portalAngles(); let best = -1, bd = 25;
    ang.forEach((a, k) => { if (!portalIn(k)) return; const d = Math.abs(((anYaw - a) % 360 + 540) % 360 - 180); if (d < bd) { bd = d; best = k; } }); return best;
  }
  function turnTo(yaw, dur = 700, label = 'roda') { const y0 = anYaw, p0 = anPitch; anCam = 'galeria'; anCamK = 1; if (galZoom > 0) unzoom(); return tween(label, dur, t => { const k = EASE.cam(t); anYaw = lerp(y0, yaw, k); anPitch = lerp(p0, 0, k); }); }
  /* C2b · a portal centred (an arrow, Tab, the end of a drag): the camera tilts to its centre and the lens closes (500 ms) until the portal
     fills 30% of the width (65% on a phone); turning again opens it back (300 ms). The lens is worked out from the portal's projected width. */
  let galZoom = 0, galFov = 60;
  function portalBoxPx(k) {
    const o = AN.posters[k]; if (!o) return null; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox, xs = [], ys = [], v = new THREE.Vector3();
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v.set(x, y, z).applyMatrix4(o.matrixWorld).project(camera); xs.push((v.x + 1) / 2 * innerWidth); ys.push((1 - v.y) / 2 * innerHeight); }
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), pct: Math.round((Math.max(...xs) - Math.min(...xs)) / innerWidth * 1000) / 10 };
  }
  function zoomOn(k) {
    const o = AN.posters[k]; if (!o) return Promise.resolve(); const c = o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld), pos = new THREE.Vector3(...AN.info.cams.galeria.pos);
    const elev = THREE.MathUtils.radToDeg(Math.atan2(c.y - pos.y, Math.hypot(c.x - pos.x, c.z - pos.z))), fOpen = isPhone() ? 84 : AN.info.cams.galeria.fov;
    // the portal's width now (the lens open, already turned to it) → the lens that makes it the target share
    const box = portalBoxPx(k), share = box ? (box.right - box.left) / innerWidth : 0.14, target = isPhone() ? 0.65 : 0.30;
    galFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(lerp(fOpen, galFov, galZoom)) / 2) * share / target));
    const z0 = galZoom, p0 = anPitch; return tween('zoom', 500, t => { const e = EASE.cam(t); galZoom = lerp(z0, 1, e); anPitch = lerp(p0, elev, e); });
  }
  function unzoom() { const z0 = galZoom, p0 = anPitch; return tween('abre', 300, t => { const e = EASE.cam(t); galZoom = lerp(z0, 0, e); anPitch = lerp(p0, 0, e); }); }
  function portalAtYaw(yaw) { const a = portalAngles(); for (let k = 0; k < a.length; k++) if (portalIn(k) && Math.abs(((yaw - a[k]) % 360 + 540) % 360 - 180) < 1) return k; return -1; }
  function turnStop(d) {           // ← → : the next stop to the left or right (a portal, or the oculus at 0°)
    const st = STOPS(); let best = null; anHint = false;   // round E: the landing's hint goes at the first move
    for (const s of st) for (const w of [-360, 0, 360]) { const a = s + w; if (d > 0 ? a > anYaw + 1 : a < anYaw - 1) if (best == null || (d > 0 ? a < best : a > best)) best = a; }
    return turnTo(best == null ? anYaw : best).then(() => { const k = portalAtYaw(anYaw); return k >= 0 && anState === 'galeria' ? zoomOn(k) : null; });
  }
  canvas.addEventListener('pointerdown', e => { if (!anMode || anState !== 'galeria') return; anHint = false; if (galZoom > 0) unzoom(); const x0 = e.clientX, y0 = e.clientY, a0 = anYaw, p0 = anPitch; anDragged = false;
    const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) anDragged = true; anYaw = a0 - (ev.clientX - x0) / innerWidth * 120; anPitch = Math.max(-20, Math.min(20, p0 + (ev.clientY - y0) / innerHeight * 40)); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      // the end of a drag near a portal (within 25°): it settles on it and the lens closes
      if (anDragged && anState === 'galeria') { const k = nearestPortal(); if (k >= 0) enqueue(async () => { if (anState !== 'galeria') return; const a = portalAngles()[k], d = ((a - anYaw) % 360 + 540) % 360 - 180; await turnTo(anYaw + d, 300, 'assenta'); await zoomOn(k); }); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  let filmReads = 0, filmScr = 0;   // tests only (E2): how many times the film has been read; the gloss last given to the room
  function readFilm() {          // the 16 × 16 picture's mean, in sRGB and in linear light
    filmReads++; const d = filmCx.getImageData(0, 0, 16, 16).data, m = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) { const v = d[i * 4 + c] / 255; m[c] += v; m[c + 3] += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
    anFilm.target = [m[0] / 256, m[1] / 256, m[2] / 256]; anFilm.lin = [m[3] / 256, m[4] / 256, m[5] / 256];
  }
  let filmBusy = false;
  function sampleFilm(now) {     // the film's mean colour, read four times a second, smoothed over 400 ms (decision 7)
    const src = screenMat.map === vtex ? video : posterTex.image;
    // E2: not during the entry — the reading waits for the GPU, and on a cold first load the GPU is still busy with it (a trace: a 72 ms
    // GetImageData mid-descent); the film's light holds until the landing
    if (now - anFilmT > 250 && !filmBusy && anState !== 'entrada' && src && (src.videoWidth || src.width)) {
      anFilmT = now;
      // round D3b: the frame comes already shrunk to 16 × 16 and off the frame's own path (createImageBitmap) — drawing the whole video
      // into the readable canvas copied it from the GPU on the spot: 55–79 ms frames every 250 ms on an integrated GPU
      if (typeof createImageBitmap === 'function') { filmBusy = true;
        createImageBitmap(src, { resizeWidth: 16, resizeHeight: 16, resizeQuality: 'low' }).then(bm => { try { filmCx.clearRect(0, 0, 16, 16); filmCx.drawImage(bm, 0, 0); readFilm(); } catch (e) { anFilm.target = null; } finally { bm.close(); filmBusy = false; } },
          () => { anFilm.target = null; filmBusy = false; }); }
      else try { filmCx.drawImage(src, 0, 0, 16, 16); readFilm(); } catch (e) { anFilm.target = null; }
    }
    const tg = anFilm.target || [0.06, 0.06, 0.06];          // no reading (a tainted canvas): the neutral light of phase B
    for (let i = 0; i < 3; i++) anFilm[i] += (tg[i] - anFilm[i]) * Math.min(1, 16 / 400);
    // the final review of E2: the film's gloss on the room eased as its light is (it jumped in one frame at the first reading)
    const tl0 = anFilm.lin || [0.005, 0.005, 0.005]; if (!anFilm.linS) anFilm.linS = [0.005, 0.005, 0.005];
    for (let i = 0; i < 3; i++) anFilm.linS[i] += (tl0[i] - anFilm.linS[i]) * Math.min(1, 16 / 400);
    const on = screen.visible ? 1 : 0, e = AN.screenMat.uniforms.uEmit.value * on, lin = anFilm.linS;
    AN.setFilm([anFilm[0] * anFilmK * on, anFilm[1] * anFilmK * on, anFilm[2] * anFilmK * on]); AN.setScreen([lin[0] * e, lin[1] * e, lin[2] * e]);
    filmScr = (0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]) * e;   // tests only (E2): the film's gloss on the room, its luminance
  }
  function setLight(k) {                       // 0 «sala acesa» → 1 «espetáculo»
    lightMix = k; if (TH) TH.setLight(k);
    // matched by eye to the Cycles frames: the velvet darker in the show, its base lit by the footlights
    thCloth.uniforms.uAmb.value = lerp(0.22, 0.10, k); thCloth.uniforms.uKey.value = lerp(0.72, 0.45, k); thCloth.uniforms.uFoot.value = lerp(0.18, 0.62, k);
  }
  function setMode(on) {
    thMode = !!(on && TH);
    for (const o of SIMPLE) o.visible = !thMode;
    if (TH) TH.group.visible = thMode;
    SCREEN.c.y = thMode ? 3.74 : 3.9; shown.pos.copy(SCREEN.c);
    // in the theatre the hats take less light: the yellow and the pink, fully lit, read brighter than the film (§14: the film leads)
    hatSpot.intensity = thMode ? 34 : 60; key.intensity = thMode ? 0.32 : 0.6;
  }
  // the framings (decisions of 19–20 Nov): laptop «à porta» / «no lugar» (1180×820 and narrower: a wider lens), phone one
  function thPoses() {
    const asp = innerWidth / innerHeight, wide = asp >= 1.55, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const P = isPhone() ? (p => ({ porta: p, lugar: p }))({ pos: V(0, 2.3, 12), look: V(0, 3.6, -4), fov: 62 })
      : { porta: { pos: V(0, 2.4, 12), look: V(0, 3.6, -4), fov: wide ? 44 : 48 }, lugar: { pos: V(0, 1.6, 9), look: V(0, wide ? 4.1 : 3.8, -4), fov: wide ? 40 : 44 } };
    const f = P.lugar.fov, hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f / 2)) * asp), dc = SCREEN.w / 0.86 / (2 * Math.tan(hfov / 2));
    P.case = { pos: V(0, SCREEN.c.y - 0.2, SCREEN.c.z + dc), look: SCREEN.c.clone(), fov: f };
    return P;
  }
  // the descent «à porta» → «no lugar»: 2 400 ms on the house curve, 300 ms after a work has come out of its hat
  function descend() {
    if (!thMode || isPhone() || reduced()) { camT = 1; return Promise.resolve(); }
    camT = 0;
    return new Promise(r => setTimeout(r, 300)).then(() => runTL('descida3d', 2400, t => { camT = EASE.between(t / 2400); }));
  }

  let anNoScreen = false, anStill = false;   // anStill: tests only — the measure of the shafts holds reduced motion's freeze
  let anLean = 0, lowFor = 0, anCountFrom = Infinity;   // the light amphitheatre's guard (see the frame loop): level 0, 1 or 2
  const LEAN_RES = [1, 0.75, 0.6]; let anSlowTest = 0, anLeanNow = false;   // tests only: anSlowTest — ms of work added to each frame, as a slow GPU would; anLeanNow — the next level at the next frame
  /* tests only: what the picture shows, pixel by pixel (an id pass: screen, water, hats, lamps, posters, sky, fog bank, the three
     rings of trees; the rest is the room), with the measures of §15 taken from the real frame */
  function measureAnfi() {
    const gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    renderer.render(scene, camera); const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // ids in 8 bits: flat materials are written through the sRGB curve (so their colour is set in sRGB), the cards' shaders raw
    const PAL = { tela: [255, 0, 0], agua: [0, 255, 0], lampadas: [255, 255, 0], portais: [255, 0, 255], ceu: [0, 255, 255], nevoeiro: [255, 255, 255],
      perto: [255, 128, 0], meio: [0, 255, 128], longe: [128, 0, 255], chao: [96, 96, 96], cartola0: [0, 0, 255], cartola1: [0, 0, 128], cartola2: [128, 128, 255], cartola3: [128, 255, 255], lenco: [200, 60, 120] };
    const C = k => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(PAL[k][0] / 255, PAL[k][1] / 255, PAL[k][2] / 255, THREE.SRGBColorSpace), toneMapped: false });
    const swaps = [], hide = [], black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    const sw = (o, m) => { swaps.push([o, o.material]); o.material = m; };
    sw(screen, C('tela')); hats.forEach((h, i) => sw(h, C('cartola' + (i % 4)))); if (silk.visible) { const u = silkMat.uniforms; u.uIdOn.value = 1; u.uId.value = new THREE.Color(PAL.lenco[0] / 255, PAL.lenco[1] / 255, PAL.lenco[2] / 255); swaps.push([silk, silkMat, () => { u.uIdOn.value = 0; }]); }
    if (silkC.visible) { const u = silkCMat.uniforms; u.uIdOn.value = 1; u.uId.value = new THREE.Color(PAL.lenco[0] / 255, PAL.lenco[1] / 255, PAL.lenco[2] / 255); swaps.push([silkC, silkCMat, () => { u.uIdOn.value = 0; }]); }   // round E: the cloth silk
    const sRGB = k => new THREE.Color(PAL[k][0] / 255, PAL[k][1] / 255, PAL[k][2] / 255);   // the shaders write their id raw (they return before the sRGB step)
    for (const ls of AN.lampSets) { const u = ls.mat.uniforms; u.uIdOn.value = 1; u.uId.value = sRGB('lampadas'); swaps.push([ls.points, ls.mat, () => { u.uIdOn.value = 0; }]); }
    AN.group.traverse(o => {
      if (!o.isMesh) return; const n = o.name;
      if (o.userData.noId) { hide.push(o); return; }
      if (o === AN.ground) { sw(o, C('chao')); return; }
      if (o === AN.sky) sw(o, Object.assign(C('ceu'), { side: THREE.BackSide, depthWrite: false }));
      else if (n.startsWith('SM_Lamp')) sw(o, C('lampadas'));
      // round E: the posters are drawn both sides (setPosters) and seen from inside the shell by their back — a front-only id left them out
      else if (n.startsWith('REF_Portal')) sw(o, Object.assign(C('portais'), { side: THREE.DoubleSide }));
      else if (n.startsWith('SM_Stage_Water')) sw(o, C('agua'));
      else if (n.startsWith('SM_TreeD_')) {               // round D: the 3D forest — LOD 0 (within 24 m) «perto», LOD 1 «longe»
        const u = o.material.uniforms; u.uIdOn.value = 1; u.uId.value = sRGB(n.startsWith('SM_TreeD_near') ? 'perto' : 'longe'); swaps.push([o, o.material, () => { u.uIdOn.value = 0; }]);
      }
      else if (n.startsWith('SM_Tree_') || n.startsWith('SM_FogBank')) {
        const k = n.startsWith('SM_FogBank') ? 'nevoeiro' : { near: 'perto', mid: 'meio', far: 'longe' }[n.slice(8).split('_')[0]], u = o.material.uniforms;
        u.uIdOn.value = 1; u.uId.value = sRGB(k); swaps.push([o, o.material, () => { u.uIdOn.value = 0; }]);
      }
      else if (o.material && o.material.transparent && o.renderOrder === 4) hide.push(o);
      else sw(o, black);
    });
    const hid = hide.filter(o => o.visible);   // round E: only what is on is hidden, and only that comes back (the beams switched off stay off)
    hid.forEach(o => { o.visible = false; }); const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera); const id = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, id);
    renderer.toneMapping = tm; hid.forEach(o => { o.visible = true; }); for (const [o, m, f] of swaps) { if (f) f(); else o.material = m; }
    const names = Object.keys(PAL), pal = names.map(k => PAL[k]);
    const lum = new Float32Array(W * H), cls = new Uint8Array(W * H);   // 0 the room, 1… the palette, 255 an edge between two (left out)
    for (let i = 0; i < W * H; i++) {
      const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const R = id[i * 4], G = id[i * 4 + 1], Bb = id[i * 4 + 2]; if (R + G + Bb < 40) { cls[i] = 0; continue; }
      let best = 0, bd = 1e9; pal.forEach((p, k) => { const d = (p[0] - R) ** 2 + (p[1] - G) ** 2 + (p[2] - Bb) ** 2; if (d < bd) { bd = d; best = k + 1; } });
      cls[i] = bd <= 3 * 24 * 24 ? best : 255;
    }
    const L = names.indexOf('lampadas') + 1, lamp = new Uint8Array(W * H);      // the lamps' mask grows 2 px (glow, antialiased edge)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cls[y * W + x] === L) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) lamp[yy * W + xx] = 1; }
    const by = {}, hatL = [[], [], [], []], hatRGB = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], q = (a, p) => { if (!a.length) return null; a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
    const rest = [], sb = [1e9, 1e9, -1, -1]; let red = 0, silkTop = [0, 0, 0, -1], silkLit = 0; const redBy = {};
    for (let i = 0; i < W * H; i++) {
      if (cls[i] === 255) continue;
      const c = cls[i] ? names[cls[i] - 1] : 'sala', key = c.startsWith('cartola') ? 'cartolas' : c; (by[key] = by[key] || []).push(lum[i]);
      if (c.startsWith('cartola')) hatL[+c.slice(7)].push(lum[i]);
      if (c.startsWith('cartola') && lum[i] > 0.05) { const h = hatRGB[+c.slice(7)]; h[0] += px[i * 4]; h[1] += px[i * 4 + 1]; h[2] += px[i * 4 + 2]; h[3]++; }
      if (c !== 'tela' && c !== 'portais' && !lamp[i] && c !== 'lampadas') rest.push(lum[i]);
      const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (c === 'lenco') { const xx = i % W, yy = (i - xx) / W; if (xx < sb[0]) sb[0] = xx; if (xx > sb[2]) sb[2] = xx; if (yy < sb[1]) sb[1] = yy; if (yy > sb[3]) sb[3] = yy; }
      if (c === 'lenco') { const R_ = px[i * 4], G_ = px[i * 4 + 1], B_ = px[i * 4 + 2], mx_ = Math.max(R_, G_, B_), sat_ = mx_ ? (mx_ - Math.min(R_, G_, B_)) / mx_ : 0;
        if (sat_ > 0.65 && R_ === mx_ && lum[i] > silkTop[3]) silkTop = [R_, G_, B_, lum[i]]; else if (sat_ <= 0.65 && lum[i] > 0.3) silkLit++; }   // its reddest bright point; lit pixels = a lamp or a strand in front of it
      // the brand red, outside the silk (and the red hat, the fifth): only the silk may be red (criterion 5)
      else if (mx > 0.4 && d / mx > 0.65 && r >= mx) { const hh = (60 * (g - b) / Math.max(d, 1e-6) + 360) % 360; if (hh < 12 || hh > 348) { redBy[c] = (redBy[c] || 0) + 1; if (c !== 'tela' && c !== 'portais') red++; } }   // the films' own colours (screen, portals) are the files', counted apart
    }
    const pct = v => v == null ? null : Math.round(v * 1000) / 10, out = { w: W, h: H };
    out.media_fora_da_tela = pct(rest.reduce((a, b) => a + b, 0) / rest.length); out.fora_p99_9 = pct(q(rest.slice(), 0.999));
    out.tela_p99 = by.tela && by.tela.length > 500 ? pct(q(by.tela.slice(), 0.99)) : null; out.vermelho_pct = Math.round(red / (W * H) * 100000) / 1000;
    out.vermelho_por_classe = redBy;
    // C2b: the silk's shape — its area over the rectangle around it (a flat sheet face-on is 1; a crumpled, tumbling cloth much less)
    if (by.lenco && by.lenco.length > 20) { const ba = (sb[2] - sb[0] + 1) * (sb[3] - sb[1] + 1); out.lenco_forma = { px: by.lenco.length, caixa: [sb[0], H - 1 - sb[3], sb[2], H - 1 - sb[1]], razao: Math.round(by.lenco.length / ba * 100) / 100 }; }
    // the silk's own brightest point, without the lamps and strands that hang in front of it and add their light (criterion 5)
    // round E: how much of the screen's rectangle the silk covers (the id pass; the screen's corners projected)
    if (silkC.visible) { const c = screen.position, sx = SCREEN.w / 2 * screen.scale.x, sy = SCREEN.h / 2 * screen.scale.y, xs = [], ys = [], v = new THREE.Vector3();
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { v.set(c.x + a * sx, c.y + b * sy, c.z).project(camera); xs.push((v.x + 1) / 2 * W); ys.push((v.y + 1) / 2 * H); }   // buffer rows run from the bottom
      const x0 = Math.max(0, Math.ceil(Math.min(...xs))), x1 = Math.min(W - 1, Math.floor(Math.max(...xs))), y0 = Math.max(0, Math.ceil(Math.min(...ys))), y1 = Math.min(H - 1, Math.floor(Math.max(...ys)));
      const Lc = names.indexOf('lenco') + 1; let n = 0, k = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { k++; if (cls[y * W + x] === Lc) n++; }
      out.lenco_sobre_tela = k ? Math.round(n / k * 1000) / 1000 : null;
      // E3: the screen's central box (40 % × 40 %) — the swap must never leave it in view
      const cx0 = Math.round(x0 + (x1 - x0) * 0.3), cx1 = Math.round(x0 + (x1 - x0) * 0.7), cy0 = Math.round(y0 + (y1 - y0) * 0.3), cy1 = Math.round(y0 + (y1 - y0) * 0.7); let nc = 0, kc = 0;
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { kc++; if (cls[y * W + x] === Lc) nc++; } out.lenco_centro = kc ? Math.round(nc / kc * 1000) / 1000 : null; }
    // E2 (the creative chat's correction to Task 5): the cloth's own colour is measured with the sheen off — the sheen is light on it (≤ 66/255)
    if (silk.visible || silkC.visible) { const off = [], sv = silkCMat.uniforms.uSheen.value; silkCMat.uniforms.uSheen.value = 0; AN.group.traverse(o => { if (o.visible && (o.userData.noId || o.isPoints)) { off.push(o); o.visible = false; } }); renderer.render(scene, camera); const sp = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, sp); off.forEach(o => { o.visible = true; }); silkCMat.uniforms.uSheen.value = sv;
      // round E: the silk's inside only (its 8 neighbours silk too) — an antialiased edge over the bright screen mixed the two ([205, 69, 72])
      const L_ = names.indexOf('lenco') + 1, inside = i => { const x = i % W; if (x < 1 || x > W - 2 || i < W || i >= W * (H - 1)) return false; for (const o of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) if (cls[i + o] !== L_) return false; return true; };
      let top = [0, 0, 0], tl = -1; for (let i = 0; i < W * H; i++) if (cls[i] === L_ && inside(i)) { const l = 0.2126 * sp[i * 4] + 0.7152 * sp[i * 4 + 1] + 0.0722 * sp[i * 4 + 2]; if (l > tl) { tl = l; top = [sp[i * 4], sp[i * 4 + 1], sp[i * 4 + 2]]; } }
      out.lenco_sozinho = { mais_claro: top, dif_max: Math.max(Math.abs(top[0] - 224), Math.abs(top[1] - 39), Math.abs(top[2] - 39)) }; }
    if (silkTop[3] >= 0) out.lenco = { px: (by.lenco || []).length, luzes_a_frente_px: silkLit, mais_claro: silkTop.slice(0, 3), dif_max: Math.max(Math.abs(silkTop[0] - 224), Math.abs(silkTop[1] - 39), Math.abs(silkTop[2] - 39)) };
    // round E: where the portals' pixels are (CSS px, from the top), to hold them inside the posters' own boxes
    { const P_ = names.indexOf('portais') + 1, b = [1e9, 1e9, -1, -1]; for (let i = 0; i < W * H; i++) if (cls[i] === P_) { const x = i % W, y = H - 1 - (i - x) / W; if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }
      out.portais_caixa = b[2] < 0 ? null : { left: Math.round(b[0] * innerWidth / W), right: Math.round((b[2] + 1) * innerWidth / W), top: Math.round(b[1] * innerHeight / H), bottom: Math.round((b[3] + 1) * innerHeight / H) }; }
    out._cls = cls; out._names = names; out._lum = lum; out._px = px;
    out.classes = {}; for (const [k, v] of Object.entries(by)) out.classes[k] = { n: v.length, mediana: pct(q(v.slice(), 0.5)), p99: pct(q(v.slice(), 0.99)) };
    const md = k => out.classes[k] ? out.classes[k].mediana : null, fundo = [md('ceu'), md('nevoeiro'), md('chao')].filter(v => v != null);
    out.oculo = { perto: md('perto'), meio: md('meio'), longe: md('longe'), fundo_min: fundo.length ? Math.min(...fundo) : null };
    out.oculo.troncos_mais_escuros = ['perto', 'meio', 'longe'].every(k => out.oculo[k] == null || out.oculo.fundo_min == null || out.oculo[k] < out.oculo.fundo_min);
    // where the water is, in the 32 × 20 blocks of criterion 9 (image rows from the top), so the sheet can show the criterion without it
    // (round E: and where the portals are — criterio9_d leaves both out; site_shots_d's oval mask stays as the check)
    for (const [k, key] of [['agua', 'blocos_agua'], ['portais', 'blocos_portais']]) { const A = names.indexOf(k) + 1, wb = new Float32Array(640); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cls[y * W + x] === A) wb[Math.min(19, Math.floor((H - 1 - y) * 20 / H)) * 32 + Math.min(31, Math.floor(x * 32 / W))]++;
      const per = (W / 32) * (H / 20); out[key] = Array.from(wb, v => Math.round(v / per * 100) / 100); }
    // the hats' size on screen: the widest row of each (px), for the brim against the render
    out.cartolas_largura_px = [0, 1, 2, 3].map(j => { const c = names.indexOf('cartola' + j) + 1; let best = 0; for (let y = 0; y < H; y++) { let a = -1, b = -1; for (let x = 0; x < W; x++) if (cls[y * W + x] === c) { if (a < 0) a = x; b = x; } if (a >= 0) best = Math.max(best, b - a + 1); } return best || null; });
    const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1e-6; let h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d; return (h * 60 + 360) % 360; };
    const BRAND = ['#fbae9c', '#81cfe3', '#ffc718', '#2f77b1'].map(x => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]);
    out.cartolas_tom = hatRGB.map((h, i) => { if (!h[3]) return null; const c = [h[0] / h[3], h[1] / h[3], h[2] / h[3]], dh = Math.abs(((hue(c) - hue(BRAND[i])) + 540) % 360 - 180); return { tom: Math.round(hue(c)), marca: Math.round(hue(BRAND[i])), desvio: Math.round(dh * 10) / 10 }; });
    // review of C1b: each hat between 12 and 30% (its median), its saturation ≥ 70% of the Brand Kit colour's
    const satv = ([r, g, b]) => { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx : 0; };
    out.cartolas_lum = hatL.map(a => pct(q(a.slice(), 0.5)));
    out.cartolas_sat = hatRGB.map((h, i) => h[3] ? Math.round(satv([h[0] / h[3], h[1] / h[3], h[2] / h[3]]) / satv(BRAND[i]) * 100) / 100 : null);
    out.lampadas_px = AN.corePx(camera, H, renderer.getPixelRatio());   // the largest core of the spiral and of the strand tips (px)
    return out;
  }
  /* state */
  let list = projects.slice(), index = -1, cur = null, camK = 0, caseK = 0, curtainK = 1, active = false, seenOpen = false, dolly = 0;
  const pointer = { x: 0, y: 0 }, cam = { x: 0, y: 0 };
  const shown = { pos: SCREEN.c.clone(), scale: 1, op: 0 };
  addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });

  let hatsX = 0;                     // world x of the row's centre (laptop: under 68% of the width, clear of the text; phone: centred)
  function hatSlot(i, n) { return (i - (n - 1) / 2) * 1.1; }
  function layoutHats(t = 1) { const vis = hats.filter(h => list.includes(projects[h.userData.i])); vis.forEach((h, k) => { h.userData.tx = hatSlot(k, vis.length); }); }
  function hatMouth(h) { return new THREE.Vector3(h.position.x, h.position.y + 0.43, h.position.z); }

  /* media */
  let loadId = 0;
  function show(p) {
    cur = p; const id = ++loadId;
    const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { if (id !== loadId) return; if (posterTex.image && (posterTex.image.width !== im.width || posterTex.image.height !== im.height)) posterTex.dispose(); posterTex.image = im; posterTex.needsUpdate = true;   /* a poster of another size: the GPU copy is reallocated */ if (screenMat.map !== vtex || video.readyState < 2) { screenMat.map = posterTex; reflMat.uniforms.map.value = posterTex; screenMat.needsUpdate = true; } };
    im.src = asset(p.poster);
    const ready = posterReady.get(p);   // C2b: a poster already decoded (the card's) goes on the screen in this same frame, never the last work's
    if (ready) { if (posterTex.image && (posterTex.image.width !== ready.width || posterTex.image.height !== ready.height)) posterTex.dispose(); posterTex.image = ready; posterTex.needsUpdate = true; }
    screenMat.map = posterTex; reflMat.uniforms.map.value = posterTex; screenMat.needsUpdate = true;   // the poster until the new film plays
    if (video.getAttribute('src') !== asset(p.clip)) { video.pause(); video.src = asset(p.clip); video.load(); }   // C2b: a film already loaded (under the veil) is not loaded again
    const pr = video.play(); if (pr && pr.catch) pr.catch(() => {});
    onShown && onShown(p, list.indexOf(p), list.length);
  }
  video.addEventListener('playing', () => { screenMat.map = vtex; reflMat.uniforms.map.value = vtex; screenMat.needsUpdate = true; });

  /* timelines */
  const tl = { name: null, t: 0, dur: 0, start: 0, render: null, done: null };
  const queue = [];
  function runTL(name, dur, render) {
    // the final review of E2: a timeline started over a running one (the case study's Back over a silk swap) first finishes that one — its
    // last frame drawn and its promise kept — or the job waiting on it never ended and the queue stood still for good
    if (tl.render) { const r = tl.render, d = tl.done, n = tl.name; tl.render = null; tl.done = null; try { r(tl.dur); } catch (e) {} log({ name: n, dir: 1, end: performance.now(), took: Math.round(performance.now() - tl.start), cortada: true }); d && d(); }
    return new Promise(res => { tl.name = name; tl.dur = dur; tl.start = performance.now(); tl.render = render; tl.done = res; log({ name, dir: 1, start: tl.start }); render(0); });
  }
  function tick() {
    if (!tl.render) return;
    const t = Math.min(tl.dur, performance.now() - tl.start); tl.render(t);
    if (t >= tl.dur) { const d = tl.done, n = tl.name; tl.render = null; tl.done = null; log({ name: n, dir: 1, end: performance.now(), took: Math.round(performance.now() - tl.start) }); d && d(); next(); }
  }
  // one job at a time: a job that is not a timeline (a camera journey, the opening, a compile) also holds the queue until it ends
  let running = false;
  async function next() { if (running || tl.render || !queue.length) return; running = true; const job = queue.shift(); try { await job(); } catch (e) { console.warn('[mockup] stage job', e); } finally { running = false; } next(); }
  function enqueue(job) { queue.push(job); next(); }
  const busy = () => running || !!tl.render || queue.length > 0 || tweens.length > 0;

  // «da cartola» on the stage: the hat tilts, a glowing card rises on an arc and grows into the screen (1100 ms), 120 motes
  /* C2b · the amphitheatre's «da cartola»: a card of its own — the new work's poster — rises out of the hat clicked (0.3 m wide at its
     mouth) and flies on a low arc into the oculus, landing at 700 ms of the swap's 1 100 (C2c). The film on the screen stays until the card
     is almost there and fades in the 250 ms before it lands: the oculus is never empty. As it lands the screen takes the new work (the same
     poster, then its film) and the title changes. */
  let card = null, cardTex = null, cardLoad = 0;
  const posterImg = new Map(), posterReady = new Map();     // every work's poster, decoded ahead: the card leaves the hat the moment it is clicked
  function posterOf(p) { if (!posterImg.has(p)) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = asset(p.poster); posterImg.set(p, (im.decode ? im.decode().then(() => im, () => im) : new Promise(r => { im.onload = im.onerror = () => r(im); })).then(x => { if (x.naturalWidth) posterReady.set(p, x); return x; })); } return posterImg.get(p); }
  // round E: hi — the hat it comes out of (drawn by lot, or the one clicked); none: the work's own. E2: follow(t, cardPosition, landed) —
  // called every frame of the flight (the camera that follows the card), and once more as it lands
  function cardFromHat(i, p, hi = null, follow = null) {
    const h = hats[hi != null ? hi : projects.indexOf(p)], m = hatMouth(h), S0 = SCREEN.c.clone(), ctrl = new THREE.Vector3((m.x + S0.x) / 2, 6.4, (m.z + S0.z) / 2);   // C2c: a lower arc (z +1.2 → 0): it no longer swells in front of the screen
    if (!card) { cardTex = new THREE.Texture(); cardTex.colorSpace = THREE.SRGBColorSpace; const mat = AN.screenMat.clone(); mat.uniforms.map.value = cardTex; mat.uniforms.uOp.value = 1;
      card = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), mat); card.visible = false; card.renderOrder = 2; scene.add(card); }
    if (reduced()) return runTL('fade', T_FADE, t => { if (t >= T_FADE / 2 && cur !== p) { show(p); index = i; } shown.op = Math.abs(t / T_FADE - 0.5) * 2; });
    const id = ++cardLoad;
    return posterOf(p).then(im => {
      if (id !== cardLoad) return;
      if (cardTex.image && (cardTex.image.width !== im.width || cardTex.image.height !== im.height)) cardTex.dispose(); cardTex.image = im; cardTex.needsUpdate = true;
      // E2 (the creative chat's point 3): the card leaves the hat 0.6 m wide and grows slowly at first (k²), so it is seen whole as it comes out
      burst.visible = true; burstMat.uniforms.uO.value.copy(m); strandsFlash(); const s0 = 0.6 / SCREEN.w, s1 = AN_SCALE;
      // C2c: the flight takes about 60% of the 1 100 ms — the card lands on the screen at 700 ms; the title changes the moment it lands
      const LAND = 700; let landed = false;
      return runTL('fromHat3d', T_OUT, t => {
        h.userData.tilt = Math.sin(fit(t, 0, 420) * Math.PI) * 0.35; h.userData.trick = t < T_OUT - 150 ? 1 : 0;   // the final review: the hat drawn tilts and glows (decision 1)
        if (landed) return;
        const k = EASE.cam(fit(t, 80, LAND)), a = 1 - k;
        card.visible = t < LAND; card.position.set(a * a * m.x + 2 * a * k * ctrl.x + k * k * S0.x, a * a * m.y + 2 * a * k * ctrl.y + k * k * S0.y, a * a * m.z + 2 * a * k * ctrl.z + k * k * (S0.z + 0.04));
        card.scale.setScalar(lerp(s0, s1, k * k)); card.material.uniforms.uOp.value = fit(t, 0, 80);
        // E3 (the creative chat's point 3): for the first third of the flight the card faces the camera (upright), then turns to the screen's
        // plane as it lands (a slerp on EASE.cam) — seen edge-on from a hat at the side it read as a blade, not a film
        card.lookAt(camera.position); const kr = EASE.cam(fit(t, LAND / 3, LAND)); if (kr > 0) card.quaternion.slerp(_qScreen, kr);
        shown.op = 1 - fit(t, LAND - 250, LAND);                                // the old film, under the card's arrival
        burstMat.uniforms.uK.value = fit(t, 0, 700); burst.visible = t < 700;
        if (follow) follow(t, card.position, t >= LAND);
        if (t >= LAND) { landed = true; burst.visible = false; show(p); index = i; shown.pos.copy(S0); shown.scale = 1; shown.op = 1; card.visible = false; log({ name: 'carta-assenta', t: performance.now() }); }
      });
    });
  }
  /* round E (E-DESIGN «Escolher um projeto»): a work chosen in the 360° — the camera turns and looks down at a hat drawn by lot (never the
     last one; a hat clicked: that one), with the lens open (700 ms; 1 300 ms from over 120° away); the work's card leaves it. E2 (the
     creative chat's point 3): the camera follows the card, aimed at it every frame of its flight (eased in from the hat over 120 ms), to
     the screen; as it lands, the camera goes to the viewing pose «ver» (1 400 ms). The work already on the screen: straight to «ver». */
  let lastHat = -1;
  async function chooseFrom360(p, hi = null) {
    if (!anMode || anState !== 'galeria' || !p || !list.includes(p)) return;
    anState = 'escolha'; galleryOff(); anHint = false;
    if (p !== cur && reduced()) { await camTo('ver', 1400, 'para-ver'); await cardFromHat(list.indexOf(p), p); }   // round E Task 6: reduced motion — a fade, no hat
    else if (p !== cur) {
      const h = hi != null ? hi : pickHat(lastHat, Math.min(4, hats.length)); lastHat = h;
      const m = hatMouth(hats[h]), a = aimAt(AN.info.cams.galeria.pos, [m.x, m.y, m.z]), d = ((a.yaw - anYaw) % 360 + 540) % 360 - 180, y0 = anYaw, p0 = anPitch, z0 = galZoom;
      anCam = 'galeria'; anCamK = 1; anFrom = null;
      await tween('ao-chapeu', Math.abs(d) > 120 ? 1300 : 700, t => { const k = EASE.cam(t); anYaw = y0 + d * k; anPitch = lerp(p0, a.pitch, k); galZoom = lerp(z0, 0, k); });
      log({ name: 'chapeu', i: h, t: performance.now() });
      const g = AN.info.cams.galeria.pos, y1 = anYaw, p1 = anPitch; let landRes; const landed = new Promise(r => { landRes = r; });
      const fly = cardFromHat(list.indexOf(p), p, h, (t, c, done) => {
        if (done) { landRes(); return; }
        const q = aimAt(g, [c.x, c.y, c.z]), k = EASE.cam(Math.min(1, t / 120));
        anYaw = y1 + (((q.yaw - y1) % 360 + 540) % 360 - 180) * k; anPitch = lerp(p1, q.pitch, k); });
      await Promise.race([landed, fly]); await camTo('ver', 1400, 'para-ver'); await fly;
    } else await camTo('ver', 1400, 'para-ver');
    galZoom = 0; anState = 'ver'; log({ name: 'ver', t: performance.now() });
  }
  // tests only: how much of the oculus is covered now — the screen's own film (its opacity) or the card (its share of the screen's size)
  function oculusCover() { const img = screenMat.map === posterTex && posterTex.image ? posterTex.image.src || '' : null;
    return { tela: +shown.op.toFixed(3), carta: card && card.visible ? +Math.min(1, card.scale.x / AN_SCALE).toFixed(3) : 0, cartaz: img == null ? 'filme' : (cur && img === new URL(asset(cur.poster), location.href).href ? 'certo' : 'outro') }; }
  function outOfHat(i, p) {
    const h = hats[projects.indexOf(p)], m = hatMouth(h), ctrl = new THREE.Vector3((m.x + SCREEN.c.x) / 2, 6.4, (m.z + SCREEN.c.z) / 2 + 1.2);
    show(p); index = i;
    if (reduced()) return runTL('fade', T_FADE, t => { shown.pos.copy(SCREEN.c); shown.scale = 1; shown.op = t / T_FADE; });
    burst.visible = true; burstMat.uniforms.uO.value.copy(m); if (anMode) strandsFlash();
    const E = anMode ? EASE.cam : EASE.enter;     // the amphitheatre: the house curve in everything (C2)
    return runTL('fromHat3d', T_OUT, t => {
      const k = E(fit(t, 80, T_OUT)), a = 1 - k;
      h.userData.tilt = Math.sin(fit(t, 0, 420) * Math.PI) * 0.35;
      shown.pos.set(a * a * m.x + 2 * a * k * ctrl.x + k * k * SCREEN.c.x, a * a * m.y + 2 * a * k * ctrl.y + k * k * SCREEN.c.y, a * a * m.z + 2 * a * k * ctrl.z + k * k * SCREEN.c.z);
      shown.scale = lerp(0.04, 1, k); shown.op = fit(t, 0, 120);
      burstMat.uniforms.uK.value = fit(t, 0, 700); burst.visible = t < 700;
      camK = Math.sin(fit(t, 0, T_OUT) * Math.PI) * 0.4;
    });
  }
  // back into its own hat (400 ms, exit curve)
  function intoHat(p) {
    const h = hats[projects.indexOf(p)], m = hatMouth(h), ctrl = new THREE.Vector3((m.x + SCREEN.c.x) / 2, 6.4, (m.z + SCREEN.c.z) / 2 + 1.2);
    if (reduced()) return runTL('fade', T_FADE / 2, t => { shown.op = 1 - t / (T_FADE / 2); });
    return runTL('intoHat3d', T_IN, t => {
      const k = 1 - EASE.exit(t / T_IN), a = 1 - k;
      shown.pos.set(a * a * m.x + 2 * a * k * ctrl.x + k * k * SCREEN.c.x, a * a * m.y + 2 * a * k * ctrl.y + k * k * SCREEN.c.y, a * a * m.z + 2 * a * k * ctrl.z + k * k * SCREEN.c.z);
      shown.scale = lerp(0.04, 1, k); shown.op = t > T_IN - 60 ? fit(t, T_IN, T_IN - 60) : 1;
      camK = fit(t, 0, T_IN) * 0.4;
    });
  }
  // the silk (900 ms): sweeps across 0.75 m in front of the screen, fully covering it 380–460 ms; the film swaps at 420 ms
  function silkTo(i, p, dir) {
    if (reduced()) return runTL('fade', T_FADE, t => { if (t >= T_FADE / 2 && cur !== p) { show(p); index = i; } shown.op = Math.abs(t / T_FADE - 0.5) * 2; });
    // the amphitheatre: the silk scaled to the 9.6 m screen, on the house curve (C2)
    const S = anMode ? SILK_AN : 1, sw = SCREEN.w * (anMode ? AN_SCALE : 1), E = anMode ? EASE.cam : EASE.between;
    const half = 10.5 * S / 2, xs = -(half + sw / 2 + 1.2), x1 = -(half - sw / 2) + 0.15, x2 = -x1, xe = -xs;
    silk.visible = true; silk.scale.setScalar(S); silk.rotation.set(0, 0, dir * -12 * Math.PI / 180); silkMat.uniforms.uPullT.value = 0; silkMat.uniforms.uCrumple.value = 0; silkMat.uniforms.uDiag.value = 0; silkMat.uniforms.uPhase.value = Math.random() * 6;
    return runTL('silk3d', T_SILK, t => {
      let x = t < 380 ? lerp(xs, x1, E(fit(t, 0, 380))) : t < 460 ? lerp(x1, x2, fit(t, 380, 460)) : lerp(x2, xe, E(fit(t, 460, 900)));
      silk.position.set(dir * x, SCREEN.c.y, SCREEN.c.z + 0.75);   // 0.75 m out: the doubled waves reach ±0.52 m and must never dip behind the screen
      silkMat.uniforms.uT.value = t / 1000; silkMat.uniforms.uAmp.value = 0.30 * Math.sin(fit(t, 0, 900) * Math.PI) + 0.06;
      if (t >= 420 && cur !== p) { show(p); index = i; if (anMode) strandsFlash(); }
      camK = anMode ? 0 : Math.sin(fit(t, 0, T_SILK) * Math.PI) * 0.4;
      if (t >= T_SILK) silk.visible = false;
    });
  }
  /* round E (E-DESIGN «a troca no modo de visualização»): the silk out of a hat — real cloth, folded like a fan, held by one corner. On a
     computer the hand rises from the bottom of the frame under its hat (the hats are below the frame); on a phone it leaves the hat in view.
     It grows to the screen's size (0.5 → 13.1 m wide) as it rises; a second hand takes its other top corner at 250 ms and shows it open over
     the screen, 0.95 of its width apart (from ~480 ms); the work changes under it at 400 ms (E3; 560 until E2); at 650 ms the first hand lets go and the second
     pulls it away to the other side, faster and faster (1 100 ms). The cloth lives in its own units (1 wide); the stage moves and scales it,
     and the air it meets is the stage's motion (it trails behind). A frame over 100 ms (a hidden tab) replays it from the hand. */
  const SILK_MS = 1100, SILK_W = 15.8, SILK_SWAP_MS = 400;   // E3: the film swaps at the cloth's own 400 ms — the cover's best common to seeds 7, 3 and 11 on both screens (100 %; at 560 a computer's was 97.4–99 %)   // E2: a larger cloth (13.1 → 15.8 m), so the belly still covers the screen
  let silkSeedT = null, silkMsAvg = 0, lastSilk = null;
  function silkPlan(h, seed) {
    const hat = hats[h], d = hat.position.x < 0 ? 1 : -1, z = SCREEN.c.z + 0.75, C = new THREE.Vector3(SCREEN.c.x, SCREEN.c.y, z);
    let S; if (isPhone()) S = hatMouth(hat);
    else { const P = poseOf('ver'), yb = P.pos.y - (P.pos.z - z) * Math.tan(THREE.MathUtils.degToRad(P.fov / 2)); S = new THREE.Vector3(hat.position.x, yb - 0.6, z); }
    const st = { cloth: createCloth({ nx: SNX, ny: SNY, seed, inelastic: 1 }), h, d, S, C, seed }; silkRestart(st, 0); return st;
  }
  function silkRestart(st, to) { st.cloth.reset([0, 0, 0], 'pleat'); st.cloth.attach(); st.ms = 0; st.b0 = null; st.freeA = false; silkAdvance(st, to); }
  const silkGrow = ms => EASE.cam(fit(ms, 0, 480)), silkScale = ms => lerp(0.5, SILK_W, silkGrow(ms));
  const silkOrigin = (st, ms, out) => out.copy(st.S).lerp(st.C, silkGrow(ms));
  const SO0 = new THREE.Vector3(), SO1 = new THREE.Vector3();
  // the simulation from st.ms toward «to» (ms) in whole steps of 1/120 s; what is left waits for the next frame (the cloth drawn ≤ 8 ms
  // behind). The final review: cut at each frame's edge, a step of a few hundredths of a millisecond (the frames' jitter) took the cloth's
  // momentum away — the live silk drifted 0.27 of its width from the exact one, the sheets showed only the exact
  const SILK_H = 1000 / 120;
  function silkAdvance(st, to) {
    const c = st.cloth;
    while (st.ms + SILK_H <= to + 1e-6) {
      const t1 = st.ms + SILK_H, dt = SILK_H / 1000;
      if (t1 >= 250 && !st.b0) { c.attach2(); const B = (SNX - 1) * 3; st.b0 = [c.pos[B], c.pos[B + 1], c.pos[B + 2]]; }
      if (t1 >= 650 && !st.freeA) { c.release(); st.freeA = true; }
      const kA = EASE.cam(fit(t1, 0, 450)), A = st.freeA ? null : [-0.40 * kA, 0.43 * kA, 0];   // E2: the hands 0.80 of the width apart (0.95 in E), a belly between them; the top corners above the frame
      let Bh = null; if (st.b0) { const kB = EASE.cam(fit(t1, 250, 480)), kX = fit(t1, 650, SILK_MS); Bh = [lerp(st.b0[0], 0.40, kB) + 1.6 * kX * kX, lerp(st.b0[1], 0.43, kB) + 0.15 * kX, lerp(st.b0[2], 0, kB)]; }   // out of the frame by ~1 050 ms
      // the air: 35 % of the stage's speed (in cloth units) — at full strength the phone's flight from the hat back to the screen blew the
      // cloth toward the camera, and a silk falls too slowly to hang again by 500 ms
      silkOrigin(st, st.ms, SO0); silkOrigin(st, t1, SO1); const s = silkScale(t1), v = SO1.sub(SO0).divideScalar(dt * s / 0.35);
      c.step(dt, A, [-v.x * st.d, -v.y, -v.z + 0.25], Bh);
      st.ms = t1;
    }
  }
  function silkShow(st) {               // the mesh where the simulation is (E2: drawn from its smooth surface, SRK points per span)
    const g = silkCGeo.attributes.position;
    if (SRK > 1) { smoothGrid(st.cloth.pos, SNX, SNY, SRK, g.array); gridNormals(g.array, SRX, SRY, silkCN); } else { g.array.set(st.cloth.pos); st.cloth.normals(silkCN); }
    g.needsUpdate = true; silkCGeo.attributes.normal.needsUpdate = true;
    const s = silkScale(st.ms); silkOrigin(st, st.ms, silkC.position); silkC.scale.set(st.d * s, s, s); silkC.visible = true;
    silkCMat.uniforms.uFilm.value = 0.35 * (0.2126 * anFilm[0] + 0.7152 * anFilm[1] + 0.0722 * anFilm[2]);
  }
  // one frame of the live swap: at most 50 ms of cloth per frame — after a long frame the silk falls a little behind and catches up over
  // the next frames (the final review: replaying the whole swap after a frame over 100 ms could itself make the next frame long, again)
  function silkFrame(st, t) { silkAdvance(st, Math.min(t, st.ms + 50)); }
  function silkClothTo(i, p, dir = 1, hi = null) {
    if (reduced()) return runTL('fade', T_FADE, t => { if (t >= T_FADE / 2 && cur !== p) { show(p); index = i; } shown.op = Math.abs(t / T_FADE - 0.5) * 2; });
    const h = hi != null ? hi : pickHat(lastHat, Math.min(4, hats.length)); lastHat = h;
    const st = silkPlan(h, silkSeedT != null ? silkSeedT : (Math.random() * 2 ** 31) | 0); let swapped = false;
    log({ name: 'lenco-chapeu', i: h, t: performance.now() });
    return runTL('lenco3d', SILK_MS, t => {
      const t0 = performance.now(); silkFrame(st, t); silkShow(st);   // E2: the cost counts the drawn mesh too
      silkMsAvg = silkMsAvg ? silkMsAvg * 0.9 + (performance.now() - t0) * 0.1 : performance.now() - t0;
      hats[h].userData.tilt = Math.sin(fit(t, 0, 420) * Math.PI) * 0.35; hats[h].userData.trick = t < 600 ? 1 : 0;   // the hat it comes out of tilts and glows (decision 1)
      if ((st.ms >= SILK_SWAP_MS || t >= SILK_MS) && !swapped && cur !== p) { swapped = true; show(p); index = i; strandsFlash(); }   // when the cloth covers the screen (its own time; at the end at the latest)
      if (t >= SILK_MS) silkC.visible = false;
    });
  }
  function curtains(open, entry = false) {
    if (reduced()) { setCurtains(open ? 0 : 1); dolly = 0; setLight(open ? 1 : 0); return Promise.resolve(); }
    const from = curtainK, to = open ? 0 : 1;
    // the entry shot: the camera starts ENTRY_BACK metres further back, the whole house in view, and arrives as the curtains open
    // in the theatre there is no dolly: the house light goes from «sala acesa» to «espetáculo» as the curtains open
    return runTL('curtains3d', T_CURTAIN, t => { const k = EASE.between(t / T_CURTAIN); curtainK = lerp(from, to, k); setCurtains(curtainK); if (entry && !thMode) dolly = 1 - k; if (thMode) setLight(open ? Math.max(lightMix, k) : Math.min(lightMix, 1 - k)); });
  }

  /* camera: in the stalls, framed so the screen fills 64–70% of the width (phone ≥ 88%); follows the cursor with a soft lag */
  let base = new THREE.Vector3(0, CAM.y, 9.5), casePos = new THREE.Vector3(0, 3.2, 3.5), camBackT = -1;
  function setRes() {   // the light amphitheatre: less resolution
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isPhone() ? 1.5 : 2) * (anMode ? LEAN_RES[anLean] : 1)); renderer.setSize(innerWidth, innerHeight, false);
  }
  function frame() {
    const W = innerWidth, H = innerHeight, ph = isPhone();
    setRes();
    if (anMode) { camera.aspect = W / H; const P = anPose(); camera.fov = P.fov; camera.updateProjectionMatrix(); return; }
    if (thMode) {
      TP = thPoses(); camera.aspect = W / H;
      // the hats' row: under 68% of the width as seen «no lugar» (phone: centred)
      camera.fov = TP.lugar.fov; camera.updateProjectionMatrix(); camera.position.copy(TP.lugar.pos); camera.lookAt(TP.lugar.look); camera.updateMatrixWorld();
      hatsX = 0;
      if (!ph) { const q = new THREE.Vector3(0, 1.22, -0.22).project(camera), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0.68 * 2 - 1, q.y), camera); const k = (-0.22 - ray.ray.origin.z) / ray.ray.direction.z; hatsX = ray.ray.origin.x + ray.ray.direction.x * k; }
      hatSpot.position.x = hatSpot.target.position.x = hatsX;
      burstMat.uniforms.uPR.value = dustMat.uniforms.uPR.value = renderer.getPixelRatio();
      return;
    }
    camera.aspect = W / H; camera.fov = CAM.fov; camera.updateProjectionMatrix();
    const share = ph ? 0.9 : 0.67, hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2)) * camera.aspect);
    const d = SCREEN.w / share / (2 * Math.tan(hfov / 2));                // distance from the screen plane
    base = new THREE.Vector3(0, CAM.y + (ph ? (d - 13.5) * 0.06 : 0), SCREEN.c.z + d);
    const dc = SCREEN.w / 0.86 / (2 * Math.tan(hfov / 2));                 // case study: the screen at ~86% of the width
    casePos = new THREE.Vector3(0, 3.2 + (ph ? 0.4 : 0), SCREEN.c.z + dc);
    burstMat.uniforms.uPR.value = dustMat.uniforms.uPR.value = renderer.getPixelRatio();
    camera.position.copy(base); camera.lookAt(CAM.look); camera.updateMatrixWorld(); placeSeats();
    hatsX = 0;
    if (!ph) {
      const q = new THREE.Vector3(0, 1.22, -0.22).project(camera), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0.68 * 2 - 1, q.y), camera);
      const k = (-0.22 - ray.ray.origin.z) / ray.ray.direction.z; hatsX = ray.ray.origin.x + ray.ray.direction.x * k;
    }
    hatSpot.position.x = hatSpot.target.position.x = hatsX;
    valance.visible = !ph && !thMode;   // the phone frames the screen only: a valance there would float as a loose red band
  }
  addEventListener('resize', () => { if (active) frame(); });

  /* frame loop + the fps guard (below 24 fps for 2 s: the flat version) */
  let slowFor = 0, failed = false, fpsCb = null;
  // round D, the owner's option (b): the amphitheatre goes light when the GPU cannot keep up — 2 s of frames under 50 fps, counted from
  // the entry into Work (round D3b; under the veil too), single hitches over 250 ms (the warm-up's compiles) left out — and stays light
  // for the visit: level 1, the trees out of the water's mirror and 0.75 of the resolution; still slow 2 s more, level 2, 0.6 (the text is
  // HTML: it stays sharp) — anLean, lowFor, anCountFrom, LEAN_RES
  onFrame((dt, now) => {
    if (!active) return;
    tick();
    if (introOn) { runTweens(now); introFrame(); renderer.render(introScene, introCam); return; }   // round E: the hat and the dive, before the room
    const still = reduced();
    cam.x = damp(cam.x, still ? 0 : pointer.x * CAM.sway.x, 2.6, dt); cam.y = damp(cam.y, still ? 0 : -pointer.y * CAM.sway.y, 2.6, dt);
    if (camBackT >= 0) { /* the approach after a swap returns over 800 ms */ }
    if (anMode && AN) {
      if (anSlowTest) { const t0 = performance.now(); while (performance.now() - t0 < anSlowTest); }
      runTweens(now); AN.freeze(reduced() || anStill);
      if (verSway) verSway = Math.abs(verSway) < 0.01 || anState !== 'ver' ? 0 : damp(verSway, 0, 5, dt);   // round E: the sway goes back to the centre
      const P = anPose(); let pos = P.pos, look = P.look, fov = P.fov;
      if (anFrom && anCamK < 1) { const k = EASE.cam(anCamK); pos = anFrom.pos.clone().lerp(P.pos, k); look = anFrom.look.clone().lerp(P.look, k); fov = lerp(anFrom.fov, P.fov, k);
        const o = anFrom.open; if (o) { const ms = anCamK * o.dur; fov = ms < o.ms ? lerp(anFrom.fov, o.fov, EASE.cam(ms / o.ms)) : lerp(o.fov, P.fov, EASE.cam((ms - o.ms) / (o.dur - o.ms))); } }   // C2c: the lens opens first
      camera.position.copy(pos); anLook.copy(look);
      if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(look);
      if (anState === 'galeria') setPortalFocus(nearestPortal());
      AN.tick(now / 1000); sampleFilm(now); AN.setViewport(renderer.getContext().drawingBufferHeight, renderer.getPixelRatio());
      if (anLean < 2 && now > anCountFrom && dt > 0 && dt < 0.25) lowFor = 1 / dt < 50 ? lowFor + dt : Math.max(0, lowFor - dt);
      if (anLean < 2 && (lowFor > 2 || anLeanNow)) { anLean++; lowFor = 0; anCountFrom = now + 500; if (AN.lean) AN.lean(true);   // the switch's own frame not counted
        setRes(); AN.setViewport(renderer.getContext().drawingBufferHeight, renderer.getPixelRatio());   // D3: only the resolution — frame() would put the lens at rest mid-journey
        log({ name: 'anfi-leve', nivel: anLean, fps: Math.round(1 / dt), ...(anLeanNow ? { motivo: 'teste' } : {}) }); anLeanNow = false; }
    } else if (thMode && TP) {
      const a = TP.porta, b = TP.lugar, ck = EASE.cam(caseK);
      const pos = a.pos.clone().lerp(b.pos, camT).lerp(TP.case.pos, ck), look = a.look.clone().lerp(b.look, camT).lerp(TP.case.look, ck);
      const fov = lerp(lerp(a.fov, b.fov, camT), TP.case.fov, ck);
      const toward = look.clone().sub(pos).normalize().multiplyScalar(camK);
      camera.position.set(pos.x + cam.x * (1 - caseK), pos.y + cam.y * (1 - caseK), pos.z).add(toward);
      if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(look);
    } else {
    const pos = new THREE.Vector3().lerpVectors(base, casePos, EASE.cam(caseK));
    const toward = new THREE.Vector3().subVectors(CAM.look, pos).normalize().multiplyScalar(camK);
    camera.position.set(pos.x + cam.x * (1 - caseK), pos.y + cam.y * (1 - caseK), pos.z + ENTRY_BACK * dolly).add(toward);
    camera.lookAt(lerp(CAM.look.x, SCREEN.c.x, caseK), lerp(CAM.look.y, SCREEN.c.y, caseK), CAM.look.z);
    }
    if (!tl.render) camK = damp(camK, 0, 1000 / T_CAM_BACK * 3, dt);
    // the screen floats ±4 cm over 7 s
    const fl = still ? 0 : Math.sin(now / 1000 * Math.PI * 2 / 7) * 0.04;
    screen.position.copy(shown.pos).add(new THREE.Vector3(0, fl, 0)); screen.scale.setScalar(Math.max(0.001, shown.scale) * (anMode ? AN_SCALE : 1)); screenMat.opacity = shown.op; screen.visible = shown.op > 0.001 && !anNoScreen;
    if (anMode && AN) { AN.screenMat.uniforms.map.value = screenMat.map; AN.screenMat.uniforms.uOp.value = shown.op;   // the shafts keep off the screen only while it shows (a negative size: no screen)
      if (AN.setNoScreen) AN.setNoScreen(screen.position, screen.visible ? SCREEN.w / 2 * screen.scale.x : -1, screen.visible ? SCREEN.h / 2 * screen.scale.y : -1); }
    refl.visible = screen.visible && shown.scale > 0.98 && !anMode; reflMat.uniforms.uO.value = 0.18 * shown.op;
    // hats: lifted 0.15 m and lit when theirs is on the screen; out of the filter they sink under the stage — round E: not in the
    // amphitheatre, where a hat is no work's (props, all four always there, clickable)
    for (const h of hats) {
      const u = h.userData, on = !anMode && cur && projects[u.i] === cur, inList = anMode || list.includes(projects[u.i]), glowOn = anMode ? !!u.trick : on;   // the amphitheatre: only the hat a trick comes out of glows
      u.lift = damp(u.lift, on ? 0.15 : 0, 8, dt); u.sink = damp(u.sink, inList ? 0 : 1, 10, dt); u.x = damp(u.x, u.tx, 7.5, dt);
      if (anMode && AN) {      // the hats on the oculus side of the stage's edge, −70° … +70° (B2)
        const I = AN.info.hats, th = THREE.MathUtils.degToRad(I.theta[u.i % I.theta.length]), g = h.geometry;
        if (!g.boundingBox || g.userData.bbFor !== g.uuid) { g.computeBoundingBox(); g.userData.bbFor = g.uuid; }
        const k = AN.info.hat_height / (g.boundingBox.max.y - g.boundingBox.min.y);
        h.scale.setScalar(k); h.position.set(I.r * Math.sin(th), I.y - g.boundingBox.min.y * k + u.lift, -I.r * Math.cos(th)); h.rotation.set(u.tilt || 0, -th, 0, 'YXZ');   // its tilt about its own side
      } else { h.scale.setScalar(1); h.position.set(u.x + hatsX, 1.0 + u.lift - u.sink * 0.8, -0.22); }   /* at the very front of the stage */
      if (!(anMode && AN)) h.rotation.set(0.12 + (u.tilt || 0), Math.sin(now / 1000 * 0.5 + u.i) * 0.15, 0, 'XYZ');
      if (hatsReal) h.material.vertexColors = true;
      u.glow = damp(u.glow || 0, glowOn ? 1 : 0, 8, dt); if (h.material.emissive) h.material.emissive.setScalar(glowOn ? 0.12 : 0); else if (h.material.uniforms) h.material.uniforms.uOn.value = u.glow; h.visible = u.sink < 0.98;
    }
    dustMat.uniforms.uT.value = now / 1000;
    renderer.render(scene, camera);
    if (anDark) renderer.clear();   // round E: the hat's dark — the room drawn (its shaders warm, the guard measures it) but not shown
    if (!still && dt > 0) { if (1 / dt < 24) slowFor += dt; else slowFor = Math.max(0, slowFor - dt); if (slowFor > 2 && !failed) { failed = true; fpsCb && fpsCb(); } }
  });

  return {
    renderer, scene, camera, screen, curtains: { l: curtL, r: curtR }, hats, silk,
    get index() { return index; }, get current() { return cur; }, get list() { return list; }, busy, get caseK() { return caseK; },
    onSlow(fn) { fpsCb = fn; },
    filterNow(l) { list = l.slice(); layoutHats(); hats.forEach(h => { h.userData.x = h.userData.tx; }); },
    resetVisit() { seenOpen = false; anSeen = false; },
    // C2b: resolves once the amphitheatre is ready to be seen (models in, shaders compiled, a frame drawn) — the page lifts its veil then
    ready() { return readyP; },
    enter(i = 0, { gate, carried = false } = {}) {   // round E: carried — the page brought a work («See the case study»): it comes out of a hat on landing
      if (anfiOn()) {
        let readyRes; readyP = new Promise(r => { readyRes = r; });
        anCountFrom = performance.now(); lowFor = 0;   // D3b: the light guard counts from the entry (under the dark too: a slow machine is light within ~2 s; the compiles' hitches over 250 ms are left out)
        active = true; setMode(false); queue.length = 0; tl.render = null; running = false; caseK = 0; camK = 0; finishTweens();
        for (const o of SIMPLE) o.visible = false; if (TH) TH.group.visible = false;
        const p = list[Math.max(0, Math.min(list.length - 1, i))], id = ++entryId, rm = reduced(), first = !anSeen && !rm;
        anSeen = true; anHint = false; anDark = false; introOn = false; anTextIn = false;
        // round E: the first entry in a visit dives into the hat, drawn at once (the page lifts its veil on it); the room loads and warms
        // meanwhile, and the dark lasts until roomReady
        let roomRes, diveRes; const roomReady = new Promise(r => { roomRes = r; }), diveDone = new Promise(r => { diveRes = r; });
        // the hat waits up to 400 ms for the room's own loading (under the page's veil): from the cache the room is parsed and built on the
        // main thread within a few hundred ms, and that work, landing as the hat began to appear, stopped its first frame for ~145 ms
        // E3 (the final review, C1): the hat shown is the model's (cleaned, with its cut line), not the lathe drawn while it loads — the page's
        // veil waits for it too (≤ 1 500 ms; 79 KB, from the cache a few ms; the lathe only if it fails), then the hat is set up again
        if (first) { anState = 'entrada'; setRes(); introSetup(); introOn = true;
          const model = hatRaw ? Promise.resolve() : Promise.race([hatLoad, new Promise(r => setTimeout(r, 1500))]).then(() => { if (id === entryId && hatRaw && !introModel) introSetup(); });
          Promise.all([model, Promise.race([ensureAnfi(), new Promise(r => setTimeout(r, 400))])]).then(() => requestAnimationFrame(() => requestAnimationFrame(readyRes))); enqueue(() => anEntry(id, p, carried, gate, roomReady, diveRes)); }
        const go = async () => {
          if (id !== entryId) return;
          // round D3 (point 3, the creative chat's proposal): a narrow touch screen — a phone, whose GPU no desk test stands for — starts
          // light (level 1); the guard may still take it to level 2. A narrow desk window does not (no touch).
          if (anLean < 1 && isPhone() && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)) { anLean = 1; if (AN.lean) AN.lean(true); log({ name: 'anfi-leve', nivel: 1, motivo: 'telemovel' }); }
          anCam = rm ? 'galeria' : 'descida'; descMs = first && !carried ? 0 : LAST_JUMP_MS; anCamK = 1; anFrom = null; anYaw = 0; anPitch = 0; galZoom = 0;
          setAnfi(true); AN.freeze(rm); frame(); projects.forEach(posterOf); silk.visible = false; silkC.visible = false; setPortalFocus(-1); AN.setMix(1); AN.setStrandFlash(0);
          // the first work already playing on the screen when we land; a work brought by the page comes out of a hat (the screen empty till then)
          if (carried) { cur = null; shown.op = 0; } else { show(p); index = list.indexOf(p); shown.pos.copy(SCREEN.c); shown.scale = 1; shown.op = 1; }
          try { renderer.compile(scene, camera); } catch (e) {}
          if (first) {
            // every shader ready before the descent's first frame: compiled, then one real frame drawn with what will show (the silk, the
            // screen, the motes) — the water's mirror compiles its own variants in it (round D review). In the first entry all of this
            // runs in the hat's dark: go waits for the dive's end (below)
            const sv = screen.visible; silkC.visible = true; screen.visible = true; burst.visible = true;
            try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
              if (AN.mirrorTarget) { const rt = renderer.getRenderTarget(); renderer.setRenderTarget(AN.mirrorTarget()); renderer.compile(scene, camera); renderer.setRenderTarget(rt); }
              renderer.render(scene, camera); } catch (e) {}
            silkC.visible = false; screen.visible = sv; burst.visible = false; log({ name: 'compilado', programas: renderer.info.programs.length });
            // the film too: playing, its first frame already on the GPU (it cost 176 ms in view) — at most 2.5 s
            if (!carried) await new Promise(res => { if (!video.paused && video.readyState >= 2) return res(); const to = setTimeout(res, 2500); video.addEventListener('playing', () => { clearTimeout(to); res(); }, { once: true }); });
            try { vtex.needsUpdate = true; renderer.initTexture(vtex); } catch (e) {} log({ name: 'filme-pronto', readyState: video.readyState });
            // the final review of E2: the film's light read once here, in the dark (its wait for the GPU hidden), so the room lands in it —
            // not in the neutral light that the first reading after the landing then changed
            if (!carried) { const src = screenMat.map === vtex ? video : posterTex.image;
              try { if (src && (src.videoWidth || src.width)) { filmCx.clearRect(0, 0, 16, 16); filmCx.drawImage(src, 0, 0, 16, 16); readFilm(); for (let i = 0; i < 3; i++) anFilm[i] = anFilm.target[i]; anFilm.linS = anFilm.lin.slice(); } } catch (e) {} }
            roomRes(); return;
          }
          // a later entry: the page's veil, then the last jump (800 ms); reduced motion: the 360° at once, under the page's fade
          if (rm) { anLand(p, carried); requestAnimationFrame(() => requestAnimationFrame(readyRes)); return; }
          anState = 'entrada'; requestAnimationFrame(() => requestAnimationFrame(readyRes));
          enqueue(async () => { await gate; if (id !== entryId) return; await anDescend(true); if (id !== entryId) return; anLand(p, carried); });
        };
        // round E: in the first entry the room is made ready only once the dive has ended, in the dark it hides in — compiled while the hat
        // was in view (even compileAsync builds its programs on the main thread), it stopped frames of the hat for 160–460 ms
        const start = () => first ? diveDone.then(go) : go();
        if (AN) start(); else { if (!first) shown.op = 0; ensureAnfi().then(a => { if (a && active) start(); }); }
        return;
      }
      setAnfi(false);
      active = true; const want = theatreOn();
      setMode(want); camT = thMode && !isPhone() && !reduced() ? 0 : 1; frame(); layoutHats(); hats.forEach(h => { h.userData.x = h.userData.tx; });
      const p = list[Math.max(0, Math.min(list.length - 1, i))];
      queue.length = 0; tl.render = null; running = false; shown.op = 0; caseK = 0;
      // the theatre not there yet: wait for it (the simple house shows meanwhile, curtains closed, screen dark)
      if (want && !TH) for (const o of SIMPLE) o.visible = false;   // dark until it arrives: never a flash of the simple stage
      if (want && !TH) enqueue(() => ensureTheatre().then(() => { setMode(true); camT = !isPhone() && !reduced() ? 0 : 1; frame(); layoutHats(); hats.forEach(h => { h.userData.x = h.userData.tx; }); try { renderer.compile(scene, camera); } catch (e) {} }));
      // compile every material now and let two frames pass, so the first trick is not eaten by shader compilation
      try { renderer.compile(scene, camera); } catch (e) {}
      enqueue(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (!seenOpen && !reduced()) { seenOpen = true; curtainK = 1; setCurtains(1); dolly = want ? 0 : 1; setLight(0); enqueue(() => curtains(true, true)); }
      else { curtainK = 0; setCurtains(0); seenOpen = true; dolly = 0; setLight(1); }
      enqueue(() => outOfHat(list.indexOf(p), p));
      if (want) enqueue(() => descend());
    },
    leave() { active = false; ++entryId; introOn = false; anDark = false; video.pause(); pvideo.pause(); finishTweens(); },
    // arrows, keys, swipe: the silk; a request made mid-trick waits its turn
    // round E: in «ver» the cloth silk out of a hat drawn by lot
    // the final review: the amphitheatre decides when the arrow's turn comes, not when it is pressed — the 360° turns, «ver» swaps with the
    // cloth silk, anything else (the entry, a choice, «Look around» on its way) waits for the state it lands in; the old silk never here
    step(d) { enqueue(() => { if (anMode) { if (anState === 'galeria') return turnStop(d); if (anState !== 'ver') return; }
      const i = clamp(index + d, 0, list.length - 1); if (i === index) return Promise.resolve(); return anMode ? silkClothTo(i, list[i], d) : silkTo(i, list[i], d); }); },
    // a hat: back into the current one (400 ms), out of the chosen one (1100 ms)
    // the amphitheatre (C2): the work rises out of its hat as a glowing card and flies to the oculus (1100 ms)
    // round E: in the amphitheatre a hat is not a work's — clicked, the next work comes out of it (no draw): in the 360° with the trick
    // above, in «ver» with the silk
    pick(pi) { if (anMode) { enqueue(async () => { const nx = list[(Math.max(0, index) + 1) % list.length];
        if (anState === 'galeria') return chooseFrom360(nx, pi);
        if (anState === 'ver') { if (nx !== cur) return silkClothTo(list.indexOf(nx), nx, 1, pi); return; }
        const p = projects[pi]; if (anState !== 'lugar' || !list.includes(p) || p === cur) return; await cardFromHat(list.indexOf(p), p); }); return; } enqueue(async () => { const p = projects[pi]; if (!list.includes(p) || p === cur) return; if (cur) await intoHat(cur); await outOfHat(list.indexOf(p), p); }); },
    filter(newList) {
      enqueue(() => {
        list = newList.slice(); layoutHats();
        // round E: the work on the screen filtered out — in the 360° the first of the list comes out of a hat drawn by lot; in «ver» the silk
        return runTL('filter3d', 400, () => {}).then(() => { if (anMode && AN) { anPortal = -2; setPortalFocus(anState === 'galeria' ? nearestPortal() : -1); }   // the final review: the portals filtered out dim
          if (!list.includes(cur)) { if (anMode && anState === 'ver') return silkClothTo(0, list[0], 1); if (anMode) { show(list[0]); index = 0; if (anPortal >= 0) { video.pause(); screenMat.map = posterTex; screenMat.needsUpdate = true; } return; }   /* (one film at a time) the 360° and the rest: the far screen takes the list's first work, no trick, no camera move (decision 2) */ return silkTo(0, list[0], 1); }
          index = list.indexOf(cur); onShown && onShown(cur, index, list.length); });
      });
    },
    caseStudy(on) {
      const from = caseK, to = on ? 1 : 0;
      if (thMode && !on) camT = isPhone() ? 1 : 0;   // «Back to the stage» returns to the door and repeats the descent
      const p = runTL('case3d', reduced() ? 1 : T_CASE, t => { caseK = lerp(from, to, reduced() ? 1 : EASE.cam(t / T_CASE)); });
      if (thMode && !on) p.then(() => enqueue(() => descend()));
      return p;
    },
    pickAt(x, y) {   // which hat is under the pointer (screen px)
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hats.filter(h => h.visible), false)[0]; return hit ? hit.object.userData.i : -1;
    },
    project(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; },
    // round E: the screen's width in the frame, 0–1 (what of it is inside the window)
    anfiScreenShare() { const r = this.screenRect(); return Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) / innerWidth; },
    screenRect() { const c = screen.position, s = screen.scale.x, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => this.project(new THREE.Vector3(c.x + a * SCREEN.w / 2 * s, c.y + b * SCREEN.h / 2 * s, c.z))); const xs = pts.map(q => q.x), ys = pts.map(q => q.y); return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }; },
    // E2: the share of the screen's rectangle inside the window (0–1); 0 when a corner is behind the camera (the rectangle is then meaningless)
    screenVisible() { const c = screen.position, s = screen.scale.x; camera.updateMatrixWorld(); let behind = false;
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const v = new THREE.Vector3(c.x + a * SCREEN.w / 2 * s, c.y + b * SCREEN.h / 2 * s, c.z); if (v.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) behind = true; return this.project(v); });
      if (behind) return 0; const xs = pts.map(q => q.x), ys = pts.map(q => q.y), l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys), A = (r - l) * (b - t);
      return A > 0 ? Math.max(0, Math.min(innerWidth, r) - Math.max(0, l)) * Math.max(0, Math.min(innerHeight, b) - Math.max(0, t)) / A : 0; },
    // E3 (point 1): the share of a band of the window, rows y0–y1 (px from the top), with the screen behind it — a ray from the camera
    // through each point of a 24 × 3 grid, against the screen's plane; continuous as the camera turns, a corner behind it or not
    screenBehind(y0, y1) { const c = screen.position, s = screen.scale.x, hw = SCREEN.w / 2 * s, hh = SCREEN.h / 2 * s, o = camera.position; camera.updateMatrixWorld(); let n = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 24; i++) { const x = (i + 0.5) / 24, y = (y0 + (y1 - y0) * (j + 0.5) / 3) / innerHeight;
        _sb.set(x * 2 - 1, 1 - y * 2, 0.5).unproject(camera).sub(o); if (Math.abs(_sb.z) < 1e-6) continue; const t = (c.z - o.z) / _sb.z; if (t <= 0) continue;
        if (Math.abs(o.x + _sb.x * t - c.x) <= hw && Math.abs(o.y + _sb.y * t - c.y) <= hh) n++; }
      return n / 72; },
    // E3 (point 1): the film's visible span, rows top–bottom (px): its outline sampled (16 points an edge), only the points in the window's
    // columns — in perspective the bounding box of the corners is not the film; null with a point behind the camera or none in the window
    screenSpan() { const c = screen.position, s = screen.scale.x, hw = SCREEN.w / 2 * s, hh = SCREEN.h / 2 * s; camera.updateMatrixWorld(); let t = Infinity, b = -Infinity;
      for (let e = 0; e < 4; e++) for (let i = 0; i <= 16; i++) { const u = i / 8 - 1, x = e < 2 ? u * hw : (e === 2 ? -hw : hw), y = e < 2 ? (e === 0 ? hh : -hh) : u * hh;
        _sb.set(c.x + x, c.y + y, c.z); _sb2.copy(_sb).applyMatrix4(camera.matrixWorldInverse); if (_sb2.z >= 0) return null;
        _sb.project(camera); const px = (_sb.x + 1) / 2 * innerWidth, py = (1 - _sb.y) / 2 * innerHeight; if (px < 0 || px > innerWidth) continue; t = Math.min(t, py); b = Math.max(b, py); }
      return t === Infinity ? null : { top: Math.max(0, t), bottom: Math.min(innerHeight, b) }; },
    curtainEdge() { return this.project(new THREE.Vector3(curtL.position.x + curtL.scale.x / 2, 1 + ARCH.h / 2, CZ)).x; },
    valanceRect() { if (!valance.visible) return null; const pts = [[-AW, AT], [AW, AT], [-AW, AT - 0.6], [AW, AT - 0.6]].map(([x, y]) => this.project(new THREE.Vector3(x, y, ARCH.z - 0.06))); return { left: Math.min(...pts.map(p => p.x)), right: Math.max(...pts.map(p => p.x)), top: Math.min(...pts.map(p => p.y)), bottom: Math.max(...pts.map(p => p.y)) }; },
    curtainRects() { return [curtL, curtR].map(c => { const x0 = c.position.x - c.scale.x / 2, x1 = c.position.x + c.scale.x / 2, pts = [[x0, 1], [x1, 1], [x0, AT], [x1, AT]].map(([x, y]) => this.project(new THREE.Vector3(x, y, CZ))); return { left: Math.min(...pts.map(p => p.x)), right: Math.max(...pts.map(p => p.x)), top: Math.min(...pts.map(p => p.y)), bottom: Math.max(...pts.map(p => p.y)) }; }); },
    get dolly() { return dolly; }, get hatsX() { return hatsX; },
    get theatre() { return { mode: thMode, loaded: !!TH, camT, light: lightMix, loadMs: TH ? TH.loadMs : null, readyMs: TH ? TH.readyMs : null, hatsReal }; },
    theatreObj() { return TH; },
    // the gallery (C2): to the stage's centre (1600 ms); a portal chosen turns the camera to the oculus (700 ms) and the silk brings its work;
    // «Back to my seat» or Esc: back (1600 ms). Requests made mid-journey wait their turn.
    gallery() { enqueue(async () => { if (!anMode || anState !== 'lugar') return; anState = 'ida'; anYaw = 0; anPitch = 0; galZoom = 0; await camTo('galeria', 1600, 'galeria'); anState = 'galeria'; }); },
    seat() { enqueue(async () => { if (!anMode || anState !== 'galeria') return; anState = 'volta'; galleryOff(); await camTo('lugar', 1600, 'regresso'); galZoom = 0; anState = 'lugar'; }); },
    // round E: a portal, a work from the list or the filters in the 360° — the hat drawn by lot (chooseFrom360); the screen clicked, or
    // Enter with no portal in focus: straight to «ver»
    choosePortal(k) { if (k < 0) return; enqueue(() => chooseFrom360(projects[k % projects.length])); },
    chooseProject(pi) { enqueue(() => chooseFrom360(projects[pi])); },
    toView() { enqueue(() => chooseFrom360(cur || list[0])); },
    screenAt(x, y) { const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera); return screen.visible && ray.intersectObject(screen, false).length > 0; },
    focusedPortal() { return anPortal; },
    portalAt(x, y) { if (!AN) return -1; const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera); const hit = ray.intersectObjects(AN.posters, false)[0], k = hit ? AN.posters.indexOf(hit.object) : -1; return k >= 0 && portalIn(k) ? k : -1; },   // a filtered-out portal takes no click
    portalPoints() { if (!AN) return []; const d = new THREE.Vector3(); camera.getWorldDirection(d); return AN.posters.map((o, k) => { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const w = o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);   /* its vertices are in world space */ const front = w.clone().sub(camera.position).dot(d) > 0.5, q = this.project(w);
      const ang = portalAngles()[k], side = ((ang - anYaw) % 360 + 540) % 360 - 180;
      const box = front ? portalBoxPx(k) : null;
      return { x: q.x, y: q.y, bottom: box ? box.bottom : q.y, on: front && q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight, side, focus: k === anPortal, project: projects[k % projects.length].title, inList: portalIn(k) }; }); },
    turnToPortal(k) { const a = portalAngles()[k]; if (a == null || anState !== 'galeria' || !portalIn(k)) return; const d = ((a - anYaw) % 360 + 540) % 360 - 180; if (Math.abs(d) > 2 || galZoom < 1) enqueue(async () => { if (anState !== 'galeria') return; if (Math.abs(d) > 2) await turnTo(anYaw + d); await zoomOn(k); }); },
    portalBox(k) { return AN ? portalBoxPx(k) : null; }, get galZoom() { return galZoom; },
    get dragged() { return anDragged; },
    get anfi() { return { mode: anMode, loaded: !!AN, cam: anCam, state: anState, fov: +camera.fov.toFixed(1), yaw: +anYaw.toFixed(1), portal: anPortal, uT: AN ? +AN.U.uT.value.toFixed(3) : null, mix: AN ? AN.mix : null, loadMs: AN ? AN.loadMs : null, readyMs: AN ? AN.readyMs : null, triangles: AN ? AN.triangles : null, film: anFilm.slice(0, 3), leve: anLean }; },
    anfiCam(n) {   // mockup bar and tests: a place at once (the entry cut short)
      ++entryId; introOn = false; anDark = false; anDarkSince = 0; anTextIn = true; finishTweens(); queue.length = 0; tl.render = null; running = false; hats.forEach(h => { h.userData.tilt = 0; h.userData.trick = 0; });   // a trick cut short: its hat at rest
      anCam = n || { chegada: 'lugar', lugar: 'galeria', galeria: 'ver', ver: 'chegada' }[anCam] || 'galeria'; anCamK = 1; anFrom = null; galZoom = 0;   // the final review: «ver» in the cycle; from the descent (or anything else) to the 360°
      if (anCam === 'galeria') anState = 'galeria'; else { if (anState === 'galeria' || anState === 'escolha') galleryOff(); anState = anCam === 'ver' ? 'ver' : 'lugar'; }
      if (anMode) frame(); return anCam; },
    get anfiTextIn() { return anTextIn; },   // round E: the page's text and controls, from the landing
    get anfiIntro() { return introOn; },
    get anfiIntroModel() { return { modelo: introModel, casco: introHull.visible, aparece: +introAppear.toFixed(2) }; },   // tests only (E3, the final review C1): the hat on show     // round E: the hat and the dive are on (the page lifts its veil on them at once)
    get anfiDarkFor() { return anDark ? performance.now() - anDarkSince : 0; },   // round E: how long the hat's dark has lasted (the waiting sign after 1 s)
    get anfiHint() { return anHint && anState === 'galeria'; },                    // round E: the landing's hint, until the first move
    // tests only (round E, the proofs): the entry held at an instant — the hat (appear 0–1, dive 0–1), or the descent at «ms» (0–2 400);
    // null gives the frame back to the room
    anfiIntroAt(appear, dive) { ++entryId; finishTweens(); queue.length = 0; running = false; if (appear == null) { introOn = false; return; } setRes(); introSetup(); introOn = true; introAppear = appear; introDive = dive || 0; introTurn = 1; },   // E2: the hat already turned to the camera
    get anfiCard() { return card; },   // tests only (E2): the work's card, out of a hat
    // tests only (E2): the hat held at «ms» of its first 400 ms (the proofs at 100 %)
    anfiIntroMs(ms) { ++entryId; finishTweens(); queue.length = 0; running = false; setRes(); introSetup(); introOn = true; introAt(ms); introDive = 0; },
    // tests only (E2): the entry's hat at «ms» of its first 400 ms, drawn off screen — the brim's and the felt's median lightness (the sRGB
    // luma, 0–1), the red pixels outside the lining (1 px of margin), and the angle (°) between the mouth's normal and the way to the camera
    anfiIntroRim(k, p, col, w) { if (k != null) { rimSet = k; introMat.uniforms.uRimK.value = k; } if (p != null) introMat.uniforms.uRimP.value = p; if (col != null) hullCol = col; if (w != null) hullW = w; return [introMat.uniforms.uRimK.value, introMat.uniforms.uRimP.value, introHullMat.uniforms.uCol.value, hullW]; },   // tests only (E3): the cut line's strength and power
    anfiIntroMeasure(ms) {
      const was = [introAppear, introDive, introOn, introTurn];
      introSetup(); introAt(ms); introDive = 0; introFrame(); introScene.updateMatrixWorld(true);
      const W = renderer.domElement.width, H = renderer.domElement.height;
      // E3: the colours drawn twice — as in E2 (px, its measures), and with 4× multisampling as on screen (pm: a crack under a pixel shows only
      // there; the cut line, the lines and seams); the id pass without (no blends)
      if (!introRT || introRT.width !== W || introRT.height !== H) { if (introRT) { introRT.dispose(); introRT.ms.dispose(); } introRT = new THREE.WebGLRenderTarget(W, H); introRT.ms = new THREE.WebGLRenderTarget(W, H, { samples: 4 }); }
      const read = rt => { renderer.setRenderTarget(rt); renderer.render(introScene, introCam); renderer.setRenderTarget(null); const b = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, b); return b; };
      const px = read(introRT), pm = read(introRT.ms); introMat.uniforms.uIdMode.value = 1; introHullMat.uniforms.uIdMode.value = 1; const id = read(introRT); introMat.uniforms.uIdMode.value = 0; introHullMat.uniforms.uIdMode.value = 0;
      const brim = [], felt = []; let red = 0, brimPx = 0;
      const isLin = i => id[i * 4] > 128, med = a => a.length ? +a.sort((x, y) => x - y)[a.length >> 1].toFixed(3) : null;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (id[i * 4 + 1] > 128) { brim.push(L); felt.push(L); brimPx++; } else if (id[i * 4 + 2] > 128) felt.push(L);
        if (r >= 2 * g && r >= 2 * b && r >= 40) { let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isLin(i + dy * W + dx)) { near = true; break; } if (!near) red++; } }
      const m = new THREE.Vector3(), nrm = new THREE.Vector3(0, -1, 0).transformDirection(introHat.matrixWorld); introPivot.getWorldPosition(m);
      const ang = THREE.MathUtils.radToDeg(nrm.angleTo(introCam.position.clone().sub(m)));
      [introAppear, introDive, introOn, introTurn] = was;
      // E3 (point 4): the hat in the frame (its box's margins, a share of each side); the cut line (the felt's pixels with the background
      // within 1 px: median luma, 95th percentile of the saturation; the felt's pixels at ≥ 0.15 farther than 3 px from it); the lines and
      // seams (a felt or lining pixel ≥ 5 px from any edge between ids or with the background, lighter or darker than both pixels 2 px away
      // along its row or its column by > 0.06); the sharpness of the crown's top edge and of the band (down the hat's middle column, the
      // rows between 10 and 90 % of the largest step in the crown's top 30 % and its bottom 35 %). Rows from the top.
      // the lines and seams by the strongest channel (Vm): the lining's crack was 35/255 darker in red, 0.035 in luma
      const cl = new Uint8Array(W * H), Lm = new Float32Array(W * H), Vm = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) { cl[i] = id[i * 4] > 128 ? 1 : id[i * 4 + 1] > 128 ? 2 : id[i * 4 + 2] > 128 ? 3 : id[i * 4] > 40 ? 4 : 0;   /* 4: the cut line (grey in the id pass) */ Lm[i] = (0.2126 * pm[i * 4] + 0.7152 * pm[i * 4 + 1] + 0.0722 * pm[i * 4 + 2]) / 255; Vm[i] = Math.max(pm[i * 4], pm[i * 4 + 1], pm[i * 4 + 2]) / 255; }
      let x0 = W, x1 = -1, y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cl[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const margem = x1 < 0 ? null : { esq: +(x0 / W).toFixed(3), dir: +((W - 1 - x1) / W).toFixed(3), cima: +((H - 1 - y1) / H).toFixed(3), baixo: +(y0 / H).toFixed(3) };
      const dil = (mk, r) => { const a = new Uint8Array(W * H), o = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const xx = x + d; if (xx >= 0 && xx < W && mk[y * W + xx]) v = 1; } a[y * W + x] = v; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const yy = y + d; if (yy >= 0 && yy < H && a[yy * W + x]) v = 1; } o[y * W + x] = v; }
        return o; };
      const bgM = new Uint8Array(W * H), edM = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; bgM[i] = cl[i] === 0 ? 1 : 0; if ((x + 1 < W && cl[i] !== cl[i + 1]) || (y + 1 < H && cl[i] !== cl[i + W])) edM[i] = 1; }
      const c4 = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) c4[i] = cl[i] === 4 ? 1 : 0;
      const bg1 = dil(bgM, 1), bg3 = dil(bgM, 3), ed5 = dil(edM, 5), near4 = dil(c4, 3);   // the cut line's own pixels and 3 px about it: the line, not a bright area
      // the lines and seams are of two kinds: a shading line inside a surface, and a crack — through it the id pass shows another class: a
      // pixel of another class between two of the same hat class 2 px away along its row or its column («lascas»)
      const corte = [], sat = [], longe = []; let feltN = 0, claroLonge = 0, inner = 0, sombra = 0, lascas = 0; const amostra = [];
      const note = (x, y, k) => { if (amostra.length < 10 && amostra.every(q => Math.abs(q[0] - x) + Math.abs(q[1] - (H - 1 - y)) > 12)) amostra.push([x, H - 1 - y, k]); };
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x, c = cl[i];
        const a = cl[i - 2], b = cl[i + 2], u = cl[i - 2 * W], d = cl[i + 2 * W];
        if (c !== 4 && ((a && a !== 4 && a === b && c !== a) || (u && u !== 4 && u === d && c !== u))) { lascas++; note(x, y, 'lasca'); }
        if (!c) continue; const L = Lm[i];
        if (c > 1) { feltN++; if (bg1[i]) { corte.push(L); const r = pm[i * 4], g = pm[i * 4 + 1], bb = pm[i * 4 + 2], mx = Math.max(r, g, bb); sat.push(mx ? (mx - Math.min(r, g, bb)) / mx : 0); } if (L >= 0.15 && !bg3[i] && !near4[i]) { claroLonge++; if (longe.length < 6) longe.push([x, H - 1 - y]); } }
        if (ed5[i]) continue; inner++;
        const V = Vm[i], h1 = Vm[i - 2], h2 = Vm[i + 2], v1 = Vm[i - 2 * W], v2 = Vm[i + 2 * W], t = 0.06;
        if (V - Math.max(h1, h2) > t || Math.min(h1, h2) - V > t || V - Math.max(v1, v2) > t || Math.min(v1, v2) - V > t) { sombra++; note(x, y, 'sombra'); } }
      const pct = (a, q) => a.length ? +a.slice().sort((u, v) => u - v)[Math.min(a.length - 1, Math.floor(a.length * q))].toFixed(3) : null;
      // the sharpness: down the middle column, the hat's pixels ≥ 4 px from the background; the crown's top edge in the first 15 % of them,
      // the band's edge in 55–97 %
      const xc = Math.round((x0 + x1) / 2), col = []; for (let y = y1; y >= y0; y--) { const i = y * W + xc; if (cl[i] && cl[i] !== 4 && !bg3[i] && !near4[i]) col.push(Lm[i]); }
      const width = (a, b) => { a = Math.max(a, 5); b = Math.min(b, col.length - 6); if (b - a < 4) return null; let r = -1, g = 0; for (let k = a; k <= b; k++) { const dd = Math.abs(col[k + 2] - col[k - 2]); if (dd > g) { g = dd; r = k; } }
        const lo = col[r - 5], hi = col[r + 5]; if (r < 0 || Math.abs(hi - lo) < 3 / 255) return null; let n = 0; for (let k = r - 5; k <= r + 5; k++) { const f = (col[k] - lo) / (hi - lo); if (f > 0.1 && f < 0.9) n++; } return n; };
      const nitidez = { topo: width(0, Math.round(col.length * 0.15)), fita: width(Math.round(col.length * 0.55), Math.round(col.length * 0.97)), colunaPx: col.length };
      return { abaMediana: med(brim), feltroMediana: med(felt), abaPx: brimPx, vermelhoForaDoForro: red, angBoca: +ang.toFixed(1),
        margem, recorte: { mediana: pct(corte, 0.5), sat95: pct(sat, 0.95), px: corte.length, claroLonge: feltN ? +(claroLonge / feltN).toFixed(4) : null, longe },
        tracos: { sombra, lascas, interior: inner, amostra }, nitidez }; },
    anfiDescentAt(ms) { ++entryId; introOn = false; anDark = false; finishTweens(); queue.length = 0; running = false; anState = 'entrada'; anCam = 'descida'; anCamK = 1; anFrom = null; descMs = ms; if (anMode) frame(); },
    // tests only (round E, Task 8): the same frame with the sunbeams on and off — the warm share (hue 20–50°, saturation > 0.3, not dark)
    // of the forest and the sky in the frame's upper half (the shell's lit wood, warm already, would hide them), and how much of the screen
    // they change (it must be none)
    anfiBeams() {
      if (!AN || !AN.tune) return null; const was = AN.tune({ beams: null }).beams;
      AN.tune({ beams: true }); const a = measureAnfi(); AN.tune({ beams: false }); const b = measureAnfi(); AN.tune({ beams: was });
      const W = a.w, H = a.h, T = a._names.indexOf('tela') + 1, OUT = ['perto', 'meio', 'longe', 'ceu', 'nevoeiro'].map(n => a._names.indexOf(n) + 1);
      const warm = px => { let n = 0, w = 0; for (let y = Math.floor(H / 2); y < H; y++) for (let x = 0; x < W; x++) { if (!OUT.includes(a._cls[y * W + x])) continue; const i = (y * W + x) * 4, r = px[i] / 255, g = px[i + 1] / 255, bl = px[i + 2] / 255, mx = Math.max(r, g, bl), d = mx - Math.min(r, g, bl); n++;   // rows from the bottom: the upper half
        if (mx > 0.12 && d / mx > 0.3) { const h = (mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4) * 60; if (h >= 20 && h <= 50) w++; } } return Math.round(w / n * 1000) / 10; };
      let nt = 0, ch = 0; for (let i = 0; i < W * H; i++) if (a._cls[i] === T) { nt++; const k = i * 4; if (Math.max(Math.abs(a._px[k] - b._px[k]), Math.abs(a._px[k + 1] - b._px[k + 1]), Math.abs(a._px[k + 2] - b._px[k + 2])) > 2) ch++; }
      return { quentes_com: warm(a._px), quentes_sem: warm(b._px), tela_px: nt, tela_mudada_pct: nt ? Math.round(ch / nt * 10000) / 100 : 0 };
    },
    anfiCover() { return oculusCover(); },
    anfiSlowmo(k) { slowmo = k || 1; },
    // round E: «Look around» and Esc — from «ver» back to the 360°, facing the screen (1 000 ms)
    lookAround() { enqueue(async () => { if (!anMode || anState !== 'ver') return; anState = 'volta'; anYaw = 0; anPitch = 0; galZoom = 0; await camTo('galeria', 1000, 'olhar-em-volta'); anState = 'galeria'; }); },
    // tests only (round E): the cloth silk held at «ms» of its swap, out of hat 1 (on the left: it leaves to the right), with the seed set by
    // anfiTune({ silkSeed }) (1 if none); null puts it away (the opening's silk and its phases left with the opening, round E Task 6)
    // E2: { real: true, from: i } — the swap as it happens: the work list[from] under the cloth before its swap (SILK_SWAP_MS), the next one after (the proofs)
    anfiSilkAt(ms, o = {}) { if (ms == null) { silkC.visible = false; silk.visible = false; return; } const st = silkPlan(1, silkSeedT != null ? silkSeedT : 1); silkAdvance(st, ms); silkShow(st); lastSilk = st;
      if (o.real && o.from != null) { const i = st.ms >= SILK_SWAP_MS ? (o.from + 1) % list.length : o.from; if (list[i] !== cur) { show(list[i]); index = i; } } },
    // tests only (E2): the silk held at «ms» — its belly (how far the top edge's middle hangs under the line between the hands, in widths), its
    // folds (the middle row's depth extremes, prominence ≥ 0.008), the screen it covers, and its drawn outline's largest turn (°, on screen, the
    // corners left out)
    anfiSilkShape(ms) {
      this.anfiSilkAt(ms); const st = lastSilk, P = st.cloth.pos, B = SNX - 1, mid = B >> 1, PR = 0.008;
      const barriga = (P[1] + P[B * 3 + 1]) / 2 - P[mid * 3 + 1];
      // the folds: three rows (a quarter, the middle, three quarters down), the most found — one row alone missed the diagonal folds
      let dobras = 0; for (const jm of [SNY >> 2, SNY >> 1, (3 * SNY) >> 2]) { let dir = 0, hi = P[jm * SNX * 3 + 2], lo = hi, n = 0;
        for (let i = 1; i < SNX; i++) { const z = P[(jm * SNX + i) * 3 + 2];
          if (dir !== -1) { hi = Math.max(hi, z); if (hi - z >= PR) { if (dir === 1) n++; dir = -1; lo = z; continue; } }
          if (dir !== 1) { lo = Math.min(lo, z); if (z - lo >= PR) { if (dir === -1) n++; dir = 1; hi = z; } } }
        dobras = Math.max(dobras, n); }
      const cobre = measureAnfi().lenco_sobre_tela;
      silkC.updateMatrixWorld(true); const g = silkCGeo.attributes.position, idx = [], corners = [];
      for (let i = 0; i < SRX; i++) idx.push(i); corners.push(0, SRX - 1);
      for (let j = 1; j < SRY; j++) idx.push(j * SRX + SRX - 1); corners.push(idx.length - 1);
      for (let i = SRX - 2; i >= 0; i--) idx.push((SRY - 1) * SRX + i); corners.push(idx.length - 1);
      for (let j = SRY - 2; j >= 1; j--) idx.push(j * SRX);
      const v = new THREE.Vector3(), q = idx.map(k => { v.fromBufferAttribute(g, k).applyMatrix4(silkC.matrixWorld); const c = v.clone().applyMatrix4(camera.matrixWorldInverse); if (c.z >= 0) return null; v.project(camera);
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight; return x >= 8 && x <= innerWidth - 8 && y >= 8 && y <= innerHeight - 8 ? [x, y] : null; });   // not at the window's border
      const nearCorner = n => corners.some(c => Math.min(Math.abs(n - c), idx.length - Math.abs(n - c)) <= SRK);
      // only the outline that is seen: a drawn edge point with both silk and something else within 3 px in the id pass (an edge folded behind the
      // cloth's own front is not the silhouette)
      const mm = measureAnfi(), cl = mm._cls, nm = mm._names, MW = mm.w, MH = mm.h, Ls = nm.indexOf('lenco') + 1, kx = MW / innerWidth, ky = MH / innerHeight;
      const seen = pt => { if (!pt) return false; const cx = Math.round(pt[0] * kx), cy = MH - 1 - Math.round(pt[1] * ky); let s = 0, o = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= MW || y >= MH) continue; const c = cl[y * MW + x]; if (c === Ls) s++; else if (c !== 255) o++; } return s > 0 && o > 0; };
      let degrauMax = null, onde = null; for (let n = 0; n < idx.length; n++) { const a = q[(n - 1 + idx.length) % idx.length], b = q[n], c = q[(n + 1) % idx.length]; if (!a || !b || !c || nearCorner(n) || !seen(b)) continue;
        const ux = b[0] - a[0], uy = b[1] - a[1], wx = c[0] - b[0], wy = c[1] - b[1], lu = Math.hypot(ux, uy), lw = Math.hypot(wx, wy); if (lu < 1.5 || lw < 1.5) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / lu / lw))) * 180 / Math.PI;
        if (ang > (degrauMax || 0)) { degrauMax = ang; const side = n < SRX ? 'cima' : n < SRX + SRY - 1 ? 'direita' : n < 2 * SRX + SRY - 2 ? 'baixo' : 'esquerda'; onde = [side, Math.round(b[0]), Math.round(b[1])]; } }
      return { barriga: +barriga.toFixed(3), dobras, cobre, degrauMax: degrauMax == null ? null : +degrauMax.toFixed(1), onde, malha: [SRX, SRY] }; },
    // tests only (E2): the silk's sheen in this frame — the brightest silk pixel's distance from #E02727, the share of its pixels lighter than
    // it by > 20/255, their largest hue shift (°) and lowest saturation (HSV), and the crests' median lightness (the 10 % of its pixels where
    // the sheen is strongest, from a map of it) against the rest's
    anfiSilkSheen() {
      const m = measureAnfi(), cls = m._cls, names = m._names, W = m.w, H = m.h, L = names.indexOf('lenco') + 1, gl = renderer.getContext();
      // the silk with its own light only: the lamps, strands and motes that hang in front of it (no id) hidden, as for criterion 5
      const off = []; AN.group.traverse(o => { if (o.visible && (o.userData.noId || o.isPoints)) { off.push(o); o.visible = false; } });
      const read = () => { renderer.render(scene, camera); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      const px = read(); silkCMat.uniforms.uSheenMap.value = 1; const sm = read(); silkCMat.uniforms.uSheenMap.value = 0; off.forEach(o => { o.visible = true; });
      const inside = i => { const x = i % W; if (x < 1 || x > W - 2 || i < W || i >= W * (H - 1)) return false; for (const o of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) if (cls[i + o] !== L) return false; return true; };
      const pix = []; let top = null, tl = -1, above = 0, tomMax = 0, satMin = 1;
      for (let i = 0; i < W * H; i++) { if (cls[i] !== L || !inside(i)) continue; const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        pix.push([sm[i * 4], l]); if (l > tl) { tl = l; top = [r, g, b]; }
        if (Math.max(r - 224, g - 39, b - 39) > 20) { above++; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
          let h = d ? (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 : 0; if (h > 180) h -= 360; tomMax = Math.max(tomMax, Math.abs(h)); satMin = Math.min(satMin, mx ? d / mx : 0); } }
      if (!pix.length) return null; pix.sort((x, y) => y[0] - x[0]); const nc = Math.max(1, Math.round(pix.length * 0.1)), med = a => { const s = a.map(x => x[1]).sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(1) : null; };
      return { maisClaroDif: top ? Math.max(Math.abs(top[0] - 224), Math.abs(top[1] - 39), Math.abs(top[2] - 39)) : null, maisClaro: top, acima20Pct: +(above / pix.length * 100).toFixed(2),
        tomMax: +tomMax.toFixed(1), satMin: +satMin.toFixed(3), cristas: med(pix.slice(0, nc)), corpo: med(pix.slice(nc)), px: pix.length }; },
    // tests only (the final review): the same swap advanced as the page does, with frames of 16.7 ± 0.4 ms, against exact steps — the
    // largest gap between the two cloths (its own units)
    anfiSilkJitter(ms, seed = 7) { const a = silkPlan(1, seed), b = silkPlan(1, seed); silkAdvance(a, ms); let t = 0, k = 0; while (t < ms) { t = Math.min(ms, t + 1000 / 60 + (k++ % 2 ? 0.4 : -0.4)); silkFrame(b, t); }
      let d = 0; for (let i = 0; i < a.cloth.pos.length; i++) d = Math.max(d, Math.abs(a.cloth.pos[i] - b.cloth.pos[i])); return { desvio: +d.toExponential(2), ms: [+a.ms.toFixed(2), +b.ms.toFixed(2)] }; },
    // tests only: tune the amphitheatre's live values against the B2 renders (screen emission, film factor, the hats' lights)
    anfiTune(o = {}) { if (o.slowMs != null) { anSlowTest = o.slowMs; return { slowMs: anSlowTest }; }   // D3b: also before the amphitheatre has loaded
      if (o.silkSeed !== undefined) { silkSeedT = o.silkSeed; return { silkSeed: silkSeedT }; }          // round E: the silk's seed (null: a new one each swap)
      if (!AN) return null;
      if (o.leanNow) { anLeanNow = true; return { leanNow: true, nivel: anLean }; }                       // D3: the light mode's switch, on demand
      if (o.moveTo) { camTo(o.moveTo, o.ms || 1500, 'teste-' + o.moveTo); return { moveTo: o.moveTo }; }   // D3: a journey to switch in the middle of
      if (AN.tune && ['sunK', 'treeSun', 'treeAmb', 'shaftK', 'back', 'rim', 'a2c', 'beams', 'beamK'].some(k => k in o)) return AN.tune(o);   /* round D's knobs: no side effects (a null only reads them) */ if (o.emit != null) AN.screenMat.uniforms.uEmit.value = o.emit; if (o.filmK != null) anFilmK = o.filmK; for (const k of ['key', 'fill', 'amb']) if (o[k] != null) AN_LIGHT[k] = o[k]; setAnfi(anMode); return { emit: AN.screenMat.uniforms.uEmit.value, filmK: anFilmK, ...AN_LIGHT }; },
    anfiFilmK(k) { if (k != null) anFilmK = k; return anFilmK; },
    anfiMix(k) { if (AN && k != null) AN.setMix(k); return AN ? AN.mix : null; },
    anfiYaw(y, p = 0) { anYaw = y; anPitch = p; },
    // tests only: a frame of a clip held on the screen, or no screen at all (the arrival in «aberto»)
    anfiFrame(o) {
      if (o === 'none') { anNoScreen = true; return Promise.resolve(); }
      anNoScreen = false; if (!o) return Promise.resolve();
      if (o.image) return new Promise(res => { ++loadId; video.pause(); video.removeAttribute('src'); video.load(); const im = new Image(); im.onload = () => { posterTex.dispose(); posterTex.image = im; posterTex.needsUpdate = true; screenMat.map = posterTex;   /* dispose: the GPU copy has a fixed size */ reflMat.uniforms.map.value = posterTex; screenMat.needsUpdate = true; res(); }; im.src = o.image; });   // the very still a render used
      return new Promise(res => { video.pause(); video.src = asset(o.clip); video.load(); video.addEventListener('loadeddata', () => { video.currentTime = o.t; video.addEventListener('seeked', () => { screenMat.map = vtex; reflMat.uniforms.map.value = vtex; screenMat.needsUpdate = true; vtex.needsUpdate = true; res(); }, { once: true }); }, { once: true }); });
    },
    anfiMeasure() { const m = measureAnfi(); delete m._cls; delete m._names; delete m._lum; delete m._px; return m; },
    // tests only (round E2): each id class's share of a box of the frame, [x0, y0, x1, y1] from the top left in 0–1 (edges left out)
    anfiClassShare(box = [0, 0, 1, 1]) {
      const m = measureAnfi(), cls = m._cls, names = m._names, W = m.w, H = m.h, n = {}; let tot = 0;
      const x0 = Math.floor(box[0] * W), x1 = Math.ceil(box[2] * W), r0 = Math.floor(box[1] * H), r1 = Math.ceil(box[3] * H);
      for (let r = r0; r < r1; r++) { const row = H - 1 - r; for (let x = x0; x < x1; x++) { const c = cls[row * W + x]; if (c === 255) continue; tot++; const k = c === 0 ? 'sala' : names[c - 1]; n[k] = (n[k] || 0) + 1; } }
      for (const k in n) n[k] = +(n[k] / tot).toFixed(4); return n; },
    // tests only (round D3, point 4): the trees seen in this frame — the share of their pixels in a warm hue (20–50°, saturation > 0.3, not
    // dark) and their mean luminance, against the room's wood in the upper half of the frame (the shell: below it are the tiers and the floor)
    anfiRim() {
      const m = measureAnfi(), cls = m._cls, names = m._names, lum = m._lum, px = m._px, ix = k => names.indexOf(k) + 1, T = [ix('perto'), ix('longe')];
      let nt = 0, warm = 0, zl = 0, sl = 0, ns = 0; const W = m.w, H = m.h;
      for (let i = 0; i < cls.length; i++) { const c = cls[i];
        if (c === 0) { if (Math.floor(i / W) >= H / 2) { sl += lum[i]; ns++; } continue; }   // the buffer runs bottom-up: the upper half
        if (T.includes(c)) { nt++; zl += lum[i]; const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
          if (mx > 0.12 && d / mx > 0.3) { const h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; if (h >= 20 && h <= 50) warm++; } } }
      return { arvores_px: nt, quentes_pct: nt ? Math.round(warm / nt * 1000) / 10 : 0, arvores_media: nt ? +(zl / nt).toFixed(3) : null, madeira_media: ns ? +(sl / ns).toFixed(3) : null };
    },
    // tests only (criterion 4): what moves in 3 s at rest — per class, the share of its pixels that change by more than 2/255 from
    // second to second (the film paused); and the trees' fastest sway on screen, worked out from their shader (% of the width per s)
    // tests only (round D, Task 5): real 3D trees shift on screen with depth — from the arrival to the seat, the 5 trees nearest the seat
    // move ≥ 2× as much as the 5 farthest (their mid-height, both in view); and no card trees left (SM_Tree_*)
    anfiParallax() {
      if (!AN || !AN.DF) return { razao: null, cartoes: AN ? AN.group.children.length : null };
      const cam = camera.clone(), proj = (pose, p) => { cam.position.copy(pose.pos); cam.fov = pose.fov; cam.aspect = camera.aspect; cam.updateProjectionMatrix(); cam.lookAt(pose.look); cam.updateMatrixWorld();
        const v = p.clone().project(cam); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1 ? new THREE.Vector2((v.x + 1) * innerWidth / 2, (1 - v.y) * innerHeight / 2) : null; };
      // the camera moved, not turned: both views look the seat's way (a turn moves near and far alike and hides the depth)
      const Bp = poseOf('lugar'), A0 = poseOf('chegada'), A = { pos: A0.pos, fov: Bp.fov, look: A0.pos.clone().add(Bp.look.clone().sub(Bp.pos)) }, seat = Bp.pos;
      const ts = AN.forestPositions().filter(t => t.sp === 'abeto' || t.sp === 'larico').map(t => ({ p: new THREE.Vector3(t.x, t.y + t.H * 0.5, t.z), d: Math.hypot(t.x - seat.x, t.z - seat.z) }))
        .map(t => ({ ...t, a: proj(A, t.p), b: proj(Bp, t.p) })).filter(t => t.a && t.b).sort((x, y) => x.d - y.d);
      const mv = l => l.reduce((s, t) => s + t.a.distanceTo(t.b), 0) / Math.max(1, l.length), near = ts.slice(0, 5), far = ts.slice(-5);
      let cards = 0, flat = 0; AN.group.traverse(o => { if (o.isMesh && o.name.startsWith('SM_Tree_')) cards++; });
      for (const im of AN.forest) { if (im.userData.sp === 'feto') continue; const bb = im.geometry.boundingBox; if (Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z) < 1.0) flat++; }   // volume, not a plane
      return { visiveis: ts.length, perto_px: Math.round(mv(near)), longe_px: Math.round(mv(far)), razao: +(mv(near) / Math.max(1e-6, mv(far))).toFixed(2), cartoes: cards, planas: flat };
    },
    // tests only (round D, Task 7): round D's light rules on the site's own frame (sunset_d.d_metrics, with the id pass's classes).
    // The render tells sunlit from tree-shaded by a ray toward the sun; here the frame is drawn without the baked sun layer and with it
    // at full strength, and a room pixel is «sol» where the sun adds ≥ 0.03 and ≥ 25% of it, «sombra» where it adds < 0.01 (so the
    // classes do not move with the sun's tuning); the light measures themselves are read on the frame as it is. Then, as in the render:
    // the room's right half against its left (about the screen's centre), the stripes along the rows of the right half (the sun's share
    // falls to ≤ ½ and comes back ≥ 2×: a tree's shadow across the patch), the contrast of sol against sombra, the screen against the
    // sunlit patch, the patch touching the screen (box + 2%),
    // the brightest of the oculus (sky, trees, ground; p99.5) as a share of the screen's p99, and burnt-out pixels (> 0.95) outside the films
    anfiSol() {
      if (!AN || !AN.DF) return null;
      const k0 = AN.tune().sunK; AN.setSunK(0); const m0 = measureAnfi(); AN.setSunK(1); const m1 = measureAnfi(); AN.setSunK(k0); const m = measureAnfi();
      const cls = m._cls, names = m._names, lum = m._lum, lum0 = m0._lum, lum1 = m1._lum, W = m.w, H = m.h, r = this.screenRect(), k = W / innerWidth;
      const sx0 = r.left * k, sx1 = r.right * k, sy0 = H - r.bottom * k, sy1 = H - r.top * k, cx = (sx0 + sx1) / 2, dil = 0.02 * W;
      const ix = n => names.indexOf(n) + 1, TELA = ix('tela'), PORT = ix('portais'), OUT_ = [ix('ceu'), ix('perto'), ix('longe'), ix('chao')];
      const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0, q = (a, p) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
      const kind = new Uint8Array(W * H);   // 1 sol, 2 sombra (room, right half only)
      const R = [], Lf = [], lit = [], shade = [], tela = [], oc = []; let touch = false, burnt = 0, nb = 0;
      for (let i = 0; i < W * H; i++) { const x = i % W, y = (i - x) / W, c = cls[i];
        if (c === 0) { (x > cx ? R : Lf).push(lum[i]);
          if (x > cx) { const s = lum1[i] - lum0[i]; if (s >= 0.03 && s >= 0.25 * lum1[i]) { kind[i] = 1; lit.push(lum[i]); if (x > sx0 - dil && x < sx1 + dil && y > sy0 - dil && y < sy1 + dil) touch = true; } else if (s < 0.01) { kind[i] = 2; shade.push(lum[i]); } } }
        else if (c === TELA) tela.push(lum[i]); else if (OUT_.includes(c)) oc.push(lum[i]);
        if (c !== TELA && c !== PORT && c !== 255) { nb++; if (lum[i] > 0.95) burnt++; } }
      let stripes = 0;
      for (let y = 0; y < H; y += 2) { let hi = 0, lo = 1e9, st = 0, n = 0;   // along the row, on the sun's own share: lit (≥ 0.03) → ≤ ½ of it → back to ≥ 2× and lit
        for (let x = Math.ceil(cx); x < W; x++) { const i = y * W + x; if (cls[i] !== 0) continue; const v = Math.max(0, lum1[i] - lum0[i]) + 0.004;
          if (st === 0) { hi = Math.max(hi, v); if (hi >= 0.034 && v <= hi / 2) { st = 1; lo = v; } } else { lo = Math.min(lo, v); if (v >= lo * 2 && v >= 0.034) { n++; st = 0; hi = v; } } }
        stripes = Math.max(stripes, n); }
      const pctOf = (a, b) => a.length && b.length ? +(mean(a) / Math.max(1e-6, mean(b))).toFixed(2) : null;
      return { lado_ratio: +(mean(R) / Math.max(1e-6, mean(Lf))).toFixed(2), riscas: stripes, riscas_contraste: pctOf(lit, shade), tela_vs_mancha: pctOf(tela, lit),
        mancha_toca_tela: touch, oculo_mais_claro_pct_tela: tela.length && oc.length ? Math.round(q(oc, 0.995) / Math.max(1e-6, q(tela, 0.99)) * 1000) / 10 : null,
        estoiro_pct: Math.round(burnt / Math.max(1, nb) * 10000) / 100, medias: { tela: +mean(tela).toFixed(3), sol: +mean(lit).toFixed(3), sombra: +mean(shade).toFixed(3), esquerda: +mean(Lf).toFixed(3), direita: +mean(R).toFixed(3) },
        amostras: { sala: R.length + Lf.length, sol: lit.length, sombra: shade.length, tela: tela.length } };
    },
    // tests only (round D, Task 6): the rays and the dust — their share of the frame (the frame with and without them), the share of the
    // screen's rectangle they touch (never over the film), and, frozen as with reduced motion, how many of their pixels off the screen change in 1 s (0)
    async anfiShafts() {
      if (!AN || !AN.DF || !AN.shafts) return null;
      const gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const read = () => { renderer.render(scene, camera); const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
      const dif = (a, b, i) => Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2]) > 6;
      video.pause(); anStill = true; await new Promise(res => setTimeout(res, 700));   // reduced motion's freeze (held by the frame loop); the film's light settles on the paused frame
      const on = read(); AN.shafts.visible = false; const off = read(); AN.shafts.visible = true;
      const r = this.screenRect(), k = W / innerWidth, x0 = Math.floor(r.left * k), x1 = Math.ceil(r.right * k), y0 = H - Math.ceil(r.bottom * k), y1 = H - Math.floor(r.top * k);
      let n = 0, scr = 0, inScr = 0; const mask = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, s = x >= x0 && x < x1 && y >= y0 && y < y1; if (s) inScr++; if (dif(on, off, i)) { n++; mask[i] = 1; if (s) scr++; } }
      const a = read(); await new Promise(res => setTimeout(res, 1000)); const b = read(); let still = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (mask[i] && !(x >= x0 && x < x1 && y >= y0 && y < y1) && dif(a, b, i)) still++; }   // off the screen: the film may change, the shafts may not
      anStill = false; const pr = video.play(); if (pr && pr.catch) pr.catch(() => {});
      return { raios_pct: Math.round(n / (W * H) * 1000) / 10, sobre_tela_pct: Math.round(scr / Math.max(1, inScr) * 1000) / 10, parado_mudou_px: still };
    },
    async anfiAlive() {
      video.pause(); const m = measureAnfi(), cls = m._cls, names = m._names, gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, frames = [];
      for (let k = 0; k < 4; k++) { if (k) await new Promise(r => setTimeout(r, 1000)); renderer.render(scene, camera); const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); frames.push(px); }
      const ch = {}, n = {};
      for (let i = 0; i < W * H; i++) { const c = cls[i] === 255 ? null : cls[i] ? names[cls[i] - 1] : 'sala'; if (!c || c === 'tela') continue; n[c] = (n[c] || 0) + 1;
        for (let k = 1; k < 4; k++) { const a = frames[k - 1], b = frames[k]; if (Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) + Math.abs(a[i * 4 + 2] - b[i * 4 + 2]) > 6) { ch[c] = (ch[c] || 0) + 1 / 3; break; } } }
      const muda = Object.fromEntries(Object.entries(n).map(([c, v]) => [c, Math.round((ch[c] || 0) / v * 1000) / 10]));
      // the trees: x += 0.0087·sin(0.5·t + φ)·y·0.7 → at most 0.003 05·y m/s; on screen, through this camera, at each card's distance
      let tree = AN.DF ? AN.forestSwayPx(camera, W, H) : 0; const v = new THREE.Vector3(), pxm = camera.projectionMatrix.elements[0] * W / 2;   // round D: the 3D trees' own sway
      AN.group.traverse(o => { if (!o.isMesh || !o.name.startsWith('SM_Tree_')) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
        for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) { v.set(x, bb.max.y, z).applyMatrix4(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse); if (v.z < -1) tree = Math.max(tree, 0.0087 * 0.5 * 0.7 * bb.max.y * pxm / -v.z); } });
      const pr = video.play(); if (pr && pr.catch) pr.catch(() => {});
      return { muda_pct: muda, arvores_max_pct_largura_s: Math.round(tree / W * 1000) / 10, t: AN.U.uT.value };
    },
    // tests only: hold a framing and a light (camT 0 «à porta» → 1 «no lugar»; light 0 «sala acesa» → 1 «espetáculo»; open 0 → 1)
    hold(o = {}) { if (o.camT != null) camT = o.camT; if (o.light != null) setLight(o.light); if (o.open != null) { curtainK = 1 - o.open; setCurtains(curtainK); } if (o.caseK != null) caseK = o.caseK; if (o.poster) { video.pause(); screenMat.map = posterTex; reflMat.uniforms.map.value = posterTex; screenMat.needsUpdate = true; } },
    seatTops() { return rows.map(r => [r[0], r[1]]); },
    stats() { return { silkSwapMs: SILK_SWAP_MS, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, filmReads, filme: { lido: !!anFilm.lin, brilho: +filmScr.toFixed(5) }, pr: renderer.getPixelRatio(),
      silkCount: (silk.visible ? 1 : 0) + (silkC.visible ? 1 : 0), silkMs: +silkMsAvg.toFixed(3) }; },   // round E: silks in this frame; the cloth's simulation per frame (ms, averaged)
    video
  };
}
