/* mockup v6.4 — the amphitheatre under the wave (plan §15, phase C1b), loaded as the Work page's scenery.
   The light is baked in Blender (blender/anfi_c.py) — «aberto», «sessão» and «tela» (the screen alone, white) — in two sets of
   textures: the shell's own (4096 × 1024, one island along the whole ribbon) and the rest's; stored on a log scale up to the
   true maximum (no clipping, the same relative step in the dark as in the light). Here:
     light = mix(aberto, sessão) + tela × the film's mean colour (its true proportion since C2), × a repeating wood or stone in metres,
   and the result goes through a 32³ colour table made by Blender's own view (AgX + Base Contrast): the site shows the curve the
   approved renders show, with no three.js tone mapping on these surfaces (review of C1).
   What has no light of its own — sky, fog, trees, lamps, fillets, strands — is drawn at the display values calibrated in B2.
   Alive: the fog bank and the low fog drift; the water ripples and mirrors the room, the forest and the film (a planar
   reflection, never above half the screen); the lamps breathe ±8% over 9 s, out of step; the trees sway half a degree.
   Files (assets/anfi/): anfi-static.glb.js, anfi-live.glb.js, lm-{casca,resto}-{aberto,sessao,tela}.png, lut-agx.png,
   tile-*.jpg, forest-*.png, anfi.json */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const DIR = new URL('../assets/anfi/', import.meta.url).href;
async function glb(name) {
  const b64 = (await import(DIR + name + '.js')).default, bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new GLTFLoader().parseAsync(bin.buffer, '');
}
function tex(name, srgb, repeat) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(DIR + name, t => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = false; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } res(t);
  }, undefined, rej));
}
/* the colour table: an N² × N strip (x = b·N + r, y = g, Blender's rows from the bottom) → an N³ texture (N = 64, blender/lut_agx.py) */
function lut(name) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      const N = im.height, cv = document.createElement('canvas'); cv.width = N * N; cv.height = N; const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(im, 0, 0); const src = cx.getImageData(0, 0, N * N, N).data, data = new Uint8Array(N * N * N * 4);
      for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
        const s = ((N - 1 - g) * N * N + b * N + r) * 4, d = ((b * N + g) * N + r) * 4;
        data[d] = src[s]; data[d + 1] = src[s + 1]; data[d + 2] = src[s + 2]; data[d + 3] = 255;
      }
      const t = new THREE.Data3DTexture(data, N, N, N); t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
      t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true; res(t);
    };
    im.onerror = rej; im.src = DIR + name;
  });
}
const FOG_HEX = '#8c9aae';
/* a display value (0…1 of luminance on screen) in the fog's hue, as a linear colour for a material that skips tone mapping */
function fogColour(d) {
  const s = new THREE.Color(FOG_HEX).convertLinearToSRGB(), L = 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b, k = d / L;
  return new THREE.Color().setRGB(Math.min(1, s.r * k), Math.min(1, s.g * k), Math.min(1, s.b * k), THREE.SRGBColorSpace);
}
const WARM = new THREE.Color().setRGB(1.0, 0.965, 0.92, THREE.SRGBColorSpace);  // the lamps' warm white at the core, as the B2 render shows it (255, 251, 242)
const GLOW = new THREE.Color().setRGB(1.0, 0.78, 0.55, THREE.SRGBColorSpace);   // their glow on the wood, warmer
const NOISE = 'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n' +
  'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }\n' +
  'float fbm(vec2 p){ return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1) + 0.15 * vnoise(p * 4.3); }\n';
const CS = '\n#include <colorspace_fragment>\n}';

/* round D (D-DESIGN): the sunset. Blender's view as a function (the colour table), and the sunset sky's own formula — the world of
   blender/sunset_d.py, in linear light, run through the same table: the sky the approved renders show */
const VIEW = 'uniform highp sampler3D uLut; uniform vec2 uLutR; uniform vec2 uLutS;\n' +
  'vec3 view(vec3 lin){ vec3 t = clamp((log2(max(lin, vec3(1e-7)) / 0.18) - uLutR.x) / (uLutR.y - uLutR.x), 0.0, 1.0); return texture(uLut, t * uLutS.x + uLutS.y).rgb; }\n';
const SKY = 'uniform vec3 uSkyTop; uniform vec3 uSkyFar; uniform vec3 uSkySun; uniform vec3 uSkyGlow; uniform float uSkyK; uniform vec3 uSunD; uniform vec4 uSkyR;\n' +
  'vec3 skyRad(vec3 d){ float dt = dot(d, uSunD); float side = smoothstep(uSkyR.x, uSkyR.y, dt); float low = 1.0 - smoothstep(uSkyR.w, uSkyR.z, d.y);\n' +
  '  vec3 c = mix(uSkyTop, mix(uSkyFar, uSkySun, side), low) + uSkyGlow * pow(clamp(dt, 0.0, 1.0), 24.0) * 3.0; return c * uSkyK; }\n';

