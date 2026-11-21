/* mockup v6 — the stage: curtains, a floor glow, one spotlight and the work's screen, plus the two tricks.
   «da cartola» (1300 ms) opens the stage out of the hat's mouth; «o lenço» (900 ms) swaps one work for the next
   under a sweep of silk. Both are reversible timelines: render(t) draws the state at time t, so playing backward undoes. */
import { clamp, lerp, fit, EASE, Timeline, onFrame, esc, isPhone, log } from './util.js';
import { asset, PLACEHOLDER_LINE } from './data.js';

const T_HAT = 1300, T_SILK = 900, T_FADE = 200, T_COLLAPSE = 300;
const TEXT_ITEM = 420, TEXT_STAGGER = 60, TEXT_RISE = 16;

export function createStage(bgRoot, fgRoot, { projects, mode, hat, reduced, onCase }) {
  bgRoot.insertAdjacentHTML('beforeend', '<div class="st-bg"><i class="st-spot"></i><i class="st-floor"></i></div>');
  fgRoot.insertAdjacentHTML('beforeend', `
    <div class="st-fg" data-mode="${mode}">
      <div class="st-valance" aria-hidden="true"></div>
      <div class="st-curtain l" aria-hidden="true"></div><div class="st-curtain r" aria-hidden="true"></div>
      <div class="st-top"></div>
      <p class="st-count" aria-hidden="true"></p>
      <div class="st-scr-wrap">
        <figure class="st-scr"><img class="st-poster" alt=""><video class="st-video" muted loop playsinline preload="none" aria-hidden="true"></video></figure>
      </div>
      <div class="st-silk-clip" aria-hidden="true"><svg class="st-silk" preserveAspectRatio="none"><defs>
        <linearGradient id="silkG${mode}" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="0" x2="100" y2="30">
          <stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".25" stop-color="#000" stop-opacity=".15"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>
        </linearGradient></defs><path class="st-silk-base" fill="#e02727"/><path fill="url(#silkG${mode})"/></svg></div>
      <canvas class="st-dust" aria-hidden="true"></canvas>
      <div class="st-text">
        <p class="st-lbl lbl" data-text></p>
        <h3 class="st-title" data-text></h3>
        <p class="st-line" data-text></p>
        <div class="st-btns" data-text><button type="button" class="btn st-watch">Watch the film</button><a class="btn ghost st-case" href="#work">See the case study</a></div>
      </div>
      <div class="st-list"></div>
    </div>`);
  const bg = bgRoot.querySelector('.st-bg'), fg = fgRoot.querySelector('.st-fg');
  const q = s => fg.querySelector(s);
  const wrap = q('.st-scr-wrap'), scr = q('.st-scr'), poster = q('.st-poster'), video = q('.st-video');
  const silkClip = q('.st-silk-clip'), silk = q('.st-silk'), silkPaths = fg.querySelectorAll('.st-silk path'), dust = q('.st-dust'), dctx = dust.getContext('2d');
  const text = q('.st-text'), items = [q('.st-lbl'), q('.st-title'), q('.st-line'), q('.st-btns')], count = q('.st-count');
  const cl = q('.st-curtain.l'), cr = q('.st-curtain.r');
  let list = projects, index = -1, shown = -1, shownP = null, open = 0, curtainK = 0, box = null;

  /* layout: the screen is 16:9, min(72vw, 128vh) wide with its top at 12vh; on a phone 4:5, 92vw wide at 11vh (the film is cropped to fill) */
  function layout() {
    const W = innerWidth, Hh = innerHeight, ph = isPhone();
    const w = ph ? W * 0.92 : Math.min(W * 0.72, Hh * 1.28), h = ph ? w * 5 / 4 : w * 9 / 16, top = Hh * (ph ? 0.11 : 0.12), left = (W - w) / 2;
    fg.classList.toggle('portrait', ph);
    box = { left, top, w, h, bottom: top + h };
    Object.assign(wrap.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
    const m = 0.06;   // the silk covers the screen plus a 6% margin
    Object.assign(silkClip.style, { left: left - w * m + 'px', top: top - h * m + 'px', width: w * (1 + 2 * m) + 'px', height: h * (1 + 2 * m) + 'px' });
    // on a phone the 5vw curtains overlap the 92vw screen's edges: the screen sits in front of them, the text keeps clear
    const inset = ph ? Math.max(left, W * 0.05 + 10) : left;
    Object.assign(text.style, { left: inset + 'px', top: box.bottom + Hh * (ph ? 0.025 : 0.022) + 'px', width: (ph ? W - 2 * inset : Math.min(w * 0.56, 560)) + 'px' });
    Object.assign(count.style, { right: (ph ? inset : W - left - w) + 'px', top: top - (ph ? 26 : 34) + 'px' });
    fg.style.setProperty('--scr-left', inset + 'px'); fg.style.setProperty('--scr-right', (ph ? inset : W - left - w) + 'px');
    fg.style.setProperty('--scr-top', top + 'px'); fg.style.setProperty('--scr-bottom', box.bottom + 'px');
    requestAnimationFrame(() => fg.style.setProperty('--text-bottom', text.offsetTop + text.offsetHeight + 14 + 'px'));
    dust.width = W; dust.height = Hh;
    setCurtains(curtainK);
  }
  addEventListener('resize', layout);

  function setCurtains(k) {         // k: 0 open (at the sides), 1 closed (meeting in the middle)
    curtainK = k;
    const side = innerWidth * (isPhone() ? 0.05 : 0.09), wpx = lerp(side, innerWidth / 2 + 2, k);
    cl.style.width = cr.style.width = wpx + 'px';
  }
  function setLights(k) { bg.style.setProperty('--lights', k); fg.style.setProperty('--lights', k); }
  function setRoom(k) { bg.style.setProperty('--room', k); }

  /* content */
  function fill(i) { fillP(list[i]); }
  function fillP(p) {
    shownP = p || null; shown = p ? list.indexOf(p) : -1;
    if (!p) { poster.removeAttribute('src'); video.removeAttribute('src'); return; }
    items[0].textContent = p.cat; items[1].textContent = p.title; items[2].textContent = PLACEHOLDER_LINE;
    q('.st-case').href = '#work'; q('.st-case').dataset.project = String(projects.indexOf(p));
    count.textContent = `${Math.max(1, list.indexOf(p) + 1)} / ${list.length}`;
    poster.src = asset(p.poster);
    scr.classList.remove('playing');
    video.src = asset(p.clip); video.load();
    const pr = video.play(); if (pr && pr.catch) pr.catch(() => {});
    const nx = list[list.indexOf(p) + 1]; if (nx) { const im = new Image(); im.src = asset(nx.poster); }
  }
  video.addEventListener('playing', () => scr.classList.add('playing'));
  q('.st-watch').addEventListener('click', () => { if (shownP) fg.dispatchEvent(new CustomEvent('watch', { detail: shownP, bubbles: true })); });
  q('.st-case').addEventListener('click', e => { e.preventDefault(); onCase && onCase(projects.indexOf(shownP)); });

  function textAt(t, from, out) {     // cascade in from `from` ms; `out`: the old text leaving over 0–180 ms
    items.forEach((el, k) => {
      let o, y;
      if (out != null && t < from) { const e = EASE.exit(fit(t, 0, 180)); o = 1 - e; y = -8 * e; }
      else { const e = reduced() ? (t >= from ? 1 : 0) : EASE.enter(fit(t, from + k * TEXT_STAGGER, from + k * TEXT_STAGGER + TEXT_ITEM)); o = e; y = (1 - e) * TEXT_RISE; }
      el.style.opacity = o; el.style.transform = `translateY(${y}px)`;
    });
    text.style.visibility = items.some(el => +el.style.opacity > 0.01) ? 'visible' : 'hidden';
  }

  /* the hat on the stage: standing at the centre (72% down, 22vh), mouth up; it ends small at the front (11vh, phone 9vh) */
  const TILT = 14 * Math.PI / 180;
  const standPose = () => ({ x: 0.5, y: 0.72, h: 0.22, rx: Math.PI + 0.35, ry: 0.5, rz: 0 });
  // on a phone the hat sits right after the buttons (after the filters on the Work page), so no band of the screen is left empty
  const frontPose = () => {
    const ph = isPhone(), H = innerHeight;
    if (ph) {
      const tb = text.offsetTop + text.offsetHeight + (mode === 'work' ? 58 : 0);
      const p = { x: 0.5, y: Math.min(0.95, (tb + 14 + 0.045 * H) / H), h: 0.09, rx: Math.PI + 0.35, ry: 0.5, rz: 0 };
      if (hat.kind === '3d') { hat.pose(p); const r = hat.rect(); p.y += (tb + 12 - r.top) / H; }   // top of the drawn hat just under the buttons
      return p;
    }
    return { x: 0.5, y: clamp((box.bottom / H + 1) / 2, 0.82, 0.92), h: 0.11, rx: Math.PI + 0.35, ry: 0.5, rz: 0 };
  };
  let hatPose = standPose();

  /* «da cartola»: 0–120 tilt 14° · 120–520 dust from the mouth · 240–1140 screen from 8% to 104% out of the mouth, 1140–1300 settles ·
     520–1100 the hat goes to the front · from 900 the text cascades */
  let mouth0 = null, standMouth = null;
  const hatTL = new Timeline('fromHat', T_HAT, t => {
    if (!mouth0) mouth0 = hat.mouth();
    const tilt = EASE.cam(fit(t, 0, 120)) * TILT, mv = EASE.cam(fit(t, 520, 1100)), a = standPose(), b = frontPose();
    hatPose = { x: lerp(a.x, b.x, mv), y: lerp(a.y, b.y, mv), h: lerp(a.h, b.h, mv), rx: a.rx + tilt, ry: a.ry, rz: 0 };
    let s;
    if (t < 1140) s = lerp(0.08, 1.04, EASE.enter(fit(t, 240, 1140))); else s = lerp(1.04, 1, EASE.between(fit(t, 1140, 1300)));
    const k = clamp((s - 0.08) / 0.92), dx = (mouth0.x - (box.left + box.w / 2)) * (1 - k), dy = (mouth0.y - box.bottom) * (1 - k);
    wrap.style.transform = `translate(${dx}px,${dy}px) scale(${s})`; wrap.style.opacity = t < 240 ? 0 : 1;
    drawDust(t);
    textAt(t, 900);
  });
  function drawDust(t) {
    dctx.clearRect(0, 0, dust.width, dust.height);
    if (t <= 120 || t >= 520 || reduced()) return;
    const k = fit(t, 120, 520), m = mouth0 || hat.mouth();
    for (let i = 0; i < 46; i++) {
      const r1 = Math.sin(i * 12.9898) * 43758.5453 % 1, r2 = Math.sin(i * 78.233) * 12543.11 % 1;
      const x = m.x + (r1 - 0.5) * innerHeight * 0.12 * (0.4 + k), y = m.y - k * innerHeight * (0.08 + Math.abs(r2) * 0.22);
      dctx.globalAlpha = Math.sin(k * Math.PI) * (0.5 + Math.abs(r2) * 0.5);
      dctx.fillStyle = i % 3 ? '#f2f1ee' : '#81cfe3';
      dctx.beginPath(); dctx.arc(x, y, 1.2 + Math.abs(r1) * 2.2, 0, 7); dctx.fill();
    }
    dctx.globalAlpha = 1;
  }

  /* «o lenço» (900 ms): one cloth crosses the screen on a diagonal (−12°), its top front corner pulled ahead (10% of its height)
     as if by a hand; four pleats run across it as diagonal bands of light and shade, 1.3× faster than the cloth; the trailing edge
     ripples (3 waves, 6%); a soft 12 px shadow falls on the screen ahead of it. Fully covered 380–460 ms; the work swaps at 420 ms. */
  let silkFrom = null, silkTo = null, silkDir = 1;
  const TILT_SILK = -12, grad = q('.st-silk linearGradient');
  function clothPath(Wc, Hc, phase) {
    const B = Hc * 0.10, A = Hc * 0.06, n = 28; let d = '';
    for (let i = 0; i <= n; i++) { const y = i / n * Hc, x = A + Math.sin(i / n * 3 * Math.PI * 2 + phase) * A; d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1); }       // trailing edge
    for (let i = n; i >= 0; i--) { const y = i / n * Hc, u = 1 - y / Hc, x = Wc - B + B * u * u + Math.sin(i / n * Math.PI * 2 + phase * 0.6) * Hc * 0.008; d += 'L' + x.toFixed(1) + ',' + y.toFixed(1); }   // leading edge, top corner ahead
    return d + 'Z';
  }
  const silkTL = new Timeline('silk', T_SILK, t => {
    const R = silkClip.getBoundingClientRect(), tan = Math.tan(Math.abs(TILT_SILK) * Math.PI / 180);
    const Hc = R.height * 1.25 + R.width * tan, pad = R.height * 0.5 * tan + Hc * 0.06 + R.width * 0.02;
    const Wc = Math.max(box.w * 1.6, R.width + 2 * pad + box.w * 0.05);   // 1.6× the screen, wider only where a tall screen needs it to cover
    silk.setAttribute('width', Wc); silk.setAttribute('height', Hc); silk.setAttribute('viewBox', `0 0 ${Wc} ${Hc}`);
    const d = clothPath(Wc, Hc, t / 120); silkPaths.forEach(el => el.setAttribute('d', d));
    const xs = -Wc - pad, x1 = R.width + pad - Wc, x2 = -pad, xe = R.width + pad;
    const xf = t < 380 ? lerp(xs, x1, EASE.between(fit(t, 0, 380))) : t < 460 ? lerp(x1, x2, fit(t, 380, 460)) : lerp(x2, xe, EASE.between(fit(t, 460, 900)));
    // pleats: bands repeat every quarter of the cloth and drift forward at 0.3× the cloth's own travel (1.3× in the room)
    const P = Wc / 4, shift = (xf - xs) * 0.3, ang = 18 * Math.PI / 180;
    grad.setAttribute('x1', shift); grad.setAttribute('y1', 0); grad.setAttribute('x2', shift + P * Math.cos(ang)); grad.setAttribute('y2', P * Math.sin(ang));
    const x = silkDir < 0 ? R.width - Wc - xf : xf;
    silk.style.transform = `translate(${x}px, ${-(Hc - R.height) / 2}px) rotate(${silkDir * TILT_SILK}deg) scaleX(${silkDir})`;
    silk.style.visibility = t > 0 && t < 900 ? 'visible' : 'hidden';
    const want = t >= 420 ? silkTo : silkFrom; if (want !== shownP) fillP(want);
    textAt(t, 620, true);
  });
  /* the walkthrough has no stage set: between works the screen folds back into the hat's mouth in 400 ms (exit curve)
     and the next one comes out of it in 900 ms (entrance curve); the work swaps at 400 ms */
  let swapFrom = null, swapTo = null, swapMouth = null;
  const T_SWAP = 1300;
  const swapTL = new Timeline('swap', T_SWAP, t => {
    if (!swapMouth) swapMouth = hat.mouth();
    let s;
    if (t < 400) s = lerp(1, 0.08, EASE.exit(t / 400));
    else if (t < 1140) s = lerp(0.08, 1.04, EASE.enter(fit(t, 400, 1140)));
    else s = lerp(1.04, 1, EASE.between(fit(t, 1140, 1300)));
    const k = clamp((s - 0.08) / 0.92), dx = (swapMouth.x - (box.left + box.w / 2)) * (1 - k), dy = (swapMouth.y - box.bottom) * (1 - k);
    wrap.style.transform = `translate(${dx}px,${dy}px) scale(${s})`;
    wrap.style.opacity = t < 400 ? 1 - fit(t, 330, 400) : fit(t, 400, 470);
    const want = t >= 400 ? swapTo : swapFrom; if (want !== shownP) fillP(want);
    textAt(t, 1000, true);
  });
  /* reduced motion: both tricks become a 200 ms cross-fade */
  let fadeFrom = 0, fadeTo = 0;
  const fadeTL = new Timeline('fade', T_FADE, t => {
    const k = t / T_FADE, want = k >= 0.5 ? fadeTo : fadeFrom;
    if (want !== shown && want >= 0) fill(want);
    const o = fadeFrom < 0 ? k : fadeTo < 0 ? 1 - k : Math.abs(k - 0.5) * 2;
    wrap.style.opacity = o; wrap.style.transform = 'none';
    items.forEach(el => { el.style.opacity = o; el.style.transform = 'none'; });
    text.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    if (fadeFrom < 0 || fadeTo < 0) hatPose = (k >= 0.5 ? fadeTo : fadeFrom) < 0 ? standPose() : frontPose();
  });
  /* act 4: the screen folds away in 300 ms */
  const collapseTL = new Timeline('collapse', T_COLLAPSE, t => {
    const e = EASE.between(t / T_COLLAPSE);
    fg.style.setProperty('--collapse', e);
  });

  /* the queue: the stage walks one step at a time toward the target; a step heading the wrong way plays backward */
  let target = -1, step = null;
  // one step between neighbours (from may be -1: the stage is closed). Played forward a step ends at .to, backward at .from.
  function begin(from, to) {
    if (reduced()) { fadeFrom = from; fadeTo = to; step = { tl: fadeTL, from, to }; fadeTL.set(0); run(1); return; }
    if (from < 0) { mouth0 = null; fill(to); step = { tl: hatTL, from: -1, to }; hatTL.set(0); run(1); return; }
    if (to < 0) { mouth0 = standMouth; step = { tl: hatTL, from: -1, to: from }; hatTL.set(T_HAT); run(-1); return; }
    if (mode === 'walk') { swapFrom = list[from]; swapTo = list[to]; swapMouth = null; step = { tl: swapTL, from, to }; swapTL.set(0); run(1); return; }
    silkFrom = list[from]; silkTo = list[to]; silkDir = to > from ? 1 : -1; step = { tl: silkTL, from, to }; silkTL.set(0); run(1);
  }
  function run(d) {
    const s = step; s.d = d;
    s.tl.play(d).then(ok => {
      if (!ok || step !== s) return;
      index = d > 0 ? s.to : s.from; step = null;
      if (index < 0) { fill(-1); wrap.style.opacity = 0; }
      log({ name: 'stage-index', index });
    });
  }
  onFrame(() => {
    if (!box) return;
    if (step) {
      const goingTo = step.d > 0 ? step.to : step.from, other = step.d > 0 ? step.from : step.to;
      if (Math.abs(target - other) < Math.abs(target - goingTo)) run(-step.d);   // the visitor turned back: undo
      return;
    }
    if (target !== index) {
      if (index < 0) begin(-1, Math.max(0, target));
      else if (target < 0) begin(index, index === 0 ? -1 : index - 1);
      else begin(index, index + Math.sign(target - index));
    }
    if (index < 0 && !step && hat.visible) standMouth = hat.mouth();
  });

  layout(); fill(-1); wrap.style.opacity = 0; textAt(0, 900); setCurtains(0); setLights(1);
  return {
    bg, fg, layout, setCurtains, setLights, setRoom,
    get box() { return box; }, get index() { return index; }, get busy() { return !!step; }, get target() { return target; },
    hatPose: () => hatPose,
    goTo(i) { target = i; },
    cut(i) {                                  // no animation: jump straight to work i (act jumps, entering a page)
      if (step) { step.tl.dir = 0; step = null; }
      target = index = i; mouth0 = null;
      if (i < 0) { fill(-1); wrap.style.opacity = 0; hatPose = standPose(); textAt(0, 900); return; }
      fill(i); wrap.style.opacity = 1; wrap.style.transform = 'none'; hatPose = frontPose(); textAt(T_HAT + 400, 0);
    },
    setList(l) { list = l; },
    collapse(on) { return collapseTL.play(on ? 1 : -1); },
    get collapsed() { return collapseTL.t > 0; },
    current: () => shownP,
    get list() { return list; },
    // a filter change: the silk sweeps from whatever is showing to the first work of the new list
    replaceList(l, dir = 1) {
      const from = shownP; list = l; target = 0;
      if (reduced() || !from || index < 0) { this.cut(0); return; }
      if (step) { step.tl.dir = 0; step = null; }
      silkFrom = from; silkTo = l[0]; silkDir = dir; step = { tl: silkTL, from: 0, to: 0 }; silkTL.set(0); run(1);
    },
    silkTo(i, dir) { if (step || i === index || index < 0) { target = i; return; } silkFrom = list[index]; silkTo = list[i]; silkDir = dir; target = i; step = { tl: silkTL, from: index, to: i }; silkTL.set(0); run(1); }
  };
}
