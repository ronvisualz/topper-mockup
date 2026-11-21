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

let once = null;
export function loadAnfi() { return once || (once = loadNow()); }
async function loadNow() {
  const t0 = performance.now();
  const [stat, live, info, sA, sB, sT, rA, rB, rT, LUT, tWood, tBench, tStone, tBlack, fNear, fMid, fFar] = await Promise.all([
    glb('anfi-static.glb'), glb('anfi-live.glb'), fetch(DIR + 'anfi.json').then(r => r.json()),
    tex('lm-casca-aberto.png'), tex('lm-casca-sessao.png'), tex('lm-casca-tela.png'), tex('lm-resto-aberto.png'), tex('lm-resto-sessao.png'), tex('lm-resto-tela.png'),
    lut('lut-agx.png'),
    tex('tile-wood.jpg', true, true), tex('tile-bench.jpg', true, true), tex('tile-stone.jpg', true, true), tex('tile-stone-black.jpg', true, true),
    tex('forest-near.png', true), tex('forest-mid.png', true), tex('forest-far.png', true)]);
  const group = new THREE.Group(); group.name = 'anfi';
  const LUTS = new THREE.Vector2((LUT.image.width - 1) / LUT.image.width, 0.5 / LUT.image.width);   // sample texel centres
  const U = { uMix: { value: 1 }, uFilm: { value: new THREE.Vector3() }, uScr: { value: new THREE.Vector3() }, uT: { value: 0 } };   // shared by every material
  const D = info.display, mixD = k => THREE.MathUtils.lerp(D.aberto[k], D.sessao[k], U.uMix.value);
  const R = k => new THREE.Vector2(info.lmax[k][0], info.lmax[k][1]);

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
      uniforms: { ...U, lmA: { value: shell ? sA : rA }, lmB: { value: shell ? sB : rB }, lmT: { value: shell ? sT : rT },
        uRA: { value: R(w + '-aberto') }, uRB: { value: R(w + '-sessao') }, uRT: { value: R(w + '-tela') },
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
        'void main(){ vec3 L = mix(dec(lmA, uRA, 0.0), dec(lmB, uRB, 1.7), uMix) + dec(lmT, uRT, 3.1) * uFilm;\n' +
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
  const trees = { near: treeMat(fNear, false), mid: treeMat(fMid, false), far: treeMat(fFar, true) };
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

  /* the water: a planar mirror of everything above it, blurred, rippling, at most half the screen's brightness, dark to the rim */
  const water = new Reflector(new THREE.CircleGeometry(2.95, 72), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003,
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

  /* the sky (the fog's hue, the moon's glow behind the oculus), and the ground beyond the ring dissolving into the fog */
  const skyMat = new THREE.ShaderMaterial({ toneMapped: false, side: THREE.BackSide, depthWrite: false,
    uniforms: { ...U, uSky: { value: new THREE.Color() }, uMoon: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // near the horizon the sky melts into the far ground's colour (the fog bank's): no straight line behind the trunks (review of C1b)
    fragmentShader: 'uniform vec3 uSky; uniform vec3 uMoon; uniform vec3 uHor; varying vec3 vD; void main(){ vec3 d = normalize(vD); float m = pow(max(dot(d, normalize(vec3(-0.35, 0.25, -1.0))), 0.0), 10.0);\n' +
      '  gl_FragColor = vec4(mix(uHor, uSky + uMoon * m, smoothstep(-0.02, 0.14, d.y)), 1.0);' + CS });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), skyMat); sky.renderOrder = -1; group.add(sky);
  const groundMat = new THREE.ShaderMaterial({ toneMapped: false, uniforms: { ...U, uNear: { value: fogColour(0.02) }, uFar: { value: new THREE.Color() } },
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
    U.uMix.value = k;
    trees.near.uniforms.uCol.value.copy(fogColour(mixD('near'))); trees.mid.uniforms.uCol.value.copy(fogColour(mixD('mid'))); trees.far.uniforms.uCol.value.copy(fogColour(mixD('far')));
    bankMat.uniforms.uCol.value.copy(fogColour(mixD('bank'))); lowMat.uniforms.uCol.value.copy(fogColour(mixD('bank')));
    const sk = mixD('sky'), mo = mixD('moon'); skyMat.uniforms.uSky.value.copy(fogColour(sk)); skyMat.uniforms.uMoon.value.copy(fogColour(Math.max(0, mo - sk)));
    groundMat.uniforms.uFar.value.copy(fogColour(mixD('bank')));
    const L = THREE.MathUtils.lerp;   // on screen: the spiral at 100% / 35%, the fillets at 100% / 40% (as calibrated in B2)
    for (const s of lampSets) s.mat.uniforms.uK.value = L(1.0, 0.62, k); skyMat.uniforms.uHor.value.copy(fogColour(mixD('bank'))); lampMat.uniforms.uK.value = L(0.95, 0.6, k); haloMat.uniforms.uK.value = L(0.22, 0.1, k);
    uBack.value.setScalar(L(BACK.aberto, BACK.sessao, k));
  }
  const BACK = { aberto: 0.35, sessao: 0.1 };   // matched to the top of the wave in the B2 render (chegada «aberto»: 30, 23, 22)
  setMix(1);
  live.scene.traverse(o => { if (o.isMesh && o.visible) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return {
    group, info, loadMs: Math.round(performance.now() - t0), triangles: Math.round(tris),
    setMix, get mix() { return U.uMix.value; }, U,
    setFilm(rgb) { U.uFilm.value.set(rgb[0], rgb[1], rgb[2]); },          // already × k (0.6)
    setScreen(rgb) { U.uScr.value.set(rgb[0], rgb[1], rgb[2]); },        // the film's radiance (linear mean × emission), for its gloss
    setViewport(h, pr) { for (const s of lampSets) { s.mat.uniforms.uVH.value = h; s.mat.uniforms.uPR.value = pr; } },
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
    tick(t) { if (frozen) return; U.uT.value = t; water.material.uniforms.uT.value = t; }
  };
}