// round D: does the water's mirror skip this frame? Only with the camera still, on a fast screen (frames under 9 ms, so the reflection
// still changes ≥ 60 times a second), every other frame; on a 60 Hz screen, or while anything moves the camera or its lens, never
export function mirrorSkips(moved, frame, dtMs) { return !moved && dtMs < 9 && (frame & 1) === 1; }
let once = null;
export function loadAnfi() { return once || (once = loadNow()); }
async function loadNow() {
  const t0 = performance.now();
  const info = await fetch(DIR + 'anfi.json').then(r => r.json()), DF = !!info.forest;   // DF: round D's forest and sunset (else B2's night)
  const [stat, live, sA, sB, sT, rA, rB, rT, LUT, tWood, tBench, tStone, tBlack, X] = await Promise.all([
    glb('anfi-static.glb'), glb('anfi-live.glb'),
    tex('lm-casca-aberto.png'), tex('lm-casca-sessao.png'), tex('lm-casca-tela.png'), tex('lm-resto-aberto.png'), tex('lm-resto-sessao.png'), tex('lm-resto-tela.png'),
    lut('lut-agx.png'),
    tex('tile-wood.jpg', true, true), tex('tile-bench.jpg', true, true), tex('tile-stone.jpg', true, true), tex('tile-stone-black.jpg', true, true),
    DF ? Promise.all([glb(info.forest.glb), tex(info.forest.atlas, true), tex('lm-casca-sol.png'), tex('lm-resto-sol.png')])
       : Promise.all([tex('forest-near.png', true), tex('forest-mid.png', true), tex('forest-far.png', true)])]);
  const [fNear, fMid, fFar] = DF ? [] : X, [treesGlb, tAtlas, sS, rS] = DF ? X : [];
  const group = new THREE.Group(); group.name = 'anfi';
  const LUTS = new THREE.Vector2((LUT.image.width - 1) / LUT.image.width, 0.5 / LUT.image.width);   // sample texel centres
  const U = { uMix: { value: 1 }, uFilm: { value: new THREE.Vector3() }, uScr: { value: new THREE.Vector3() }, uT: { value: 0 } };   // shared by every material
  const D = info.display, mixD = k => THREE.MathUtils.lerp(D.aberto[k], D.sessao[k], U.uMix.value);
  const R = k => new THREE.Vector2(info.lmax[k][0], info.lmax[k][1]);
  // round D: the sun (its direction toward it, its colour × strength ÷ π: a white diffuse surface's radiance under it), the sky's formula
  const LU = { uLut: { value: LUT }, uLutR: { value: new THREE.Vector2(info.lut.lo, info.lut.hi) }, uLutS: { value: LUTS } };
  const SU = DF ? { uSunD: { value: new THREE.Vector3(...info.sun.dir).normalize() }, uSkyTop: { value: new THREE.Vector3(...info.sky.top) }, uSkyFar: { value: new THREE.Vector3(...info.sky.far) },
    uSkySun: { value: new THREE.Vector3(...info.sky.sun) }, uSkyGlow: { value: new THREE.Vector3(...info.sky.glow) }, uSkyK: { value: info.sky.strength },
    uSkyR: { value: new THREE.Vector4(info.sky.side[0], info.sky.side[1], info.sky.low[0], info.sky.low[1]) } } : {};
  const sunLum = DF ? 0.2126 * info.sun.colour[0] + 0.7152 * info.sun.colour[1] + 0.0722 * info.sun.colour[2] : 1;
  const SUNC = DF ? new THREE.Vector3(...info.sun.colour).multiplyScalar(1 / sunLum) : new THREE.Vector3();   // the «sol» bake is grey: its hue comes back here
  const uSunK = { value: 0.55 };   // the sun layer's strength, the same in both states (D-DESIGN); 0.55 matches the d1 renders (Task 7: the seat's patch, the screen over it, the gallery)
  // the trees' sun and sky: matched to the d1 renders (25 Nov) — seen from the seat they are near silhouettes (their lit sides face
  // away), and AgX's curve hides how much: at 1 the oculus' trees read 2.3× the render; at 0 / 0 nearly its value; 0.12 / 0.35 keeps a little life
  const uTreeK = { value: new THREE.Vector2(0.12, 0.35) };

  /* the baked surfaces: light × repeating texture → Blender's view (the colour table) */
  const TILE = { MAT_wood: [tWood, info.tile_m.wood], MAT_niche: [tWood, info.tile_m.wood], MAT_bench: [tBench, info.tile_m.bench],
    MAT_stone: [tStone, info.tile_m.stone], MAT_black_stone: [tBlack, info.tile_m.stone_black], MAT_brass: [null, 1], MAT_cushion: [null, 1] };
  const FLAT = { MAT_brass: new THREE.Color('#7a5a2c'), MAT_cushion: new THREE.Color('#1d1b1f') };
  // the bake keeps only the diffuse light: the white a surface reflects is added back as its mean over all angles (≈ 4.5 %), under
  // the same light — never tied to the camera
  // every non-metal in B2 has the same base reflection (Principled, specular 0.5 → F0 0.04): on the dark stone it is what makes the steps read
  const SPEC = { MAT_wood: 0.045, MAT_niche: 0.045, MAT_bench: 0.045, MAT_stone: 0.045, MAT_black_stone: 0.045, MAT_cushion: 0.045, MAT_brass: 0 };
  const uBack = { value: new THREE.Vector3() };   // the top of the wave (the shell's outer face, which the bake does not cover): sky and moon only
  // the screen's own gloss on them (B2's roughness): the 9.6 × 5.4 m film reflected as a soft rectangle, with a rough Fresnel (F0 = 0.04)
  // not on the shell: so close to the screen at the lip the reflection came out as hard-edged wedges (review of C1: no hard stains)
  const ROUGH = { MAT_niche: 0.36, MAT_bench: 0.36, MAT_black_stone: 0.45 };
  function baked(name) {
    const [map, metres] = TILE[name] || [tStone, 2], flat = FLAT[name], shell = name === 'MAT_wood', w = shell ? 'casca' : 'resto';
    return new THREE.ShaderMaterial({
      defines: DF ? { SUNLAYER: 1 } : {},
      uniforms: { ...U, lmA: { value: shell ? sA : rA }, lmB: { value: shell ? sB : rB }, lmT: { value: shell ? sT : rT },
        uRA: { value: R(w + '-aberto') }, uRB: { value: R(w + '-sessao') }, uRT: { value: R(w + '-tela') },
        lmS: { value: DF ? (shell ? sS : rS) : null }, uRS: { value: DF ? R(w + '-sol') : new THREE.Vector2() }, uSunC: { value: SUNC }, uSunK,
        uLut: { value: LUT }, uLutR: { value: new THREE.Vector2(info.lut.lo, info.lut.hi) }, uLutS: { value: LUTS },
        map: { value: map }, uTile: { value: 1 / metres }, uFlat: { value: flat || new THREE.Color(1, 1, 1) }, uHasMap: { value: map ? 1 : 0 }, uBrass: { value: name === 'MAT_brass' ? 1 : 0 }, uSpec: { value: SPEC[name] ?? 0.03 }, uBack, uShell: { value: shell ? 1 : 0 }, uRough: { value: ROUGH[name] ?? 1 } },
      side: shell ? THREE.DoubleSide : THREE.FrontSide,
      vertexShader: 'varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying vec3 vW;\n' +
        'void main(){ vUv = uv; vUv1 = uv1; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform sampler2D lmA; uniform sampler2D lmB; uniform sampler2D lmT; uniform vec2 uRA; uniform vec2 uRB; uniform vec2 uRT; uniform highp sampler3D uLut; uniform vec2 uLutR; uniform vec2 uLutS;\n' +
        'uniform sampler2D map; uniform float uMix; uniform vec3 uFilm; uniform float uTile; uniform vec3 uFlat; uniform float uHasMap; uniform float uBrass; uniform float uSpec; uniform vec3 uBack; uniform float uShell; uniform vec3 uScr; uniform float uRough;\n' +
        'varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying vec3 vW;\n' + NOISE +
        // the light was stored as log2 between r.x and r.y in 8 bits: decode, with ±½ step of noise (no steps in the dark wood and stone)
        'vec3 dec(sampler2D t, vec2 r, float s){ vec3 e = texture2D(t, vUv1).rgb + (hash(gl_FragCoord.xy + s) - 0.5) / 255.0; return exp2(r.x + clamp(e, 0.0, 1.0) * (r.y - r.x)); }\n' +
        '#ifdef SUNLAYER\nuniform sampler2D lmS; uniform vec2 uRS; uniform vec3 uSunC; uniform float uSunK;\n#endif\n' +
        'void main(){ vec3 L = mix(dec(lmA, uRA, 0.0), dec(lmB, uRB, 1.7), uMix) + dec(lmT, uRT, 3.1) * uFilm;\n' +
        '#ifdef SUNLAYER\n  L += dec(lmS, uRS, 5.3) * uSunC * uSunK;   /* round D: the sun alone, baked with the trees\' shadows (grey: its hue from uSunC) */\n#endif\n' +
        '  vec3 alb = uHasMap > 0.5 ? texture2D(map, vUv * uTile).rgb : uFlat;\n' +
        '  if (uShell > 0.5 && !gl_FrontFacing) L = uBack;\n' +
        '  vec3 lin = (alb + uSpec) * L;\n' +
        '  if (uRough < 0.7) { vec3 n = normalize(vN); if (uShell > 0.5 && !gl_FrontFacing) n = -n; vec3 v = normalize(cameraPosition - vW), r = reflect(-v, n);\n' +
        '    if (r.z < -1e-3) { float d = (-7.9 - vW.z) / r.z; if (d > 0.0) { vec3 P = vW + r * d; float nv = max(dot(n, v), 0.0), s = 0.1 + d * uRough * uRough * 1.5 / max(nv, 0.15);   /* a rough lobe stretches at a grazing angle */\n' +
        '      vec2 q = abs(vec2(P.x, P.y - 4.3)) - vec2(4.8, 2.7); float m = (1.0 - smoothstep(-s, s, q.x)) * (1.0 - smoothstep(-s, s, q.y)) * min(1.0, 51.8 / (4.0 * s * s));\n' +
        '      float F = 0.04 + (max(1.0 - uRough, 0.04) - 0.04) * pow(1.0 - nv, 5.0); lin += uScr * F * m; } } }\n' +
        // brass: a little real-time shine (decision 3), from the screen's direction
        '  if (uBrass > 0.5) { vec3 v = normalize(cameraPosition - vW); vec3 h = normalize(v + normalize(vec3(0.0, 4.3, -7.9) - vW)); lin += uFlat * pow(max(dot(normalize(vN), h), 0.0), 40.0) * (0.05 + 0.5 * length(uFilm)); }\n' +
        // Blender's view: log shaper over AgX's own range, then the table (display-referred: no further curve)
        '  vec3 t = clamp((log2(max(lin, vec3(1e-7)) / 0.18) - uLutR.x) / (uLutR.y - uLutR.x), 0.0, 1.0);\n' +
        '  gl_FragColor = vec4(texture(uLut, t * uLutS.x + uLutS.y).rgb, 1.0); }'
    });
  }
  let tris = 0;
  stat.scene.traverse(o => { if (o.isMesh) { const g = o.geometry; for (const k of ['uv3', 'uv2']) if (g.attributes[k]) { g.setAttribute('uv1', g.attributes[k]); g.deleteAttribute(k); break; } } });
  stat.scene.traverse(o => { if (o.isMesh) { o.material = baked((o.material && o.material.name || '').split('.')[0]); o.matrixAutoUpdate = false; o.updateMatrix(); tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
  group.add(stat.scene);

  /* lamps and fillets: calibrated display values, out of the colour table */
  const lampMat = new THREE.ShaderMaterial({ toneMapped: false, uniforms: { ...U, uCol: { value: WARM }, uK: { value: 1 } },
    vertexShader: 'varying float vPh; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vPh = fract(sin(dot(floor(w.xz * 3.0), vec2(12.9, 78.2))) * 43758.5) * 6.283; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; uniform float uT; varying float vPh; void main(){ float b = 1.0 + 0.08 * sin(uT * 6.2832 / 9.0 + vPh); gl_FragColor = vec4(uCol * uK * b, 1.0);' + CS });
  // the fillets' halo: a soft 12 cm band over the wood, added to it
  const haloMat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { ...U, uCol: { value: GLOW }, uK: { value: 0.3 } },
    vertexShader: 'varying vec2 vUv; varying float vPh; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vPh = fract(sin(dot(floor(w.xz * 3.0), vec2(12.9, 78.2))) * 43758.5) * 6.283; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; uniform float uT; varying vec2 vUv; varying float vPh; void main(){ float a = exp(-pow((vUv.y - 0.5) / 0.2, 2.0)); float b = 1.0 + 0.08 * sin(uT * 6.2832 / 9.0 + vPh); gl_FragColor = vec4(uCol * uK * a * b, 1.0);' + CS });
  // the spiral's lamps and the strands' tips: round points, a near-white core of a real size in metres (held between a floor and a
  // ceiling in px) and a warm radial glow around it, never wider than its own ceiling
  //   spiral: a 4 cm bulb, 3–6 px; strand tips (review of C1b): light dust, 1.6 cm — ≤ 3 px from the seat, never > 6 px however close,
  //   their glow ≤ 10 px in the spiral's warm colour
  const LAMP = { espiral: { m: 0.04, min: 3, max: 6, glow: 16, k: 0.16 }, pontas: { m: 0.016, min: 1.5, max: 6, glow: 10, k: 0.22 } };
  function lampPoints(list, o, name) {
    const pos = new Float32Array(list.length * 3), ph = new Float32Array(list.length);
    list.forEach((p, i) => { pos.set(p, i * 3); ph[i] = Math.random() * 6.283; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...U, uCol: { value: WARM }, uGlow: { value: GLOW }, uK: { value: 1 }, uFlash: { value: 0 }, uVH: { value: 900 }, uPR: { value: 1 }, uIdOn: { value: 0 }, uId: { value: new THREE.Color() },
        uM: { value: o.m }, uMin: { value: o.min }, uMax: { value: o.max }, uGlowMax: { value: o.glow }, uGlowK: { value: o.k } },
      vertexShader: 'attribute float aPh; uniform float uVH; uniform float uPR; uniform float uM; uniform float uMin; uniform float uMax; uniform float uGlowMax;\n' +
        'varying float vPh; varying float vCore; varying float vS;\n' +
        'void main(){ vPh = aPh; vec4 mv = modelViewMatrix * vec4(position, 1.0); float pxm = projectionMatrix[1][1] * uVH * 0.5 / -mv.z;\n' +
        '  vCore = clamp(uM * pxm, uMin * uPR, uMax * uPR); vS = min(uGlowMax * uPR, max(vCore * 3.0, vCore + 4.0 * uPR)); gl_PointSize = vS; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform vec3 uGlow; uniform float uK; uniform float uFlash; uniform float uT; uniform float uIdOn; uniform vec3 uId; uniform float uGlowK;\n' +
        'varying float vPh; varying float vCore; varying float vS;\n' +
        'void main(){ float r = length(gl_PointCoord - 0.5) * vS, core = 1.0 - smoothstep(vCore * 0.5 - 0.5, vCore * 0.5 + 0.5, r), halo = exp(-pow(r / (vS * 0.3), 2.0)) * uGlowK;\n' +
        '  if (uIdOn > 0.5) { if (core < 0.5) discard; gl_FragColor = vec4(uId, 1.0); return; }\n' +
        '  float b = (1.0 + 0.08 * sin(uT * 6.2832 / 9.0 + vPh)) * uK * (1.0 + uFlash); gl_FragColor = vec4((uCol * core + uGlow * halo) * b, 1.0);' + CS });
    const pts = new THREE.Points(g, mat); pts.name = name; pts.frustumCulled = false; pts.renderOrder = 5; group.add(pts);
    return { points: pts, mat, list, o };
  }
  const spiral = lampPoints(info.lamps.espiral, LAMP.espiral, 'LMP_espiral'), tips = lampPoints(info.lamps.pontas, LAMP.pontas, 'LMP_pontas');
  const lampSets = [spiral, tips];
  // the largest core on screen (px) of each set, for the measures: the same rule as the shader
  function corePx(camera, vh, pr) {
    const v = new THREE.Vector3(), out = {};
    for (const [k, s] of [['espiral', spiral], ['pontas', tips]]) { let mx = 0;
      for (const p of s.list) { v.set(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse); if (v.z > -0.1) continue; const c = v.clone().applyMatrix4(camera.projectionMatrix); if (Math.abs(c.x) > 1 || Math.abs(c.y) > 1) continue;
        mx = Math.max(mx, Math.min(s.o.max * pr, Math.max(s.o.min * pr, s.o.m * camera.projectionMatrix.elements[5] * vh * 0.5 / -v.z))); }
      out[k] = +(mx / pr).toFixed(1); }
    return out;
  }
  // the strands: they only add light, so they are never darker than the wood behind them
  const STRAND = new THREE.Color().setRGB(0.07, 0.045, 0.025, THREE.SRGBColorSpace);
  const strandMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: STRAND.clone() });
  let frozen = false;

  /* trees, fog bank */
  function treeMat(map, blend) {
    return new THREE.ShaderMaterial({ toneMapped: false, transparent: blend, depthWrite: !blend, side: THREE.DoubleSide,
      uniforms: { ...U, map: { value: map }, uCol: { value: new THREE.Color() }, uId: { value: new THREE.Color(0, 0, 0) }, uIdOn: { value: 0 } },
      vertexShader: 'uniform float uT; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0);\n' +
        '  float ph = fract(sin(dot(floor(w.xz * 0.25), vec2(12.9, 78.2))) * 43758.5) * 6.283; float a = 0.0087 * sin(uT * 0.5 + ph) * w.y;\n' +
        '  w.x += a * 0.7; w.z += a * 0.3; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 uCol; uniform vec3 uId; uniform float uIdOn; varying vec2 vUv; void main(){ float a = texture2D(map, vUv).a;\n' +
        (blend ? '  if (a < 0.02) discard;\n' : '  if (a < 0.5) discard;\n') +
        '  if (uIdOn > 0.5) { if (a < 0.9) discard; gl_FragColor = vec4(uId, 1.0); return; }\n' +
        '  gl_FragColor = vec4(uCol, ' + (blend ? 'a' : '1.0') + ');' + CS });
  }
  const trees = DF ? {} : { near: treeMat(fNear, false), mid: treeMat(fMid, false), far: treeMat(fFar, true) };
  /* round D: one material for a tree's bark and fronds (the vertex colour marks the bark). Linear light: the sun (× this tree's share
     of it, worked out in Blender through the other trees) on the lit side, through the fronds from behind (translucency), the sky
     around (less deep in the crown); then the haze toward the sky behind, and Blender's view. The tips sway (≤ 0.4°); the trunk not:
     the baked shadows on the room stay true. */
  function forestMat(m, F, H, Rr) {
    return new THREE.ShaderMaterial({ toneMapped: false, side: THREE.DoubleSide, vertexColors: true,
      uniforms: { ...U, ...LU, ...SU, atlas: { value: tAtlas }, uTint: { value: new THREE.Color(m.tint) }, uBark0: { value: new THREE.Vector3(...F.bark[0]) }, uBark1: { value: new THREE.Vector3(...F.bark[1]) },
        uSunE: { value: new THREE.Vector3(...info.sun.colour).multiplyScalar(info.sun.energy / Math.PI) }, uTrans: { value: (F.translucency || {})[m.sp] ?? 0.2 }, uCut: { value: F.cut ?? 0.35 },
        uH: { value: H }, uR: { value: Rr }, uSway: { value: 0.007 }, uHaze: { value: info.haze ? info.haze.density : 0.002 }, uIdOn: { value: 0 }, uId: { value: new THREE.Color() }, uTreeK },
      // the sky's light on a tree (its front and back face) and the haze toward the sky behind it vary slowly: they are worked out per
      // vertex, so a frond's pixel (drawn twice, with the water's mirror) only reads its texture, the sun and the view — on an integrated
      // GPU the trees' pixels were half the frame's cost (Task 7)
      vertexShader: 'attribute float aSol; uniform float uT; uniform float uH; uniform float uR; uniform float uSway; uniform float uHaze;\n' + SKY +
        'varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vBark; varying float vSol; varying vec3 vAmbF; varying vec3 vAmbB; varying vec3 vHazeC; varying float vHazeK;\n' +
        'void main(){ vUv = uv; vBark = 1.0 - color.r; vSol = aSol; vec3 p = position; float hf = clamp(p.y / uH, 0.0, 1.0);\n' +
        '  float ao = mix(0.5, 1.0, clamp(length(p.xz) / max(0.3, uR * (1.0 - 0.85 * hf)), 0.0, 1.0)) * mix(0.7, 1.0, hf);   /* deep in the crown and low: less sky */\n' +
        '  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0); float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9, 78.2))) * 43758.5) * 6.283;\n' +
        '  float s = uSway * sin(uT * 0.6 + ph) * hf * hf * hf * p.y * length(instanceMatrix[1].xyz); w.x += s * 0.7; w.z += s * 0.3;\n' +
        '  vW = w.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w;\n' +
        '  vec3 up = 0.5 * skyRad(vec3(0.0, 1.0, 0.0)); vAmbF = (0.5 * skyRad(normalize(vec3(vN.x, max(vN.y, 0.15), vN.z))) + up) * ao;\n' +
        '  vAmbB = (0.5 * skyRad(normalize(vec3(-vN.x, max(-vN.y, 0.15), -vN.z))) + up) * ao;\n' +
        '  vec3 v = vW - cameraPosition; vHazeC = skyRad(normalize(v)); vHazeK = 1.0 - exp(-uHaze * length(v)); }',   /* the haze: far trees melt into the sky behind them */
      fragmentShader: 'uniform sampler2D atlas; uniform vec3 uTint; uniform vec3 uBark0; uniform vec3 uBark1; uniform vec3 uSunE; uniform float uTrans; uniform float uCut; uniform float uIdOn; uniform vec3 uId; uniform vec2 uTreeK; uniform vec3 uSunD;\n' +
        'varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vBark; varying float vSol; varying vec3 vAmbF; varying vec3 vAmbB; varying vec3 vHazeC; varying float vHazeK;\n' + NOISE + VIEW +
        'void main(){ vec3 alb; float t = 0.0;\n' +
        '  if (vBark > 0.5) alb = mix(uBark0, uBark1, fbm(vec2(vW.x + vW.z, vW.y * 0.35) * 3.0));\n' +
        '  else { vec4 a = texture2D(atlas, vUv); if (a.a < uCut) discard; alb = uTint * a.rgb; t = uTrans; }\n' +
        '  if (uIdOn > 0.5) { gl_FragColor = vec4(uId, 1.0); return; }\n' +
        '  vec3 n = normalize(vN), amb = vAmbF; if (!gl_FrontFacing) { n = -n; amb = vAmbB; } float nl = dot(n, uSunD); float dir = (1.0 - t) * max(nl, 0.0) + t * max(-nl, 0.0);\n' +
        '  vec3 lin = alb * (uSunE * dir * vSol * uTreeK.x + amb * uTreeK.y);\n' +
        '  gl_FragColor = vec4(view(mix(lin, vHazeC, vHazeK)), 1.0); }' });
  }
  const bankMat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false,
    uniforms: { ...U, uCol: { value: new THREE.Color() }, uId: { value: new THREE.Color() }, uIdOn: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uT; uniform vec3 uId; uniform float uIdOn; varying vec3 vW;\n' + NOISE +
      'void main(){ float n = fbm(vec2(vW.x * 0.35 + uT * 0.05, uT * 0.03)) - 0.5; float top = 2.2 + n * 1.8;\n' +
      '  float a = 1.0 - smoothstep(top - 1.4, top + 0.6, vW.y + (fbm(vec2(vW.x * 1.3 - uT * 0.08, vW.y * 1.7)) - 0.5) * 0.8);\n' +
      '  a *= smoothstep(11.0, 8.0, abs(vW.x));\n' +
      '  if (uIdOn > 0.5) { if (a < 0.5) discard; gl_FragColor = vec4(uId, 1.0); return; }\n' +
      '  gl_FragColor = vec4(uCol, a);' + CS });
  const posters = [];
  live.scene.traverse(o => {
    if (!o.isMesh) return; const n = o.name;
    if (n.startsWith('SM_Lamp_Spiral') || n.startsWith('SM_Lamp_StrandTips')) o.visible = false;        // drawn as round points instead
    else if (n.startsWith('SM_Lamp')) o.material = lampMat;
    else if (n.startsWith('SM_Halo')) { o.material = haloMat; o.renderOrder = 5; o.userData.noId = true; }
    else if (n.startsWith('SM_Strands')) { o.material = strandMat; o.renderOrder = 5; o.userData.noId = true; }
    else if (n.startsWith('SM_Tree_')) { const ring = n.slice(8).split('_')[0]; o.material = trees[ring]; o.renderOrder = ring === 'far' ? 1 : 0; o.frustumCulled = false; }
    else if (n.startsWith('SM_FogBank')) { o.material = bankMat; o.renderOrder = 3; }
    else if (n.startsWith('SM_Stage_Water')) o.visible = false;                                         // replaced by the mirror below
    else if (n.startsWith('REF_Portal')) posters.push(o);
  });
  posters.sort((a, b) => parseFloat(a.name.replace(/^REF_Portal_?/, '')) - parseFloat(b.name.replace(/^REF_Portal_?/, '')));
  group.add(live.scene);
  const forest = [];                       // round D: one instanced mesh per species × variant × level of detail («near» LOD 0, «far» LOD 1)
  if (DF) {
    const F = info.forest, byName = {}, rows = F.meshes.map(() => []);
    treesGlb.scene.traverse(o => { if (o.isMesh) byName[o.name] = o; });
    F.instances.forEach(r => rows[r[0]].push(r));
    rows.forEach(rw => rw.sort((a, b) => Math.hypot(a[1], a[3]) - Math.hypot(b[1], b[3])));   // near to far: every camera is inside the ring, so the near trees hide the far ones before they are shaded
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3();
    F.meshes.forEach((m, k) => {
      const src = byName[m.name]; if (!src || !rows[k].length) return;
      const g = src.geometry; g.computeBoundingBox(); const bb = g.boundingBox, Rr = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
      const im = new THREE.InstancedMesh(g, forestMat(m, F, Math.max(bb.max.y, 0.5), Rr), rows[k].length);
      im.name = `SM_TreeD_${m.lod ? 'far' : 'near'}_${m.name}`; im.frustumCulled = false; const sol = new Float32Array(rows[k].length);
      rows[k].forEach((r, i) => { P3.set(r[1], r[2], r[3]); q.setFromEuler(e.set(0, r[4], 0)); S3.setScalar(r[5]); M4.compose(P3, q, S3); im.setMatrixAt(i, M4); sol[i] = r[6] ?? 0.5; });
      g.setAttribute('aSol', new THREE.InstancedBufferAttribute(sol, 1)); im.instanceMatrix.needsUpdate = true; im.userData.sp = m.sp; im.userData.H = m.H;
      group.add(im); forest.push(im); tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * rows[k].length;
    });
  }

  /* the water: a planar mirror of everything above it, blurred, rippling, at most half the screen's brightness, dark to the rim */
  const water = new Reflector(new THREE.CircleGeometry(2.95, 72), { textureWidth: 512, textureHeight: 512, clipBias: 0.003,   // round D: 512 (it is blurred; at 1024 the forest drawn twice took the seat under 120 fps)
    shader: { name: 'AnfiWater', uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uT: { value: 0 } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float uT; varying vec4 vUv; varying vec3 vW;\n' + NOISE +
        'void main(){ vec3 v = normalize(cameraPosition - vW); float F = 0.02 + 0.98 * pow(1.0 - max(v.y, 0.0), 5.0);\n' +
        '  vec2 rp = (vec2(fbm(vW.xz * 1.6 + uT * 0.12), fbm(vW.zx * 1.6 - uT * 0.1)) - 0.5) * 0.007; vec2 s = vUv.xy / vUv.w + rp; vec3 c = vec3(0.0);\n' +
        '  for (int i = 0; i < 9; i++) { vec2 o = vec2(float(i - (i / 3) * 3) - 1.0, float(i / 3) - 1.0) * 0.0022; c += texture2D(tDiffuse, s + o).rgb; } c /= 9.0;\n' +
        // the ceiling (decision 8): never above half the screen — a soft knee from 0.08 to 0.15 linear (≈ 31% → 42% on screen)
        '  c *= F; c = mix(c, 0.08 + 0.07 * (1.0 - exp(-(c - 0.08) / 0.07)), step(0.08, c)); float e = smoothstep(0.55, 1.0, length(vW.xz) / 2.95); c *= 1.0 - e * 0.95;\n' +
        '  gl_FragColor = vec4(c, 1.0);' + CS } });
  water.name = 'SM_Stage_Water_R'; water.rotation.x = -Math.PI / 2; water.position.y = 0.306; group.add(water);
  // round D: the forest made the mirror the frame's dearest pass — while the camera stands still it is redrawn every other frame (it is
  // blurred and rippling: at 165 Hz half its rate is not seen), every frame while the camera moves, and never twice in one frame: a
  // frame's further passes (the tests' id pass, with flat colours) reuse the picture its first, ordinary pass made
  // the light amphitheatre (lean(true), the stage's guard on a slow GPU): the mirror leaves the trees out
  let mirrorFrame = 0, mirrorDt = 16.7, mirrorT = null, mirrorLean = false;   // the frame count and the screen's frame interval (ms), from tick()
  { const draw = water.onBeforeRender, last = new THREE.Matrix4(), lastP = new THREE.Matrix4(); let drawnIn = -1;
    water.onBeforeRender = function (renderer, scene, camera, ...rest) {
      const moved = !last.equals(camera.matrixWorld) || !lastP.equals(camera.projectionMatrix); last.copy(camera.matrixWorld); lastP.copy(camera.projectionMatrix);
      if (drawnIn === mirrorFrame || mirrorSkips(moved, mirrorFrame, mirrorDt)) return; drawnIn = mirrorFrame;
      const hid = mirrorLean ? forest.filter(m => m.visible) : []; hid.forEach(m => { m.visible = false; });
      try { draw.call(this, renderer, scene, camera, ...rest); } finally { hid.forEach(m => { m.visible = true; }); } };
  }

  /* the sky (the fog's hue, the moon's glow behind the oculus), and the ground beyond the ring dissolving into the fog */
  const skyMat = DF ? new THREE.ShaderMaterial({ toneMapped: false, side: THREE.BackSide, depthWrite: false, uniforms: { ...U, ...LU, ...SU },   // round D: the world's formula
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vD;\n' + VIEW + SKY + 'void main(){ gl_FragColor = vec4(view(skyRad(normalize(vD))), 1.0); }' })
    : new THREE.ShaderMaterial({ toneMapped: false, side: THREE.BackSide, depthWrite: false,
    uniforms: { ...U, uSky: { value: new THREE.Color() }, uMoon: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // near the horizon the sky melts into the far ground's colour (the fog bank's): no straight line behind the trunks (review of C1b)
    fragmentShader: 'uniform vec3 uSky; uniform vec3 uMoon; uniform vec3 uHor; varying vec3 vD; void main(){ vec3 d = normalize(vD); float m = pow(max(dot(d, normalize(vec3(-0.35, 0.25, -1.0))), 0.0), 10.0);\n' +
      '  gl_FragColor = vec4(mix(uHor, uSky + uMoon * m, smoothstep(-0.02, 0.14, d.y)), 1.0);' + CS });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), skyMat); sky.renderOrder = -1; group.add(sky);
  const groundMat = DF ? new THREE.ShaderMaterial({ toneMapped: false, uniforms: { ...U, ...LU, ...SU, uSunE: { value: new THREE.Vector3(...info.sun.colour).multiplyScalar(info.sun.energy / Math.PI) },
      uAlb: { value: new THREE.Color('#1c1712') }, uHaze: { value: info.haze ? info.haze.density : 0.002 } },   // round D: the forest floor, in the trees' light, into the haze
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uSunE; uniform vec3 uAlb; uniform float uHaze; varying vec3 vW;\n' + NOISE + VIEW + SKY +
      'void main(){ float dap = smoothstep(0.35, 0.75, fbm(vW.xz * 0.12)) * 0.6;   /* the sun through the canopy: patches */\n' +
      '  vec3 lin = uAlb * (0.9 + 0.3 * fbm(vW.xz * 0.8)) * (uSunE * uSunD.y * dap + skyRad(vec3(0.0, 1.0, 0.0)) * 0.6); vec3 v = vW - cameraPosition;\n' +
      '  lin = mix(lin, skyRad(normalize(vec3(v.x, 0.0, v.z))), 1.0 - exp(-uHaze * length(v))); gl_FragColor = vec4(view(lin), 1.0); }' })
    : new THREE.ShaderMaterial({ toneMapped: false, uniforms: { ...U, uNear: { value: fogColour(0.02) }, uFar: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uNear; uniform vec3 uFar; varying vec3 vW; void main(){ gl_FragColor = vec4(mix(uNear, uFar, smoothstep(11.0, 40.0, length(vW.xz))), 1.0);' + CS });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; group.add(ground);
  const lowMat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false, uniforms: { ...U, uCol: { value: new THREE.Color() }, uA: { value: 0.12 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uT; uniform float uA; varying vec3 vW;\n' + NOISE +
      'void main(){ float n = fbm(vW.xz * 0.35 + vec2(uT * 0.06, uT * 0.02)); float a = smoothstep(0.45, 0.8, n) * uA * smoothstep(9.0, 6.0, length(vW.xz)); gl_FragColor = vec4(uCol, a);' + CS });
  for (const y of [0.35, 0.75]) { const m = new THREE.Mesh(new THREE.CircleGeometry(9, 48), lowMat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 4; m.userData.noId = true; group.add(m); }

  /* the screen as Blender shows it: the film as an emission of strength 5 (B2), through the same colour table */
  const screenMat = new THREE.ShaderMaterial({ transparent: true, toneMapped: false,
    uniforms: { map: { value: null }, uOp: { value: 1 }, uEmit: { value: 5 }, uLut: { value: LUT }, uLutR: { value: new THREE.Vector2(info.lut.lo, info.lut.hi) }, uLutS: { value: LUTS } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform float uOp; uniform float uEmit; uniform highp sampler3D uLut; uniform vec2 uLutR; uniform vec2 uLutS; varying vec2 vUv;\n' +
      'void main(){ vec3 lin = texture2D(map, vUv).rgb * uEmit; vec3 t = clamp((log2(max(lin, vec3(1e-7)) / 0.18) - uLutR.x) / (uLutR.y - uLutR.x), 0.0, 1.0);\n' +
      '  gl_FragColor = vec4(texture(uLut, t * uLutS.x + uLutS.y).rgb, uOp); }' });
  function setPosters(textures) { posters.forEach((o, i) => { const t = textures[i % textures.length]; o.material = new THREE.MeshBasicMaterial({ toneMapped: false, map: t, side: THREE.DoubleSide, color: new THREE.Color(0.55, 0.55, 0.55) }); }); }
  function setMix(k) {                                     // 0 «aberto» → 1 «sessão»
    U.uMix.value = k; const L = THREE.MathUtils.lerp;
    if (DF) {                                              // round D: the sun, the sky and the forest are the same in both states — the low mist warm
      lowMat.uniforms.uCol.value.copy(warmColour(mixD('bank'))); uBack.value.copy(BACK_D);
    } else {
      trees.near.uniforms.uCol.value.copy(fogColour(mixD('near'))); trees.mid.uniforms.uCol.value.copy(fogColour(mixD('mid'))); trees.far.uniforms.uCol.value.copy(fogColour(mixD('far')));
      bankMat.uniforms.uCol.value.copy(fogColour(mixD('bank'))); lowMat.uniforms.uCol.value.copy(fogColour(mixD('bank')));
      const sk = mixD('sky'), mo = mixD('moon'); skyMat.uniforms.uSky.value.copy(fogColour(sk)); skyMat.uniforms.uMoon.value.copy(fogColour(Math.max(0, mo - sk)));
      groundMat.uniforms.uFar.value.copy(fogColour(mixD('bank'))); skyMat.uniforms.uHor.value.copy(fogColour(mixD('bank')));
      uBack.value.setScalar(L(BACK.aberto, BACK.sessao, k));
    }
    // on screen: the spiral at 100% / 35%, the fillets at 100% / 40% (as calibrated in B2)
    for (const s of lampSets) s.mat.uniforms.uK.value = L(1.0, 0.62, k); lampMat.uniforms.uK.value = L(0.95, 0.6, k); haloMat.uniforms.uK.value = L(0.22, 0.1, k);
  }
  /* round D (Task 6): the sun's rays in the haze — soft ribbons along the sun's direction, turned to face the camera, added to the
     picture (warm, brighter looking toward the sun, as haze scatters forward), with a slow drift of light along them; and dust floating
     inside the ones in the room. In the forest: 12 between the trunks (seen through the oculus and over the rims). In the room: 5 short
     ones landing on the right side, never across the screen. Reduced motion: they stand still (their clock is the scene's, frozen). */
  const shafts = new THREE.Group(); shafts.name = 'FX_Shafts';
  // never across the screen: a shaft (and its dust) fades out wherever the line of sight, past it, meets the screen (its centre and
  // half-size, kept by the stage each frame) — whatever the view, the film is never veiled
  const uNoScr = { value: new THREE.Vector4(0, 3.9, -4, 0) }, uNoHalf = { value: new THREE.Vector2(4.2, 2.36) };
  const OFFSCR = 'uniform vec4 uNoScr; uniform vec2 uNoHalf;\nfloat offScreen(vec3 w){ vec3 d = w - cameraPosition; if (abs(d.z) < 1e-4) return 1.0; float t = (uNoScr.z - cameraPosition.z) / d.z; if (t < 1.0) return 1.0;\n' +
    '  vec2 h = cameraPosition.xy + d.xy * t - uNoScr.xy; return smoothstep(0.1, 0.5, max(abs(h.x) - uNoHalf.x, abs(h.y) - uNoHalf.y)); }\n';   // gone 10 cm before the edge (a grain's sprite, the edge pixels)
  if (DF) {
    const sd = new THREE.Vector3(...info.sun.dir).normalize(), rnd = (a, b, s) => a + (b - a) * (Math.sin(s * 127.1) * 43758.5453 % 1 + 1) % 1;
    const WARMD = new THREE.Color().setRGB(1.0, 0.78, 0.5, THREE.SRGBColorSpace);
    const shaftMat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { ...U, uCol: { value: WARMD }, uSunD: { value: sd }, uK: { value: 1 }, uNoScr, uNoHalf },
      vertexShader: 'attribute vec3 aA; attribute vec3 aB; attribute vec2 aW; varying vec2 vQ; varying vec3 vW; varying float vSeed;\n' +   // aW: half-width, seed
        'void main(){ vec3 ax = aB - aA; vec3 p = mix(aA, aB, uv.y); vec3 toCam = normalize(cameraPosition - p); vec3 side = normalize(cross(ax, toCam));\n' +
        '  p += side * (uv.x * 2.0 - 1.0) * aW.x; vQ = uv; vW = p; vSeed = aW.y; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform vec3 uSunD; uniform float uT; uniform float uK; varying vec2 vQ; varying vec3 vW; varying float vSeed;\n' + NOISE + OFFSCR +
        'void main(){ float across = exp(-pow((vQ.x - 0.5) / 0.22, 2.0)); float along = smoothstep(0.0, 0.25, vQ.y) * smoothstep(1.0, 0.6, vQ.y);\n' +
        '  float drift = 0.65 + 0.35 * fbm(vec2(vQ.y * 6.0 - uT * 0.08 + vSeed, vQ.x * 2.0 + vSeed));\n' +
        '  vec3 v = normalize(vW - cameraPosition); float fwd = 0.35 + 0.65 * pow(max(dot(v, uSunD), 0.0), 3.0);   /* toward the sun, the haze lights up */\n' +
        '  gl_FragColor = vec4(uCol * across * along * drift * fwd * uK * offScreen(vW), 1.0); }' });
    const beams = [];
    for (let i = 0; i < 12; i++) {                         // the forest: from 26 m up, along the light, down to the floor, between r 15 and 40 m
      const th = rnd(-150, 150, i + 1) * Math.PI / 180, r = rnd(15, 40, i + 7), x = r * Math.sin(th), z = -r * Math.cos(th), B_ = new THREE.Vector3(x, 0, z);
      beams.push([B_.clone().addScaledVector(sd, 26 / sd.y), B_, rnd(0.8, 2.2, i + 3), 0.16 + rnd(0, 0.1, i + 11)]);
    }
    for (let i = 0; i < 5; i++) {                          // the room: short ones landing on the right side (x ≈ 6–8.5 m, z −5 … +2), up toward the sun
      const B_ = new THREE.Vector3(rnd(6.0, 8.5, i + 21), rnd(1.6, 4.5, i + 31), rnd(-5.0, 2.0, i + 41));
      beams.push([B_.clone().addScaledVector(sd, rnd(5, 8, i + 51)), B_, rnd(0.5, 1.1, i + 61), 0.12]);
    }
    const n = beams.length, pos = new Float32Array(n * 4 * 3), uvs = new Float32Array(n * 4 * 2), aA = new Float32Array(n * 4 * 3), aB = new Float32Array(n * 4 * 3), aW = new Float32Array(n * 4 * 2), idx = [];
    beams.forEach(([a, b, w, k], i) => {
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], c) => { const j = i * 4 + c; uvs.set([u, v], j * 2); aA.set([a.x, a.y, a.z], j * 3); aB.set([b.x, b.y, b.z], j * 3); aW.set([w, i * 1.7], j * 2); pos.set([b.x, b.y, b.z], j * 3); });
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('aA', new THREE.BufferAttribute(aA, 3)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 3)); g.setAttribute('aW', new THREE.BufferAttribute(aW, 2)); g.setIndex(idx);
    const sm = new THREE.Mesh(g, shaftMat); sm.name = 'FX_Shafts_m'; sm.frustumCulled = false; sm.renderOrder = 6; sm.userData.noId = true; shafts.add(sm);
    shaftMat.uniforms.uK.value = 0.10;                     // one strength for all: the d1 renders show the rays faintly (25 Nov: 0.16 brightened the oculus)
    // the dust: in the room's beams only, a slow loop round where it was born (so it never leaves the light)
    const N = 420, dp = new Float32Array(N * 3), dph = new Float32Array(N);
    for (let i = 0; i < N; i++) { const [a, b, w] = beams[12 + (i % 5)], t = rnd(0.1, 0.9, i + 101), q = a.clone().lerp(b, t);
      q.x += rnd(-w, w, i + 201) * 0.6; q.y += rnd(-w, w, i + 301) * 0.6; q.z += rnd(-w, w, i + 401) * 0.6; dp.set([q.x, q.y, q.z], i * 3); dph[i] = rnd(0, 6.283, i + 501); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aPh', new THREE.BufferAttribute(dph, 1));
    const dustMat = new THREE.ShaderMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uCol: { value: WARMD }, uVH: { value: 900 }, uNoScr, uNoHalf },
      vertexShader: 'attribute float aPh; uniform float uT; uniform float uVH; varying float vA; varying vec3 vP;\n' +
        'void main(){ vec3 p = position + vec3(sin(uT * 0.13 + aPh) * 0.25, sin(uT * 0.09 + aPh * 1.3) * 0.18 + 0.1 * sin(uT * 0.05 + aPh), cos(uT * 0.11 + aPh) * 0.25);\n' +
        '  vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = clamp(0.012 * projectionMatrix[1][1] * uVH * 0.5 / -mv.z, 1.0, 3.0); vA = 0.5 + 0.5 * sin(uT * 0.7 + aPh * 2.0); vP = p; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vA; varying vec3 vP;\n' + OFFSCR +
        'void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(uCol * (0.25 + 0.35 * vA) * (1.0 - 2.0 * r) * offScreen(vP), 1.0); }' });
    const dust = new THREE.Points(dg, dustMat); dust.name = 'FX_Dust'; dust.frustumCulled = false; dust.renderOrder = 6; shafts.add(dust);
    shafts.userData = { shaftMat, dustMat }; group.add(shafts);
  }
  const BACK_D = new THREE.Vector3(0.30, 0.20, 0.13);   // round D: the wave's outer top, in the low sun (linear light; matched to the d1 renders in Task 7)
  function warmColour(d) {                               // a display value in the sunset haze's hue (sunset_d SKY.far), as fogColour does for the night
    const s = new THREE.Color('#b9a493').convertLinearToSRGB(), Ls = 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b, kk = d / Ls;
    return new THREE.Color().setRGB(Math.min(1, s.r * kk), Math.min(1, s.g * kk), Math.min(1, s.b * kk), THREE.SRGBColorSpace);
  }
  const BACK = { aberto: 0.35, sessao: 0.1 };   // matched to the top of the wave in the B2 render (chegada «aberto»: 30, 23, 22)
  setMix(1);
  live.scene.traverse(o => { if (o.isMesh && o.visible) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return {
    group, info, loadMs: Math.round(performance.now() - t0), triangles: Math.round(tris),
    setMix, get mix() { return U.uMix.value; }, U,
    setFilm(rgb) { U.uFilm.value.set(rgb[0], rgb[1], rgb[2]); },          // already × k (0.6)
    setScreen(rgb) { U.uScr.value.set(rgb[0], rgb[1], rgb[2]); },        // the film's radiance (linear mean × emission), for its gloss
    setNoScreen(c, hw, hh) { uNoScr.value.set(c.x, c.y, c.z, 0); uNoHalf.value.set(hw, hh); },
    mirrorTarget() { return water.getRenderTarget(); },
    lean(on) { mirrorLean = !!on; },   // the stage's warm-up compiles every material for it too (its variants are linear)
    setViewport(h, pr) { for (const s of lampSets) { s.mat.uniforms.uVH.value = h; s.mat.uniforms.uPR.value = pr; } if (shafts.userData.dustMat) shafts.userData.dustMat.uniforms.uVH.value = h * pr; },
    corePx, lampSets,
    // the strands and their tips light up for a work coming on (0 → 1 → 0 over 600 ms): 8% → 40% (decision of C2)
    setStrandFlash(k) { strandMat.color.copy(STRAND).multiplyScalar(1 + 4 * k); tips.mat.uniforms.uFlash.value = 1.5 * k; },
    // reduced motion: the fog and the water stand still (their own clock stops)
    freeze(on) { frozen = on; },
    // the hats keep their real-time light, but leave through Blender's view too (three.js's AgX is not «AgX + Base Contrast»)
    // the hats (review of C1b: things one clicks, so they must read in both states, whatever the film): drawn at screen values, out
    // of the colour table — the Brand Kit colour × a shading (a neutral key from the screen's side, a fill from the seats) × one
    // exposure per hat that puts its median near 20%. Scaling a colour keeps its hue and its saturation, so pink stays pink.
    hatMaterial(shellHex) {
      const r = (shellHex >> 16 & 255) / 255, g = (shellHex >> 8 & 255) / 255, b = (shellHex & 255) / 255, Ld = 0.2126 * r + 0.7152 * g + 0.0722 * b;   // the brand colour's luminance on screen (sRGB values)
      return new THREE.ShaderMaterial({ vertexColors: true, toneMapped: false,
        uniforms: { uExpo: { value: 0.17 / (0.72 * Ld) }, uOn: { value: 0 }, uKey: { value: new THREE.Vector3(0, 0.55, -1).normalize() }, uFill: { value: new THREE.Vector3(-0.3, 0.35, 1).normalize() } },
        vertexShader: 'varying vec3 vC; varying vec3 vN; void main(){ vC = color; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uExpo; uniform float uOn; uniform vec3 uKey; uniform vec3 uFill; varying vec3 vC; varying vec3 vN;\n' +
          'void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; vec3 s = pow(max(vC, vec3(0.0)), vec3(1.0 / 2.2));\n' +
          '  float sh = min(1.0, 0.42 + 0.48 * max(dot(n, uKey), 0.0) + 0.3 * max(dot(n, uFill), 0.0));\n' +
          '  gl_FragColor = vec4(min(s * sh * uExpo * (1.0 + 0.3 * uOn), vec3(1.0)), 1.0); }' });
    },
    setPosters, posters, sprites: spiral.points, spriteMat: spiral.mat, tips, screenMat, sky, ground, trees, bankMat, water, lowMat,
    // round D: the 3D forest (its instanced meshes) and the sun layer's strength
    DF, forest, shafts, setSunK(k) { uSunK.value = k; },
    // round D's knobs (Task 7, matching the site to the approved renders): the sun layer on the room, the trees' sun and sky, the rays, the wave's top
    tune(o = {}) { if (o.sunK != null) uSunK.value = o.sunK; if (o.treeSun != null) uTreeK.value.x = o.treeSun; if (o.treeAmb != null) uTreeK.value.y = o.treeAmb;
      if (o.shaftK != null && shafts.userData.shaftMat) shafts.userData.shaftMat.uniforms.uK.value = o.shaftK; if (o.back) BACK_D.set(...o.back); setMix(U.uMix.value);
      return { sunK: uSunK.value, treeSun: uTreeK.value.x, treeAmb: uTreeK.value.y, shaftK: shafts.userData.shaftMat ? shafts.userData.shaftMat.uniforms.uK.value : null, back: BACK_D.toArray() }; },
    forestPositions() { const out = [], m = new THREE.Matrix4(), p = new THREE.Vector3(); for (const im of forest) for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push({ x: p.x, y: p.y, z: p.z, H: im.userData.H * new THREE.Vector3().setFromMatrixScale(m).y, sp: im.userData.sp }); } return out; },
    // tests (criterion 4): the fastest sway on screen, px/s, as the vertex shader moves it — a point at height h of a tree H high (world)
    // shifts by 0.007·(h/H)³·h along (0.7, 0, 0.3), at 0.6 rad/s; each tree sampled every tenth of its height, only what is in the frame
    forestSwayPx(camera, W, H = W) { const m = new THREE.Matrix4(), mi = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), sc = new THREE.Vector3(); let mx = 0;
      for (const im of forest) { if (!im.visible) continue; im.updateWorldMatrix(true, false); const Hl = im.userData.H;
        for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mi); const s = sc.setFromMatrixColumn(mi, 1).length(); m.multiplyMatrices(im.matrixWorld, mi);
          for (let k = 1; k <= 10; k++) { const hf = k / 10, amp = 0.007 * hf * hf * hf * hf * Hl * s; a.set(0, hf * Hl, 0).applyMatrix4(m); b.set(a.x + 0.7 * amp, a.y, a.z + 0.3 * amp);
            a.project(camera); b.project(camera); if (a.z > 1 || a.z < -1 || Math.abs(a.x) > 1 || Math.abs(a.y) > 1) continue;
            mx = Math.max(mx, 0.6 * Math.hypot((b.x - a.x) * W / 2, (b.y - a.y) * H / 2)); } } }
      return mx; },
    // the mirror's count and the screen's frame interval run frozen too (the film still changes); the interval follows the shortest
    // frames (a slow one barely moves it), so a 165 Hz screen keeps its half-rate mirror when a frame runs long
    tick(t) { mirrorFrame++; if (mirrorT != null) { const d = (t - mirrorT) * 1000; if (d > 0) mirrorDt = d < mirrorDt ? d : mirrorDt + (d - mirrorDt) * 0.01; } mirrorT = t;
      if (frozen) return; U.uT.value = t; water.material.uniforms.uT.value = t; }
  };
}
