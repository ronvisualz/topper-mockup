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
  loadHat().then(geo => { hats.forEach((h, i) => { h.geometry.dispose(); h.geometry = paintHat(geo, HAT_COLOURS[i % HAT_COLOURS.length]); }); hatsReal = true; }).catch(e => console.warn('[mockup] stage hat', e));

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
  const anLook = new THREE.Vector3(0, 3.9, -7.9);
  function poseOf(name) {
    const I = AN.info.cams, wide = innerWidth / innerHeight >= 1.55, ph = isPhone(), V = a => new THREE.Vector3(a[0], a[1], a[2]);
    if (name === 'galeria') { const c = I.galeria, pos = V(c.pos), y = THREE.MathUtils.degToRad(anYaw), p = THREE.MathUtils.degToRad(anPitch);
      return { name, pos, look: pos.clone().add(new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p))), fov: lerp(ph ? 84 : c.fov, galFov, galZoom) }; }   // a phone held upright: a wider lens, about 45° across; closer on a portal (C2b)
    const n = name === 'lugar' && ph ? 'telemovel' : name, c = I[n];
    return { name, pos: V(c.pos), look: V(c.look), fov: n === 'lugar' && !wide ? c.fov_narrow : n === 'chegada' && ph ? 84 : c.fov };   // the arrival on a phone: a wider lens, the ring still whole
  }
  function anPose() { return poseOf(anCam); }
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
  // the opening (first entry in a visit): the silk comes out of the forest's depth, crosses the oculus and opens over it (1400 ms);
  // it leaves (900 ms) with the first work already on the screen; the camera comes down to the seat (2600 ms) as the light goes to «sessão» (1200 ms)
  const SILK_AN = 1.25;                            // the silk at 13.1 × 8.75 m: it covers the 9.6 × 5.4 screen with a margin
  // C2b: the silk of the opening, as a function of time (also used by the tests to place it at an exact moment)
  // flight (0 → 1 over 1400 ms): a crumpled ball of cloth from the forest's depth (z −30), between the trunks, tumbling; it keeps its real
  // size the whole way — it grows by perspective alone — and opens out whole only in the last 400 ms, as it reaches the oculus
  const SA = new THREE.Vector3(-4, 6, -30), SC = new THREE.Vector3(3.5, 7.5, -17);
  function silkFlight(t) {
    const U = silkMat.uniforms, B = new THREE.Vector3(0, SCREEN.c.y, SCREEN.c.z + 0.75), k = EASE.between(t), a = 1 - k, open = EASE.cam(fit(t * 1400, 1000, 1400));
    silk.visible = true; silk.scale.setScalar(SILK_AN); U.uPullT.value = 0; U.uDiag.value = 1;
    silk.position.set(a * a * SA.x + 2 * a * k * SC.x + k * k * B.x, a * a * SA.y + 2 * a * k * SC.y + k * k * B.y, a * a * SA.z + 2 * a * k * SC.z + k * k * B.z);
    const spin = 1 - open; silk.rotation.set((2.6 - 1.9 * k) * spin, (3.4 - 2.2 * k) * spin, (1.9 - 1.1 * k) * spin);
    U.uCrumple.value = 1 - open; U.uT.value = t * 1.4; U.uAmp.value = 0.3 * (1 - k * 0.6) + 0.06;
  }
  // exit (0 → 1 over 900 ms): pulled by its top corner, ahead — that corner goes first, the far ones lag, the cloth stretches out behind it
  function silkExit(t) {
    const U = silkMat.uniforms; silk.visible = t < 1; silk.position.set(0, SCREEN.c.y, SCREEN.c.z + 0.75); silk.rotation.set(0, 0, 0); silk.scale.setScalar(SILK_AN);
    U.uCrumple.value = 0; U.uDiag.value = t < 1 ? 1 : 0; U.uCorner.value.set(5.25, 3.5); U.uPullDir.value.set(17 / SILK_AN, 2.5 / SILK_AN, 0.4 / SILK_AN);
    U.uPullT.value = t < 1 ? t : 0; U.uT.value = 1.4 + t * 0.9; U.uAmp.value = 0.12 + 0.24 * Math.sin(t * Math.PI);
  }
  async function anOpening(p) {
    if (anState !== 'abertura') return;           // skipped before it began (a click while the shaders were compiling)
    anCam = 'chegada'; anCamK = 1; anFrom = null; AN.setMix(0); shown.op = 0; anTextIn = false; silk.visible = true; silkMat.uniforms.uPhase.value = Math.random() * 6;
    // C2b: a crumpled ball of cloth from the forest's depth (z −30), between the trunks, tumbling; it keeps its real size the whole way —
    // it grows by perspective alone — and opens out whole only in the last 400 ms, as it reaches the oculus
    silk.scale.setScalar(SILK_AN); silkFlight(0);
    await tween('lencoEntra', 1400, t => { if (anState === 'abertura') silkFlight(t); });
    if (anState !== 'abertura') return;
    show(p); index = list.indexOf(p); shown.pos.copy(SCREEN.c); shown.scale = 1; shown.op = 1; strandsFlash();
    // C2c: the camera comes down as the silk is pulled away (not after it): about 5 s from the click to the title
    const exit = tween('lencoSai', 900, t => { if (anState === 'abertura') silkExit(t); });
    lightTo(1, 1200); const down = camTo('lugar', 2600, 'descida');
    tween('texto-espera', 2200, () => {}).then(() => { if (anState === 'abertura') { anTextIn = true; log({ name: 'texto-entra', t: performance.now() }); } });   // the title and buttons: the descent's last 400 ms
    await exit; await down;
    if (anState === 'abertura') anState = 'lugar';
  }
  // a click or a scroll skips it: everything at its end state at once
  function anSkip() {
    if (anState !== 'abertura') return;
    anState = 'lugar'; anTextIn = true; finishTweens(); silk.visible = false; silkMat.uniforms.uPullT.value = 0; silkMat.uniforms.uCrumple.value = 0; silkMat.uniforms.uDiag.value = 0; anCam = 'lugar'; anCamK = 1; AN.setMix(1); AN.setStrandFlash(0);
    const p = cur && list.includes(cur) ? cur : list[Math.max(0, index)] || list[0]; if (cur !== p) { show(p); index = list.indexOf(p); }
    shown.pos.copy(SCREEN.c); shown.scale = 1; shown.op = 1; log({ name: 'abertura-saltada', t: performance.now() });
  }
  addEventListener('wheel', () => { if (anMode && anState === 'abertura') anSkip(); }, { passive: true });
  canvas.addEventListener('pointerdown', () => { if (anMode && anState === 'abertura') anSkip(); });
  /* the gallery: stops at the portals and the oculus; the centred portal lit at 100% playing its clip (a second video: the main
     screen goes to its poster meanwhile, one film at a time), the others at 55% on their posters */
  const portalAngles = () => AN.info.portals.map(o => o.theta).sort((a, b) => a - b);   // the posters are sorted the same way (by angle)
  const STOPS = () => [...portalAngles(), 0].sort((a, b) => a - b);
  const pvideo = document.createElement('video'); pvideo.muted = true; pvideo.loop = true; pvideo.playsInline = true; pvideo.crossOrigin = 'anonymous'; pvideo.preload = 'auto';
  const ptex = new THREE.VideoTexture(pvideo); ptex.colorSpace = THREE.SRGBColorSpace;
  function setPortalFocus(i) {
    if (i === anPortal) return; anPortal = i;
    AN.posters.forEach((o, k) => { const m = o.material; if (!m.userData.poster) m.userData.poster = m.map; m.map = k === i ? ptex : m.userData.poster; m.color.setScalar(k === i ? 1 : 0.55); m.needsUpdate = true; });
    pvideo.pause();
    if (i >= 0) { const p = projects[i % projects.length]; pvideo.src = asset(p.clip); pvideo.load(); const pr = pvideo.play(); if (pr && pr.catch) pr.catch(() => {});
      video.pause(); screenMat.map = posterTex; screenMat.needsUpdate = true; }                    // one film at a time
  }
  function galleryOff() {          // the portals back on their posters at 55%, the main film playing again
    setPortalFocus(-1); AN.posters.forEach(o => { o.material.color.setScalar(0.55); });
    if (cur) { const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  function nearestPortal() {
    const ang = portalAngles(); let best = -1, bd = 25;
    ang.forEach((a, k) => { const d = Math.abs(((anYaw - a) % 360 + 540) % 360 - 180); if (d < bd) { bd = d; best = k; } }); return best;
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
  function portalAtYaw(yaw) { const a = portalAngles(); for (let k = 0; k < a.length; k++) if (Math.abs(((yaw - a[k]) % 360 + 540) % 360 - 180) < 1) return k; return -1; }
  function turnStop(d) {           // ← → : the next stop to the left or right (a portal, or the oculus at 0°)
    const st = STOPS(); let best = null;
    for (const s of st) for (const w of [-360, 0, 360]) { const a = s + w; if (d > 0 ? a > anYaw + 1 : a < anYaw - 1) if (best == null || (d > 0 ? a < best : a > best)) best = a; }
    return turnTo(best == null ? anYaw : best).then(() => { const k = portalAtYaw(anYaw); return k >= 0 && anState === 'galeria' ? zoomOn(k) : null; });
  }
  canvas.addEventListener('pointerdown', e => { if (!anMode || anState !== 'galeria') return; if (galZoom > 0) unzoom(); const x0 = e.clientX, y0 = e.clientY, a0 = anYaw, p0 = anPitch; anDragged = false;
    const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) anDragged = true; anYaw = a0 - (ev.clientX - x0) / innerWidth * 120; anPitch = Math.max(-20, Math.min(20, p0 + (ev.clientY - y0) / innerHeight * 40)); };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      // the end of a drag near a portal (within 25°): it settles on it and the lens closes
      if (anDragged && anState === 'galeria') { const k = nearestPortal(); if (k >= 0) enqueue(async () => { if (anState !== 'galeria') return; const a = portalAngles()[k], d = ((a - anYaw) % 360 + 540) % 360 - 180; await turnTo(anYaw + d, 300, 'assenta'); await zoomOn(k); }); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); });
  function sampleFilm(now) {     // the film's mean colour, read four times a second, smoothed over 400 ms (decision 7)
    const src = screenMat.map === vtex ? video : posterTex.image;
    if (now - anFilmT > 250 && src && (src.videoWidth || src.width)) {
      anFilmT = now; try { filmCx.drawImage(src, 0, 0, 16, 16); const d = filmCx.getImageData(0, 0, 16, 16).data, m = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) { const v = d[i * 4 + c] / 255; m[c] += v; m[c + 3] += v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
        anFilm.target = [m[0] / 256, m[1] / 256, m[2] / 256]; anFilm.lin = [m[3] / 256, m[4] / 256, m[5] / 256]; } catch (e) { anFilm.target = null; }
    }
    const tg = anFilm.target || [0.06, 0.06, 0.06];          // no reading (a tainted canvas): the neutral light of phase B
    for (let i = 0; i < 3; i++) anFilm[i] += (tg[i] - anFilm[i]) * Math.min(1, 16 / 400);
    const on = screen.visible ? 1 : 0, e = AN.screenMat.uniforms.uEmit.value * on, lin = anFilm.lin || [0.005, 0.005, 0.005];
    AN.setFilm([anFilm[0] * anFilmK * on, anFilm[1] * anFilmK * on, anFilm[2] * anFilmK * on]); AN.setScreen([lin[0] * e, lin[1] * e, lin[2] * e]);
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
  const LEAN_RES = [1, 0.75, 0.6]; let anSlowTest = 0;   // anSlowTest: tests only — ms of work added to each frame, as a slow GPU would
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
    const sRGB = k => new THREE.Color(PAL[k][0] / 255, PAL[k][1] / 255, PAL[k][2] / 255);   // the shaders write their id raw (they return before the sRGB step)
    for (const ls of AN.lampSets) { const u = ls.mat.uniforms; u.uIdOn.value = 1; u.uId.value = sRGB('lampadas'); swaps.push([ls.points, ls.mat, () => { u.uIdOn.value = 0; }]); }
    AN.group.traverse(o => {
      if (!o.isMesh) return; const n = o.name;
      if (o.userData.noId) { hide.push(o); return; }
      if (o === AN.ground) { sw(o, C('chao')); return; }
      if (o === AN.sky) sw(o, Object.assign(C('ceu'), { side: THREE.BackSide, depthWrite: false }));
      else if (n.startsWith('SM_Lamp')) sw(o, C('lampadas'));
      else if (n.startsWith('REF_Portal')) sw(o, C('portais'));
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
    hide.forEach(o => { o.visible = false; }); const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera); const id = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, id);
    renderer.toneMapping = tm; hide.forEach(o => { o.visible = true; }); for (const [o, m, f] of swaps) { if (f) f(); else o.material = m; }
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
    if (silk.visible) { const off = []; AN.group.traverse(o => { if (o.visible && (o.userData.noId || o.isPoints)) { off.push(o); o.visible = false; } }); renderer.render(scene, camera); const sp = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, sp); off.forEach(o => { o.visible = true; });
      const L_ = names.indexOf('lenco') + 1; let top = [0, 0, 0], tl = -1; for (let i = 0; i < W * H; i++) if (cls[i] === L_) { const l = 0.2126 * sp[i * 4] + 0.7152 * sp[i * 4 + 1] + 0.0722 * sp[i * 4 + 2]; if (l > tl) { tl = l; top = [sp[i * 4], sp[i * 4 + 1], sp[i * 4 + 2]]; } }
      out.lenco_sozinho = { mais_claro: top, dif_max: Math.max(Math.abs(top[0] - 224), Math.abs(top[1] - 39), Math.abs(top[2] - 39)) }; }
    if (silkTop[3] >= 0) out.lenco = { px: (by.lenco || []).length, luzes_a_frente_px: silkLit, mais_claro: silkTop.slice(0, 3), dif_max: Math.max(Math.abs(silkTop[0] - 224), Math.abs(silkTop[1] - 39), Math.abs(silkTop[2] - 39)) };
    out._cls = cls; out._names = names; out._lum = lum;
    out.classes = {}; for (const [k, v] of Object.entries(by)) out.classes[k] = { n: v.length, mediana: pct(q(v.slice(), 0.5)), p99: pct(q(v.slice(), 0.99)) };
    const md = k => out.classes[k] ? out.classes[k].mediana : null, fundo = [md('ceu'), md('nevoeiro'), md('chao')].filter(v => v != null);
    out.oculo = { perto: md('perto'), meio: md('meio'), longe: md('longe'), fundo_min: fundo.length ? Math.min(...fundo) : null };
    out.oculo.troncos_mais_escuros = ['perto', 'meio', 'longe'].every(k => out.oculo[k] == null || out.oculo.fundo_min == null || out.oculo[k] < out.oculo.fundo_min);
    // where the water is, in the 32 × 20 blocks of criterion 9 (image rows from the top), so the sheet can show the criterion without it
    { const A = names.indexOf('agua') + 1, wb = new Float32Array(640); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cls[y * W + x] === A) wb[Math.min(19, Math.floor((H - 1 - y) * 20 / H)) * 32 + Math.min(31, Math.floor(x * 32 / W))]++;
      const per = (W / 32) * (H / 20); out.blocos_agua = Array.from(wb, v => Math.round(v / per * 100) / 100); }
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
  function cardFromHat(i, p) {
    const h = hats[projects.indexOf(p)], m = hatMouth(h), S0 = SCREEN.c.clone(), ctrl = new THREE.Vector3((m.x + S0.x) / 2, 6.4, (m.z + S0.z) / 2);   // C2c: a lower arc (z +1.2 → 0): it no longer swells in front of the screen
    if (!card) { cardTex = new THREE.Texture(); cardTex.colorSpace = THREE.SRGBColorSpace; const mat = AN.screenMat.clone(); mat.uniforms.map.value = cardTex; mat.uniforms.uOp.value = 1;
      card = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), mat); card.visible = false; card.renderOrder = 2; scene.add(card); }
    if (reduced()) return runTL('fade', T_FADE, t => { if (t >= T_FADE / 2 && cur !== p) { show(p); index = i; } shown.op = Math.abs(t / T_FADE - 0.5) * 2; });
    const id = ++cardLoad;
    return posterOf(p).then(im => {
      if (id !== cardLoad) return;
      if (cardTex.image && (cardTex.image.width !== im.width || cardTex.image.height !== im.height)) cardTex.dispose(); cardTex.image = im; cardTex.needsUpdate = true;
      burst.visible = true; burstMat.uniforms.uO.value.copy(m); strandsFlash(); const s0 = 0.3 / SCREEN.w, s1 = AN_SCALE;
      // C2c: the flight takes about 60% of the 1 100 ms — the card lands on the screen at 700 ms; the title changes the moment it lands
      const LAND = 700; let landed = false;
      return runTL('fromHat3d', T_OUT, t => {
        if (landed) return;
        const k = EASE.cam(fit(t, 80, LAND)), a = 1 - k;
        card.visible = t < LAND; card.position.set(a * a * m.x + 2 * a * k * ctrl.x + k * k * S0.x, a * a * m.y + 2 * a * k * ctrl.y + k * k * S0.y, a * a * m.z + 2 * a * k * ctrl.z + k * k * (S0.z + 0.04));
        card.scale.setScalar(lerp(s0, s1, k)); card.material.uniforms.uOp.value = fit(t, 0, 80);
        shown.op = 1 - fit(t, LAND - 250, LAND);                                // the old film, under the card's arrival
        burstMat.uniforms.uK.value = fit(t, 0, 700); burst.visible = t < 700;
        if (t >= LAND) { landed = true; burst.visible = false; show(p); index = i; shown.pos.copy(S0); shown.scale = 1; shown.op = 1; card.visible = false; log({ name: 'carta-assenta', t: performance.now() }); }
      });
    });
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
  function curtains(open, entry = false) {
    if (reduced()) { setCurtains(open ? 0 : 1); dolly = 0; setLight(open ? 1 : 0); return Promise.resolve(); }
    const from = curtainK, to = open ? 0 : 1;
    // the entry shot: the camera starts ENTRY_BACK metres further back, the whole house in view, and arrives as the curtains open
    // in the theatre there is no dolly: the house light goes from «sala acesa» to «espetáculo» as the curtains open
    return runTL('curtains3d', T_CURTAIN, t => { const k = EASE.between(t / T_CURTAIN); curtainK = lerp(from, to, k); setCurtains(curtainK); if (entry && !thMode) dolly = 1 - k; if (thMode) setLight(open ? Math.max(lightMix, k) : Math.min(lightMix, 1 - k)); });
  }

  /* camera: in the stalls, framed so the screen fills 64–70% of the width (phone ≥ 88%); follows the cursor with a soft lag */
  let base = new THREE.Vector3(0, CAM.y, 9.5), casePos = new THREE.Vector3(0, 3.2, 3.5), camBackT = -1;
  function frame() {
    const W = innerWidth, H = innerHeight, ph = isPhone();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, ph ? 1.5 : 2) * (anMode ? LEAN_RES[anLean] : 1)); renderer.setSize(W, H, false);   // the light amphitheatre: less resolution
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
  // half a second after it is ready to be seen (not while it loads under the veil), single hitches over 250 ms left out — and stays light
  // for the visit: level 1, the trees out of the water's mirror and 0.75 of the resolution; still slow 2 s more, level 2, 0.6 (the text is
  // HTML: it stays sharp) — anLean, lowFor, anCountFrom, LEAN_RES
  onFrame((dt, now) => {
    if (!active) return;
    tick();
    const still = reduced();
    cam.x = damp(cam.x, still ? 0 : pointer.x * CAM.sway.x, 2.6, dt); cam.y = damp(cam.y, still ? 0 : -pointer.y * CAM.sway.y, 2.6, dt);
    if (camBackT >= 0) { /* the approach after a swap returns over 800 ms */ }
    if (anMode && AN) {
      if (anSlowTest) { const t0 = performance.now(); while (performance.now() - t0 < anSlowTest); }
      runTweens(now); AN.freeze(reduced() || anStill);
      const P = anPose(); let pos = P.pos, look = P.look, fov = P.fov;
      if (anFrom && anCamK < 1) { const k = EASE.cam(anCamK); pos = anFrom.pos.clone().lerp(P.pos, k); look = anFrom.look.clone().lerp(P.look, k); fov = lerp(anFrom.fov, P.fov, k);
        const o = anFrom.open; if (o) { const ms = anCamK * o.dur; fov = ms < o.ms ? lerp(anFrom.fov, o.fov, EASE.cam(ms / o.ms)) : lerp(o.fov, P.fov, EASE.cam((ms - o.ms) / (o.dur - o.ms))); } }   // C2c: the lens opens first
      camera.position.copy(pos); anLook.copy(look);
      if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(look);
      if (anState === 'galeria') setPortalFocus(nearestPortal());
      AN.tick(now / 1000); sampleFilm(now); AN.setViewport(renderer.getContext().drawingBufferHeight, renderer.getPixelRatio());
      if (anLean < 2 && now > anCountFrom && dt > 0 && dt < 0.25) { lowFor = 1 / dt < 50 ? lowFor + dt : Math.max(0, lowFor - dt);
        if (lowFor > 2) { anLean++; lowFor = 0; anCountFrom = now + 500; if (AN.lean) AN.lean(true); frame(); log({ name: 'anfi-leve', nivel: anLean, fps: Math.round(1 / dt) }); } }   // the switch's own frame not counted
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
    // hats: lifted 0.15 m and lit when theirs is on the screen; out of the filter they sink under the stage
    for (const h of hats) {
      const u = h.userData, on = cur && projects[u.i] === cur, inList = list.includes(projects[u.i]);
      u.lift = damp(u.lift, on ? 0.15 : 0, 8, dt); u.sink = damp(u.sink, inList ? 0 : 1, 10, dt); u.x = damp(u.x, u.tx, 7.5, dt);
      if (anMode && AN) {      // the hats on the oculus side of the stage's edge, −70° … +70° (B2)
        const I = AN.info.hats, th = THREE.MathUtils.degToRad(I.theta[u.i % I.theta.length]), g = h.geometry;
        if (!g.boundingBox || g.userData.bbFor !== g.uuid) { g.computeBoundingBox(); g.userData.bbFor = g.uuid; }
        const k = AN.info.hat_height / (g.boundingBox.max.y - g.boundingBox.min.y);
        h.scale.setScalar(k); h.position.set(I.r * Math.sin(th), I.y - g.boundingBox.min.y * k + u.lift, -I.r * Math.cos(th)); h.rotation.set(0, -th, 0);
      } else { h.scale.setScalar(1); h.position.set(u.x + hatsX, 1.0 + u.lift - u.sink * 0.8, -0.22); }   /* at the very front of the stage */
      if (!(anMode && AN)) h.rotation.set(0.12 + (u.tilt || 0), Math.sin(now / 1000 * 0.5 + u.i) * 0.15, 0);
      if (hatsReal) h.material.vertexColors = true;
      u.glow = damp(u.glow || 0, on ? 1 : 0, 8, dt); if (h.material.emissive) h.material.emissive.setScalar(on ? 0.12 : 0); else if (h.material.uniforms) h.material.uniforms.uOn.value = u.glow; h.visible = u.sink < 0.98;
    }
    dustMat.uniforms.uT.value = now / 1000;
    renderer.render(scene, camera);
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
    enter(i = 0, { gate } = {}) {
      if (anfiOn()) {
        let readyRes; readyP = new Promise(r => { readyRes = r; });         // the amphitheatre (C1): no opening, no silk, no descent — the work is on the screen at once
        anCountFrom = Infinity; lowFor = 0; readyP.then(() => { anCountFrom = performance.now() + 500; });   // the light guard counts once it can be seen
        active = true; setMode(false); queue.length = 0; tl.render = null; running = false; caseK = 0; camK = 0;
        for (const o of SIMPLE) o.visible = false; if (TH) TH.group.visible = false;
        const p = list[Math.max(0, Math.min(list.length - 1, i))];
        const go = () => {
          setAnfi(true); AN.freeze(reduced()); frame(); projects.forEach(posterOf); finishTweens(); silk.visible = false; setPortalFocus(-1); anYaw = 0; anPitch = 0; try { renderer.compile(scene, camera); } catch (e) {}
          // C2: the first entry in a visit opens with the silk; later ones (and reduced motion) are already in the seat
          if (!anSeen && !reduced()) { anSeen = true; shown.op = 0; AN.setMix(0); anCam = 'chegada'; anCamK = 1; anFrom = null; anState = 'abertura'; anTextIn = false;
            // every shader ready before the opening's first frame: compiled, then one real frame drawn with everything that will show
            // (the silk, the screen, the motes) — the water's mirror compiles its own variants in it
            enqueue(async () => { const sv = screen.visible; silk.visible = true; silk.scale.setScalar(0.3); silk.position.set(0, SCREEN.c.y, SCREEN.c.z + 0.75); screen.visible = true; burst.visible = true;
              try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
                // round D review: and for the water's mirror, whose linear target needs variants of its own — compileAsync makes only the
                // screen's, and from the arrival the mirror does not see everything it will (the screen's own came ~2 s after the veil, in C2c too)
                if (AN.mirrorTarget) { const rt = renderer.getRenderTarget(); renderer.setRenderTarget(AN.mirrorTarget()); renderer.compile(scene, camera); renderer.setRenderTarget(rt); }
                renderer.render(scene, camera); } catch (e) {}
              silk.visible = false; screen.visible = sv; burst.visible = false; log({ name: 'compilado', programas: renderer.info.programs.length }); });
            // the first work's film too, still under the veil: loaded, playing, and its first frame already on the GPU (it cost 176 ms in view)
            enqueue(() => new Promise(res => { const done = () => { clearTimeout(to); try { vtex.needsUpdate = true; renderer.initTexture(vtex); } catch (e) {} log({ name: 'filme-pronto', readyState: video.readyState }); res(); };
              const to = setTimeout(done, 2500); video.pause(); video.src = asset(p.clip); video.load(); video.addEventListener('playing', done, { once: true }); const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); }));
            enqueue(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); enqueue(() => { readyRes(); return gate || null; });   // the veil lifts, then the silk   // every shader ready before the first frame of the opening
            enqueue(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); enqueue(() => anOpening(p)); }
          else { anSeen = true; anState = 'lugar'; anTextIn = true; anCam = 'lugar'; anCamK = 1; anFrom = null; AN.setMix(1); show(p); index = list.indexOf(p); shown.pos.copy(SCREEN.c); shown.scale = 1; shown.op = 1; requestAnimationFrame(() => requestAnimationFrame(readyRes)); }
        };
        if (AN) go(); else { shown.op = 0; ensureAnfi().then(a => { if (a && active) go(); }); }
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
    leave() { active = false; video.pause(); pvideo.pause(); finishTweens(); },
    // arrows, keys, swipe: the silk; a request made mid-trick waits its turn
    step(d) { if (anMode && anState === 'galeria') { enqueue(() => turnStop(d)); return; } enqueue(() => { const i = clamp(index + d, 0, list.length - 1); if (i === index) return Promise.resolve(); return silkTo(i, list[i], d); }); },
    // a hat: back into the current one (400 ms), out of the chosen one (1100 ms)
    // the amphitheatre (C2): the work rises out of its hat as a glowing card and flies to the oculus (1100 ms)
    pick(pi) { if (anMode) { enqueue(async () => { const p = projects[pi]; if (anState !== 'lugar' || !list.includes(p) || p === cur) return; await cardFromHat(list.indexOf(p), p); }); return; } enqueue(async () => { const p = projects[pi]; if (!list.includes(p) || p === cur) return; if (cur) await intoHat(cur); await outOfHat(list.indexOf(p), p); }); },
    filter(newList) {
      enqueue(() => {
        list = newList.slice(); layoutHats();
        return runTL('filter3d', 400, () => {}).then(() => { if (!list.includes(cur)) return silkTo(0, list[0], 1); index = list.indexOf(cur); onShown && onShown(cur, index, list.length); });
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
    screenRect() { const c = screen.position, s = screen.scale.x, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => this.project(new THREE.Vector3(c.x + a * SCREEN.w / 2 * s, c.y + b * SCREEN.h / 2 * s, c.z))); const xs = pts.map(q => q.x), ys = pts.map(q => q.y); return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }; },
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
    choosePortal(k) { enqueue(async () => { if (!anMode || anState !== 'galeria' || k < 0) return; const p = projects[k % projects.length]; anState = 'escolha';
      // C2b: whoever chooses a work wants to see it — back to the seat (1 600 ms), facing the oculus, the silk over its last 900 ms
      // C2c: from a closed lens (a portal centred) it opens again to the gallery's own (60°, 84° on a phone) over the first 300 ms, before the screen comes into view
      galleryOff(); const back = camTo('lugar', 1600, 'para-o-lugar', galZoom > 0 ? { ms: 300, fov: isPhone() ? 84 : AN.info.cams.galeria.fov } : null); await tween('espera', 700, () => {}); galZoom = 0;
      if (list.includes(p) && p !== cur) await silkTo(list.indexOf(p), p, 1); await back; anState = 'lugar'; }); },
    focusedPortal() { return anPortal; },
    portalAt(x, y) { if (!AN) return -1; const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera); const hit = ray.intersectObjects(AN.posters, false)[0]; return hit ? AN.posters.indexOf(hit.object) : -1; },
    portalPoints() { if (!AN) return []; const d = new THREE.Vector3(); camera.getWorldDirection(d); return AN.posters.map((o, k) => { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const w = o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);   /* its vertices are in world space */ const front = w.clone().sub(camera.position).dot(d) > 0.5, q = this.project(w);
      const ang = portalAngles()[k], side = ((ang - anYaw) % 360 + 540) % 360 - 180;
      const box = front ? portalBoxPx(k) : null;
      return { x: q.x, y: q.y, bottom: box ? box.bottom : q.y, on: front && q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight, side, focus: k === anPortal, project: projects[k % projects.length].title }; }); },
    turnToPortal(k) { const a = portalAngles()[k]; if (a == null || anState !== 'galeria') return; const d = ((a - anYaw) % 360 + 540) % 360 - 180; if (Math.abs(d) > 2 || galZoom < 1) enqueue(async () => { if (anState !== 'galeria') return; if (Math.abs(d) > 2) await turnTo(anYaw + d); await zoomOn(k); }); },
    portalBox(k) { return AN ? portalBoxPx(k) : null; }, get galZoom() { return galZoom; },
    get dragged() { return anDragged; },
    get anfi() { return { mode: anMode, loaded: !!AN, cam: anCam, state: anState, fov: +camera.fov.toFixed(1), yaw: +anYaw.toFixed(1), portal: anPortal, uT: AN ? +AN.U.uT.value.toFixed(3) : null, mix: AN ? AN.mix : null, loadMs: AN ? AN.loadMs : null, readyMs: AN ? AN.readyMs : null, triangles: AN ? AN.triangles : null, film: anFilm.slice(0, 3), leve: anLean }; },
    anfiCam(n) {   // mockup bar and tests: a place at once (the opening skipped)
      if (anState === 'abertura') anSkip(); finishTweens(); queue.length = 0; tl.render = null; running = false;
      anCam = n || { chegada: 'lugar', lugar: 'galeria', galeria: 'chegada' }[anCam]; anCamK = 1; anFrom = null; galZoom = 0;
      if (anCam === 'galeria') anState = 'galeria'; else { if (anState === 'galeria' || anState === 'escolha') galleryOff(); anState = 'lugar'; }
      if (anMode) frame(); return anCam; },
    anfiSkip() { anSkip(); },
    get anfiTextIn() { return anTextIn; },   // C2c: the title may show before the opening ends (its last 400 ms)
    anfiCover() { return oculusCover(); },
    anfiSlowmo(k) { slowmo = k || 1; },
    // tests only: the opening's silk held at a moment (fase 'voo' 0–1400 ms or 'saida' 0–900 ms), seen from the arrival; null puts it away
    anfiSilkAt(fase, ms) { if (fase == null) { silk.visible = false; silkMat.uniforms.uCrumple.value = 0; silkMat.uniforms.uDiag.value = 0; silkMat.uniforms.uPullT.value = 0; shown.op = 1; return; } anCam = 'chegada'; anCamK = 1; anFrom = null; shown.op = fase === 'voo' ? 0 : 1; if (fase === 'voo') silkFlight(ms / 1400); else silkExit(ms / 900); },   // as in the opening: no film yet during the flight
    // tests only: tune the amphitheatre's live values against the B2 renders (screen emission, film factor, the hats' lights)
    anfiTune(o = {}) { if (!AN) return null; if (o.slowMs != null) { anSlowTest = o.slowMs; return { slowMs: anSlowTest }; } if (AN.tune && ['sunK', 'treeSun', 'treeAmb', 'shaftK', 'back'].some(k => o[k] != null)) return AN.tune(o); if (o.emit != null) AN.screenMat.uniforms.uEmit.value = o.emit; if (o.filmK != null) anFilmK = o.filmK; for (const k of ['key', 'fill', 'amb']) if (o[k] != null) AN_LIGHT[k] = o[k]; setAnfi(anMode); return { emit: AN.screenMat.uniforms.uEmit.value, filmK: anFilmK, ...AN_LIGHT }; },
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
    anfiMeasure() { const m = measureAnfi(); delete m._cls; delete m._names; delete m._lum; return m; },
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
    stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs.length, pr: renderer.getPixelRatio() }; },
    video
  };
}
