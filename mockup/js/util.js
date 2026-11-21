/* mockup v6 — small maths, the house curves, the frame loop and reversible timelines. */
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fit = (x, a, b) => clamp((x - a) / (b - a));
export const damp = (cur, to, lambda, dt) => cur + (to - cur) * (1 - Math.exp(-lambda * dt));

export function bezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = a => 3 * a;
  const at = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const s = slope(t, x1, x2); if (Math.abs(s) < 1e-6) break; t -= (at(t, x1, x2) - x) / s; }
    t = clamp(t);
    // bisection safety net for flat curves
    let lo = 0, hi = 1;
    if (Math.abs(at(t, x1, x2) - x) > 1e-4) { t = x; for (let i = 0; i < 30; i++) { const v = at(t, x1, x2); if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return at(t, y1, y2);
  };
}
export const EASE = {
  enter: bezier(0.16, 1, 0.3, 1),          // entrance
  between: bezier(0.76, 0, 0.24, 1),       // between states
  cam: bezier(0.35, 0, 0, 1),              // camera and hat
  exit: bezier(0.7, 0, 0.84, 0),           // exit (new)
  linear: x => clamp(x)
};
export const CSS_EASE = { enter: 'cubic-bezier(.16,1,.3,1)', between: 'cubic-bezier(.76,0,.24,1)', cam: 'cubic-bezier(.35,0,0,1)', exit: 'cubic-bezier(.7,0,.84,0)' };

/* one requestAnimationFrame loop for the whole page */
const subs = new Set();
let last = performance.now(), fpsN = 0, fpsT = last;
export const frameStats = { fps: 0, dt: 0 };
export function onFrame(fn) { subs.add(fn); return () => subs.delete(fn); }
(function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  frameStats.dt = dt; fpsN++;
  if (now - fpsT >= 500) { frameStats.fps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; }
  for (const fn of subs) { try { fn(dt, now); } catch (e) { console.error(e); } }
  requestAnimationFrame(loop);
})(last);

/* a timeline you can play forward or backward from wherever it is; render(tMs) draws the state at time t */
export class Timeline {
  constructor(name, duration, render) { this.name = name; this.duration = duration; this.render = render; this.t = 0; this.dir = 0; this._done = null; }
  play(dir = 1, { from } = {}) {
    if (from != null) this.t = from;
    this.dir = dir; this._start = performance.now(); this._startT = this.t;
    log({ name: this.name, dir, start: performance.now() });
    return new Promise(res => { if (this._done) this._done(false); this._done = res; this._off = this._off || onFrame(() => this._step()); });
  }
  _step() {
    if (!this.dir) return;
    // wall-clock time, so a slow frame never stretches the trick
    this.t = clamp(this._startT + this.dir * (performance.now() - this._start), 0, this.duration);
    this.render(this.t);
    if ((this.dir > 0 && this.t >= this.duration) || (this.dir < 0 && this.t <= 0)) {
      const dir = this.dir; this.dir = 0;
      log({ name: this.name, dir, end: performance.now(), took: Math.round(performance.now() - this._start) });
      const d = this._done; this._done = null; if (d) d(true);
    }
  }
  set(t) { this.t = clamp(t, 0, this.duration); this.dir = 0; this.render(this.t); }
  get running() { return this.dir !== 0; }
}

export function log(entry) { (window.__mock = window.__mock || { log: [] }).log.push(entry); }

/* WCAG relative luminance and contrast; a logo's luminance is the mean over its opaque pixels */
export const relLum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
export function logoLuminance(img) {
  const w = 160, h = Math.max(1, Math.round(160 * (img.naturalHeight || 1) / (img.naturalWidth || 1)));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data; let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { s += relLum(d[i], d[i + 1], d[i + 2]); n++; }
  return n ? s / n : 0;
}

/* the screen boxes of every visible line of text marked data-text (one box per line, not the whole block) */
export function isShown(el) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n.hidden) return false;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
  }
  return true;
}
export function textRects(scope) {
  const out = [], r = document.createRange();
  for (const el of scope.querySelectorAll('[data-text]')) {
    if (!isShown(el)) continue;
    r.selectNodeContents(el);
    for (const q of r.getClientRects()) if (q.width > 2 && q.height > 2 && q.bottom > 0 && q.top < innerHeight) out.push(q);
  }
  return out;
}

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
export const vh = () => innerHeight / 100, vw = () => innerWidth / 100;
export const isPhone = () => innerWidth / innerHeight < 0.85 || innerWidth < 700;

/* object-fit: cover — a box in normalized video coordinates → screen pixels inside a W×H container at (ox, oy) */
export function coverBox(b, vw, vh, W, H, ox = 0, oy = 0) {
  const s = Math.max(W / vw, H / vh), dx = ox + (W - vw * s) / 2, dy = oy + (H - vh * s) / 2;
  const left = dx + b.x0 * vw * s, top = dy + b.y0 * vh * s, right = dx + b.x1 * vw * s, bottom = dy + b.y1 * vh * s;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
