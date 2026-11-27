/* topper. mockup v6 — round E (E-DESIGN «a física do lenço»): the red silk as real cloth, simulated in the page — no file, a little
   different every time, as a real trick. Position-based Verlet on a grid of particles: structural, shear and bend links, gravity, the air's
   drag on every triangle (what makes the folds), a light wind with noise, and an invisible hand holding one short edge. While the hand
   holds it, long-range tethers keep the cloth from stretching under its own weight. Units are the cloth's own (it is w wide, ~a hand's
   silk); the page scales it. Tested in Node by mockup/tools/test-silkcloth.mjs. */

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createCloth({ nx = 32, ny = 20, w = 1, h = 0.62, seed = 1, gravity = 9.8, drag = 12, damping = 0.996, iters = 8, inelastic = 0 } = {}) {
  const N = nx * ny, pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), acc = new Float32Array(N * 3), invm = new Float32Array(N).fill(1);
  const dx = w / (nx - 1), dy = h / (ny - 1), rnd = mulberry32(seed), phase = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  // links: structural (stiff), shear, bend (soft: silk folds easily)
  const L = [];
  const link = (i1, j1, i2, j2, s) => L.push(j1 * nx + i1, j2 * nx + i2, Math.hypot((i2 - i1) * dx, (j2 - j1) * dy), s);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i < nx - 1) link(i, j, i + 1, j, 1); if (j < ny - 1) link(i, j, i, j + 1, 1);
    if (i < nx - 1 && j < ny - 1) { link(i, j, i + 1, j + 1, 0.7); link(i + 1, j, i, j + 1, 0.7); }
    if (i < nx - 2) link(i, j, i + 2, j, 0.15); if (j < ny - 2) link(i, j, i, j + 2, 0.15);
  }
  // solved nearest-to-the-hand first: the whole weight hangs from the held corner, and a Gauss–Seidel sweep that starts there carries
  // each correction outward in one pass (in grid order the links by the hand stretched by a third)
  const near = v => Math.hypot(v % nx * dx, Math.floor(v / nx) * dy), order = [];
  for (let k = 0; k < L.length / 4; k++) order.push(k);
  order.sort((p, q) => Math.min(near(L[p * 4]), near(L[p * 4 + 1])) - Math.min(near(L[q * 4]), near(L[q * 4 + 1])));
  const LA = new Int32Array(order.length), LB = new Int32Array(order.length), LR = new Float32Array(order.length), LS = new Float32Array(order.length);
  order.forEach((k, m) => { LA[m] = L[k * 4]; LB[m] = L[k * 4 + 1]; LR[m] = L[k * 4 + 2]; LS[m] = L[k * 4 + 3]; });
  // tethers: each particle no further from the held corner than at rest (long-range attachments: the cloth cannot stretch away from the
  // hand under its own weight). The hand holds one point, the corner, as a real hand does: held by two points side by side, the corner
  // could not turn to hang along the diagonal, and the links there stretched by a sixth whatever the iterations
  // round E (Task 5): a second hand for the other top corner B (nx − 1, 0) — a magician shows a silk held by its two top corners — with
  // tethers of its own while it holds
  const B = nx - 1, teth0 = new Float32Array(N), tethB = new Float32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { teth0[j * nx + i] = Math.hypot(i * dx, j * dy); tethB[j * nx + i] = Math.hypot((B - i) * dx, j * dy); }
  let held = false, held2 = false, hand = [0, 0, 0], hand2 = [0, 0, 0], t = 0;
  const VMAX = 20 * w;   // units per second

  // hanging from the hand (pose 'hang', in the x–y plane), lying flat at its height ('flat'), or hanging folded like a fan ('pleat': eight
  // pleats of four columns each, turned 77° to the cloth, so the structural and shear links keep their rest length; only the soft bend
  // links at the eight folds start short, and the cloth opens by itself as it is pulled — the silk out of the hat. One fold per column trapped a link 23 % long)
  function reset(at, pose = 'hang') {
    const ca = Math.cos(1.35), sa = Math.sin(1.35);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3, jit = (rnd() - 0.5) * 1e-3;
      if (pose === 'pleat') { const q = i % 8, tri = q <= 4 ? q : 8 - q; pos[k] = at[0] + i * dx * ca; pos[k + 1] = at[1] - j * dy; pos[k + 2] = at[2] + tri * dx * sa + jit * 0.01; continue; }   // a far smaller jitter: 1 mm was 3 % of a column
      pos[k] = at[0] + i * dx; pos[k + 1] = pose === 'flat' ? at[1] + jit : at[1] - j * dy; pos[k + 2] = pose === 'flat' ? at[2] + j * dy : at[2] + jit;
    }
    prev.set(pos); hand = at.slice(); t = 0; held2 = false; invm[B] = 1;
  }
  function attach() { held = true; invm[0] = 0; }
  function release() { held = false; invm[0] = 1; }
  function attach2(at) { held2 = true; invm[B] = 0; hand2 = at ? at.slice() : [pos[B * 3], pos[B * 3 + 1], pos[B * 3 + 2]]; }   // none given: where the corner is now
  function release2() { held2 = false; invm[B] = 1; }
  function holdAt(p, v = 0) { const k = v * 3; pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2]; prev[k] = p[0]; prev[k + 1] = p[1]; prev[k + 2] = p[2]; }
  // every particle no further from the held corner a than at rest; with both hands holding, each column only to its nearer corner (i0…i1):
  // tied to both, the top row could only lie exactly on the line between the hands, the two projections took turns without settling, and
  // a link there stayed 40 % long
  function tether(a, T, i0 = 0, i1 = nx - 1) {
    const A = a * 3;
    for (let v = 0; v < N; v++) { const i = v % nx; if (v === a || invm[v] === 0 || i < i0 || i > i1) continue;   // never a corner a hand holds
      const k = v * 3, ex = pos[k] - pos[A], ey = pos[k + 1] - pos[A + 1], ez = pos[k + 2] - pos[A + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez), r = T[v];
      if (d > r && d > 1e-9) { const s = r / d, cx = pos[A] + ex * s - pos[k], cy = pos[A + 1] + ey * s - pos[k + 1], cz = pos[A + 2] + ez * s - pos[k + 2];
        pos[k] += cx; pos[k + 1] += cy; pos[k + 2] += cz;
        // round E: the pull of a tether is a rope's, not a spring's — the correction does not turn into speed (prev moves with it, by
        // «inelastic»): a hand rising fast snapped the far corner up past itself like a whip, and the silk took a second to fall back
        prev[k] += cx * inelastic; prev[k + 1] += cy * inelastic; prev[k + 2] += cz * inelastic; } }
  }

  function substep(hs, wind) {
    acc.fill(0);
    for (let v = 0; v < N; v++) acc[v * 3 + 1] = -gravity;
    // the air on every triangle: −C (v·n̂)|v| n̂, v the triangle's velocity against the wind — shared by its three corners
    const inv = 1 / hs;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const q = j * nx + i;
      for (let half = 0; half < 2; half++) {
        const A = (half ? q + 1 : q) * 3, B = (half ? q + nx + 1 : q + 1) * 3, C = (q + nx) * 3;
        const ex = pos[B] - pos[A], ey = pos[B + 1] - pos[A + 1], ez = pos[B + 2] - pos[A + 2], fx = pos[C] - pos[A], fy = pos[C + 1] - pos[A + 1], fz = pos[C + 2] - pos[A + 2];
        let nx_ = ey * fz - ez * fy, ny_ = ez * fx - ex * fz, nz_ = ex * fy - ey * fx; const nl = Math.sqrt(nx_ * nx_ + ny_ * ny_ + nz_ * nz_); if (nl < 1e-12) continue; nx_ /= nl; ny_ /= nl; nz_ /= nl;
        const vx = ((pos[A] - prev[A]) + (pos[B] - prev[B]) + (pos[C] - prev[C])) * inv / 3 - wind[0];
        const vy = ((pos[A + 1] - prev[A + 1]) + (pos[B + 1] - prev[B + 1]) + (pos[C + 1] - prev[C + 1])) * inv / 3 - wind[1];
        const vz = ((pos[A + 2] - prev[A + 2]) + (pos[B + 2] - prev[B + 2]) + (pos[C + 2] - prev[C + 2])) * inv / 3 - wind[2];
        // ÷ 2: each square is two triangles. The air can stop the motion across the cloth, never turn it back: at speed, quadratic drag
        // stepped explicitly overshot, the cloth flew apart and never settled (the hand's jump after a hidden tab)
        const vn = vx * nx_ + vy * ny_ + vz * nz_, sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
        let f = -drag * vn * sp / 2; const lim = Math.abs(vn) * inv / 2; if (f > lim) f = lim; else if (f < -lim) f = -lim;
        const gx = f * nx_, gy = f * ny_, gz = f * nz_;
        acc[A] += gx; acc[A + 1] += gy; acc[A + 2] += gz; acc[B] += gx; acc[B + 1] += gy; acc[B + 2] += gz; acc[C] += gx; acc[C + 1] += gy; acc[C + 2] += gz;
      }
    }
    // Verlet, each particle's speed capped at VMAX (a yank by the hand cannot fling it to infinity)
    const h2 = hs * hs, cap = VMAX * hs;
    for (let v = 0; v < N; v++) {
      if (invm[v] === 0) continue; const k = v * 3;
      let ux = pos[k] - prev[k], uy = pos[k + 1] - prev[k + 1], uz = pos[k + 2] - prev[k + 2]; const um = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (um > cap) { const q = cap / um; prev[k] = pos[k] - ux * q; prev[k + 1] = pos[k + 1] - uy * q; prev[k + 2] = pos[k + 2] - uz * q; }
      const x0 = pos[k], x1 = pos[k + 1], x2 = pos[k + 2];
      pos[k] = x0 + (x0 - prev[k]) * damping + acc[k] * h2; pos[k + 1] = x1 + (x1 - prev[k + 1]) * damping + acc[k + 1] * h2; pos[k + 2] = x2 + (x2 - prev[k + 2]) * damping + acc[k + 2] * h2;
      prev[k] = x0; prev[k + 1] = x1; prev[k + 2] = x2;
    }
    if (held) holdAt(hand); if (held2) holdAt(hand2, B);
    // links, then the tethers of each corner a hand holds
    const mid = held && held2 ? (nx - 1) >> 1 : -1;
    for (let it = 0; it < iters; it++) { solve(LA.length); if (held) tether(0, teth0, 0, mid < 0 ? nx - 1 : mid); if (held2) tether(B, tethB, mid < 0 ? 0 : mid + 1, nx - 1); }
  }

  function solve(n) {
    for (let k = 0; k < n; k++) {
      const a = LA[k], b = LB[k], wa = invm[a], wb = invm[b], ws = wa + wb; if (ws === 0) continue;
      const A = a * 3, B = b * 3, ex = pos[B] - pos[A], ey = pos[B + 1] - pos[A + 1], ez = pos[B + 2] - pos[A + 2], len = Math.sqrt(ex * ex + ey * ey + ez * ez); if (len < 1e-9) continue;
      const c = LS[k] * (len - LR[k]) / (len * ws);
      pos[A] += ex * c * wa; pos[A + 1] += ey * c * wa; pos[A + 2] += ez * c * wa; pos[B] -= ex * c * wb; pos[B + 1] -= ey * c * wb; pos[B + 2] -= ez * c * wb;
    }
  }
  // dt is capped at 1/20 s (a hidden tab comes back with seconds): fixed 1/120 s steps inside; the hand glides across them
  function step(dt, at, wind = [0, 0, 0], at2 = null) {   // at2: where the second hand is now (round E)
    dt = Math.min(Math.max(dt, 0), 1 / 20); const n = Math.max(1, Math.round(dt * 120)), hs = dt / n, from = hand.slice(), from2 = hand2.slice();
    for (let s = 0; s < n; s++) {
      t += hs;
      if (at) { const k = (s + 1) / n; hand = [from[0] + (at[0] - from[0]) * k, from[1] + (at[1] - from[1]) * k, from[2] + (at[2] - from[2]) * k]; }
      if (at2) { const k = (s + 1) / n; hand2 = [from2[0] + (at2[0] - from2[0]) * k, from2[1] + (at2[1] - from2[1]) * k, from2[2] + (at2[2] - from2[2]) * k]; }
      const g = 1 + 0.35 * Math.sin(t * 1.7 + phase[0]) * Math.sin(t * 0.9 + phase[1]);   // gusts
      substep(hs, [wind[0] * g, wind[1] * g + 0.05 * Math.sin(t * 2.3 + phase[2]) * (wind[0] || wind[2] ? 1 : 0), wind[2] * g]);
    }
  }

  // per-vertex normals (the triangles' areas weigh them)
  function normals(out) {
    out.fill(0);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const q = j * nx + i;
      for (let half = 0; half < 2; half++) {
        const A = (half ? q + 1 : q) * 3, B = (half ? q + nx + 1 : q + 1) * 3, C = (q + nx) * 3, ex = pos[B] - pos[A], ey = pos[B + 1] - pos[A + 1], ez = pos[B + 2] - pos[A + 2], fx = pos[C] - pos[A], fy = pos[C + 1] - pos[A + 1], fz = pos[C + 2] - pos[A + 2];
        const x = ey * fz - ez * fy, y = ez * fx - ex * fz, z = ex * fy - ey * fx;
        out[A] += x; out[A + 1] += y; out[A + 2] += z; out[B] += x; out[B + 1] += y; out[B + 2] += z; out[C] += x; out[C + 1] += y; out[C + 2] += z;
      }
    }
    for (let k = 0; k < out.length; k += 3) { const l = Math.sqrt(out[k] * out[k] + out[k + 1] * out[k + 1] + out[k + 2] * out[k + 2]) || 1; out[k] /= l; out[k + 1] /= l; out[k + 2] /= l; }
    return out;
  }
  return { pos, nx, ny, w, h, step, normals, attach, release, attach2, release2, reset, get held() { return held; }, get held2() { return held2; } };
}

// E2 (the creative chat's point 5c): a smooth surface over the particles — a uniform cubic B-spline, rows then columns, k points per span,
// the ends extrapolated (2P0 − P1) so the cloth's edges and corners stay where they are; the silk is drawn from it, so its outline has no
// steps (a ruling: Catmull–Rom, through the particles, only took the pleats' creases from 70° to 42°; the B-spline to ~23°, a third).
// out: (k(nx−1)+1) × (k(ny−1)+1) points, xyz
let sgTmp = null;
const B0 = t => (1 - t) ** 3 / 6, B1 = t => (3 * t * t * t - 6 * t * t + 4) / 6, B2 = t => (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6, B3 = t => t * t * t / 6;
// the taps of one direction, worked out once: for each drawn point, up to 4 source indices and their weights (the extrapolated ends folded in)
const tapsCache = new Map();
function taps(n, k) {
  const key = n + ':' + k; if (tapsCache.has(key)) return tapsCache.get(key);
  const N = k * (n - 1) + 1, I = new Int32Array(N * 4), Wt = new Float32Array(N * 4);
  for (let o = 0; o < N; o++) {
    const i = Math.min(n - 2, Math.floor(o / k)), t = (o - i * k) / k, w = [B0(t), B1(t), B2(t), B3(t)], acc = new Map(), add = (q, v) => acc.set(q, (acc.get(q) || 0) + v);
    [i - 1, i, i + 1, i + 2].forEach((q, m) => { if (q < 0) { add(0, 2 * w[m]); add(1, -w[m]); } else if (q >= n) { add(n - 1, 2 * w[m]); add(n - 2, -w[m]); } else add(q, w[m]); });
    let m = 0; for (const [q, v] of acc) { I[o * 4 + m] = q; Wt[o * 4 + m] = v; m++; }
  }
  const r = { N, I, Wt }; tapsCache.set(key, r); return r;
}
export function smoothGrid(pos, nx, ny, k = 3, out = null) {
  const cx = taps(nx, k), cy = taps(ny, k), NX = cx.N, NY = cy.N; out = out || new Float32Array(NX * NY * 3);
  if (!sgTmp || sgTmp.length !== NX * ny * 3) sgTmp = new Float32Array(NX * ny * 3);
  const T = sgTmp, XI = cx.I, XW = cx.Wt, YI = cy.I, YW = cy.Wt;
  for (let j = 0; j < ny; j++) for (let x = 0; x < NX; x++) { let X = 0, Y = 0, Z = 0; const b = x * 4;
    for (let m = 0; m < 4; m++) { const w = XW[b + m]; if (w === 0) continue; const q = (j * nx + XI[b + m]) * 3; X += w * pos[q]; Y += w * pos[q + 1]; Z += w * pos[q + 2]; }
    const o = (j * NX + x) * 3; T[o] = X; T[o + 1] = Y; T[o + 2] = Z; }
  for (let y = 0; y < NY; y++) { const b = y * 4; for (let x = 0; x < NX; x++) { let X = 0, Y = 0, Z = 0;
    for (let m = 0; m < 4; m++) { const w = YW[b + m]; if (w === 0) continue; const q = (YI[b + m] * NX + x) * 3; X += w * T[q]; Y += w * T[q + 1]; Z += w * T[q + 2]; }
    const o = (y * NX + x) * 3; out[o] = X; out[o + 1] = Y; out[o + 2] = Z; } }
  return out;
}
// E2: per-vertex normals of any nx × ny grid of points (xyz), as the cloth's own (the triangles' areas weigh them, the same winding)
export function gridNormals(pos, nx, ny, out) {
  out.fill(0);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const q = j * nx + i;
    for (let half = 0; half < 2; half++) {
      const A = (half ? q + 1 : q) * 3, B = (half ? q + nx + 1 : q + 1) * 3, C = (q + nx) * 3, ex = pos[B] - pos[A], ey = pos[B + 1] - pos[A + 1], ez = pos[B + 2] - pos[A + 2], fx = pos[C] - pos[A], fy = pos[C + 1] - pos[A + 1], fz = pos[C + 2] - pos[A + 2];
      const x = ey * fz - ez * fy, y = ez * fx - ex * fz, z = ex * fy - ey * fx;
      out[A] += x; out[A + 1] += y; out[A + 2] += z; out[B] += x; out[B + 1] += y; out[B + 2] += z; out[C] += x; out[C + 1] += y; out[C + 2] += z;
    }
  }
  for (let k = 0; k < out.length; k += 3) { const l = Math.sqrt(out[k] * out[k] + out[k + 1] * out[k + 1] + out[k + 2] * out[k + 2]) || 1; out[k] /= l; out[k + 1] /= l; out[k + 2] /= l; }
  return out;
}
