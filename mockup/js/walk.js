/* mockup v6 — the walkthrough: the logo film, then six acts, on 9.4 screen heights of scroll (phone 7.8).
   Scroll positions are measured in screen heights from the top; each act has a progress 0→1.
   Darkness is slew-limited in time, so no light change is ever faster than 450 ms, however fast the scroll.
   v6.2: segment 0 is the v5 logo film. Its last part hands over to the hat (scroll-linked on a laptop, 300 ms fades on a phone). */
import { clamp, lerp, fit, damp, EASE, onFrame, $, $$, isPhone, coverBox, textRects as allTextRects } from './util.js';
import { ACT_NAMES, FILM, asset } from './data.js';
import { writeIntro } from './store.js';

const LEN_DESK = [1, 1, 1.2, 1, 1, 1, 1, 1.2, 1];        // film · 1 · 2 · 3a 3b 3c · 4 · 5 · 6 = 9.4
const LEN_PHONE = [0.3, 1, 1, 0.9, 0.9, 0.9, 0.8, 1, 1]; // = 7.8
const ACT_OF = [-1, 0, 1, 2, 2, 2, 3, 4, 5];             // segment → act (0-based; −1 is the film)
const DARK_RATE = 1 / 0.9;                               // a full light change takes at least 900 ms
const ZONE_SPEED = 1.2;                                  // screen heights per second, at most, through acts 2 and 5
const WAIT_DESK = 0.35, WAIT_PHONE = 0.5;                // where the scroll waits for the 3D (the hat is needed from there)

export function createWalk(root, { hat, stage, canvas, reduced, go, hatReady = () => true, hatProgress = () => 1 }) {
  const spacer = $('.w-spacer', root), dark = $('.w-dark', root), day = $('.w-day', root), night = $('.w-night', root);
  const title1 = $('.w1-title', root), hint = $('.w1-hint', root), cap2 = $('.w2-cap', root), act4 = $('.w4', root), act6 = $('.w6', root), title6 = $('.w6-title', root);
  const slot = $('.w6-slot', root), hdrStart = $('.w-start', root), marks = $$('.w-mark', root), bar = $('.w-bar i', root);
  const w1 = $('.w1', root), frame = $('.w-film-frame', root), fv = $('.w-film-v', root), still = $('.w-film-still', root), noHat = $('.w-film-nohat', root);
  const fRow = $('.w-film-row', root), waitLine = $('.w-film-wait', root);
  still.src = asset(FILM.still); noHat.src = asset(FILM.stillNoHat);
  let segs = [], total = 0, smoothY = 0, darkShown = 0, act1T = -1, wrote = false, active = false, tapped = false, lastAct = -2, k3 = -1, want4 = false, capShown = 0;
  let hold = false, phoneBand = 1, bandFade = { from: 1, to: 1, t0: 0 }, waiting = false;
  const capRange = document.createRange();

  function measure() {
    const lens = isPhone() ? LEN_PHONE : LEN_DESK, H = innerHeight;
    let at = 0; segs = lens.map(l => { const s = { start: at * H, len: l * H }; at += l; return s; });
    total = at;
    // one wait: until the 3D is ready, the page ends where the hat is first needed
    const limit = hatReady() ? Infinity : segs[0].start + segs[0].len * (isPhone() ? WAIT_PHONE : WAIT_DESK);
    spacer.style.height = Math.min((total + 1) * H, limit + H) + 'px';
    waiting = limit < Infinity;
  }
  addEventListener('resize', measure);
  const segP = (y, i) => (y - segs[i].start) / segs[i].len;
  function where(y) {
    let i = 0; while (i < segs.length - 1 && y >= segs[i + 1].start) i++;
    return { seg: i, act: ACT_OF[i], p: clamp(segP(y, i)) };
  }
  function actP(y, act) {                               // progress through a whole act (act 3 spans three segments)
    const ids = ACT_OF.map((a, i) => a === act ? i : -1).filter(i => i >= 0);
    const s = segs[ids[0]].start, e = segs[ids[ids.length - 1]].start + segs[ids[ids.length - 1]].len;
    return clamp((y - s) / (e - s));
  }

  /* hat poses (screen space) */
  const P1 = () => isPhone() ? { x: 0.5, y: 0.3, h: 0.3, rx: 0.16, ry: -0.3, rz: 0.06 } : { x: 0.76, y: 0.44, h: 0.46, rx: 0.16, ry: -0.55, rz: 0.1 };
  const MOUTH = { x: 0.5, y: 0.5, rx: -Math.PI / 2, ry: 0, rz: 0 };
  const UPRIGHT = () => ({ x: 0.5, y: 0.5, h: isPhone() ? 0.26 : 0.36, rx: 0.12, ry: -0.45, rz: 0.06 });
  // the hat becomes the «t»: its brim exactly as wide as the t's bar in the wordmark, its base resting on the stem.
  // Fitted by measuring the drawn hat (two passes), so it matches whatever the projection does.
  const slotPose = () => fitPose(slot.getBoundingClientRect());
  // the same fit onto any box: brim as wide as the box, base on its bottom edge, centred (used for the film's hat too)
  // stretch: also match the box height with a vertical stretch (the film's hat is taller for its width than the 3D one)
  function fitPose(r, stretch = false) {
    const ratio = (hat.height || 1) / (hat.width || 1);
    let p = { x: (r.left + r.width / 2) / innerWidth, y: (r.bottom - r.width * ratio / 2) / innerHeight, h: r.width * ratio / innerHeight, rx: 0.06, ry: 0, rz: 0, sy: 1 };
    for (let i = 0; i < 3; i++) {
      hat.pose(p); const q = hat.rect();
      p = { ...p, h: p.h * r.width / Math.max(1, q.width) };
      if (stretch) { hat.pose(p); const qh = hat.rect(); p.sy = p.sy * r.height / Math.max(1, qh.height); }
      hat.pose(p); const q2 = hat.rect();
      p = { ...p, x: p.x + (r.left + r.width / 2 - (q2.left + q2.width / 2)) / innerWidth, y: p.y + (r.bottom - q2.bottom) / innerHeight };
    }
    return p;
  }
  const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t), rx: lerp(a.rx, b.rx, t), ry: lerp(a.ry, b.ry, t), rz: lerp(a.rz, b.rz, t), s: lerp(a.s || 1, b.s || 1, t) });

  /* the walkthrough starts on the film, at frame 0 (the door, «Replay the experience» and #walkthrough alike).
     hold: the door's passage keeps the film still on frame 0 until it calls release() */
  function start({ hold: h = false } = {}) {
    measure(); active = true; scrollTo(0, 0); smoothY = 0; darkShown = 0; wrote = false; tapped = false; k3 = -1; act1T = -1;
    stage.cut(-1); stage.setCurtains(0); stage.setLights(0); stage.setRoom(0); stage.collapse(false); want4 = false;
    root.classList.remove('entered'); phoneBand = 1; bandFade = { from: 1, to: 1, t0: 0 }; hold = h;
    const src = asset(FILM.src()); if (fv.dataset.src !== src) { fv.src = src; fv.dataset.src = src; }
    fv.pause(); try { fv.currentTime = 0; } catch (e) {}
    hint.hidden = false;
  }
  function release() { hold = false; try { fv.currentTime = 0; } catch (e) {} const p = fv.play(); if (p && p.catch) p.catch(() => {}); }
  function stop() { active = false; fv.pause(); canvas.style.opacity = ''; }
  function jump(act) {                                  // act 1..6, from the mockup bar or the progress marks
    const seg = ACT_OF.indexOf(act - 1), y = segs[seg].start + 2;
    hold = false; scrollTo(0, y); smoothY = y; act1T = performance.now() - 5000;
    darkShown = act >= 3 && act <= 4 ? 1 : 0;
    stage.cut(act >= 4 ? 2 : -1); k3 = act >= 4 ? 2 : -1; want4 = act >= 4; stage.collapse(want4);
  }

  const dustC = $('.w-dust', root), dctx = dustC.getContext('2d');
  const motes = Array.from({ length: 150 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, c: i % 4 ? '#ffffff' : '#81cfe3', ph: Math.random() * 6.28 }));
  function drawDust(o, t, yScroll) {
    const W = dustC.width = innerWidth, H = dustC.height = innerHeight;
    dctx.clearRect(0, 0, W, H); if (o <= 0.01) return;
    for (const m of motes) {
      const y = ((m.y - (reduced() ? 0 : t * 0.012 * m.z) - yScroll / innerHeight * 0.25 * m.z) % 1 + 1) % 1, x = m.x + Math.sin(t * 0.3 + m.ph) * 0.006;
      dctx.globalAlpha = o * (0.25 + 0.55 * m.z) * (0.6 + 0.4 * Math.sin(t * 1.3 + m.ph));
      dctx.fillStyle = m.c; dctx.beginPath(); dctx.arc(x * W, y * H, 0.6 + m.z * 1.4, 0, 6.3); dctx.fill();
    }
    dctx.globalAlpha = 1;
  }

  onFrame((dt, now) => {
    if (!active) return;
    const H = innerHeight;
    if (reduced()) smoothY = scrollY;
    else {
      // the camera crosses the dive and the way out at most 1.6 screen heights a second, so a flick of the wheel
      // still takes ≥ 450 ms to go from paper to dark (the hat's zoom darkens the screen too, not only the mask)
      let ny = damp(smoothY, scrollY, 7, dt);
      const maxStep = ZONE_SPEED * H * dt;
      for (const z of [2, 7]) {
        const a = segs[z].start, b = a + segs[z].len;
        if (ny > smoothY && smoothY < b && ny > a) ny = Math.min(ny, Math.max(smoothY, a) + maxStep);
        if (ny < smoothY && smoothY > a && ny < b) ny = Math.max(ny, Math.min(smoothY, b) - maxStep);
      }
      smoothY = ny;
    }
    const y = smoothY, w = where(y), act = w.act;
    const p1 = actP(y, 0), p2 = actP(y, 1), p4 = actP(y, 3), p5 = actP(y, 4), p6 = actP(y, 5);
    const p0 = clamp(segP(y, 0)), phone = isPhone();

    /* the one wait: the line shows how much of the 3D has arrived while the scroll is held */
    if (waiting && hatReady()) measure();
    const limitY = segs[0].start + segs[0].len * (phone ? WAIT_PHONE : WAIT_DESK);
    waitLine.hidden = !(waiting && scrollY >= limitY - 4);
    if (!waitLine.hidden) waitLine.firstElementChild.style.transform = `scaleX(${clamp(hatProgress())})`;

    /* the film (segment 0). Laptop: 0–35% it plays free; 35–50% it melts into the still; 50–85% the still (without its hat
       now — the 3D hat has taken its place) shrinks 4% and fades, and the paper shows behind. Phone: the band and act 1 swap
       with 300 ms fades past half of the band. */
    let filmO = 1, stillO = 0, noHatO = 0, noHatS = 1, rowO = 1, titleIn = false;
    if (phone) {
      // a 300 ms fade on the wall clock (200 ms with reduced motion), restarted from where it is if the direction changes
      const want = p0 < 0.5 ? 1 : 0;
      if (want !== bandFade.to) bandFade = { from: phoneBand, to: want, t0: now };
      phoneBand = lerp(bandFade.from, bandFade.to, clamp((now - bandFade.t0) / (reduced() ? 200 : 300)));
      filmO = phoneBand; rowO = phoneBand; titleIn = want === 0;
    } else {
      stillO = fit(p0, 0.35, 0.5);
      filmO = p0 < 0.5 ? 1 : 0;
      if (p0 >= 0.5) { stillO = 0; noHatO = 1 - fit(p0, 0.5, 0.85); noHatS = 1 - 0.04 * EASE.between(fit(p0, 0.5, 0.85)); }
      rowO = 1 - fit(p0, 0.2, 0.35);
      titleIn = p0 >= 0.9 || act >= 0;
    }
    const fr = frame.getBoundingClientRect();
    const logoS = coverBox(FILM.logoStill, FILM.vw, FILM.vh, fr.width, fr.height, fr.left, fr.top);
    fv.style.opacity = filmO; frame.style.opacity = phone ? phoneBand : 1;
    still.style.opacity = stillO; noHat.style.opacity = noHatO;
    noHat.style.transformOrigin = `${logoS.left + logoS.width / 2 - fr.left}px ${logoS.top + logoS.height / 2 - fr.top}px`;
    noHat.style.transform = noHatS < 1 ? `scale(${noHatS})` : '';
    noHat.style.setProperty('--k', phone ? 0 : fit(p0, 0.5, 0.6));
    fRow.style.opacity = rowO; fRow.style.visibility = rowO > 0.01 ? 'visible' : 'hidden';
    root.querySelector('.w-film').style.visibility = act < 1 && (filmO + stillO + noHatO > 0.001 || phoneBand > 0.001) ? 'visible' : 'hidden';
    root.classList.toggle('entered', titleIn);
    // the hint's clock starts when the act 1 title enters (90% of the film on a laptop, the fade on a phone)
    if (titleIn && act1T < 0) act1T = now; else if (!titleIn) act1T = -1;
    const ent = act1T < 0 ? 0 : now - act1T;
    w1.style.opacity = phone ? 1 - phoneBand : '';
    // the film plays only while it can be seen (and not while the door is still handing over to it)
    const filmSeen = act < 0 && (phone ? phoneBand > 0.01 : p0 < 0.5);
    if (filmSeen && !hold && fv.paused && fv.readyState >= 2) { const pr = fv.play(); if (pr && pr.catch) pr.catch(() => {}); }
    else if (!filmSeen && !fv.paused) fv.pause();

    /* light: target darkness per act, shown through a slew limit */
    let darkT = 0;
    if (act === 1) darkT = fit(p2, 0.45, 0.85);
    else if (act === 2 || act === 3) darkT = 1;
    else if (act === 4) darkT = 1 - fit(p5, 0.25, 0.85);  // plan v6.1: 0–25% the clients fade (300 ms) and the small hat sinks; 25–85% the way out
    const step = DARK_RATE * dt;
    darkShown = reduced() ? darkT : darkShown + clamp(darkT - darkShown, -step, step);

    /* act 1: the title (words 520 ms, 70 ms apart) and the hat (700 ms) enter on time; the title leaves at 70–95% */
    title1.style.opacity = 1 - fit(p1, 0.7, 0.95);
    title1.style.transform = `translateY(${-fit(p1, 0.7, 0.95) * 40}px)`;
    const showHint = act === 0 && !tapped && ent > 1200;            // stays until the first tap
    hint.classList.toggle('on', showHint);

    /* act 2: «Step inside.» only between 10% and 55% */

    /* the stage is lit at the end of act 2, stays through 3–4, and the curtains close at the start of act 5 */
    const stageO = act === 1 ? fit(p2, 0.8, 1) : act === 2 || act === 3 ? 1 : act === 4 ? 1 - fit(p5, 0, 0.25) : 0;
    stage.fg.style.opacity = stageO; stage.bg.style.opacity = stageO;
    stage.fg.style.visibility = stage.bg.style.visibility = stageO > 0.001 ? 'visible' : 'hidden';
    drawDust(act === 1 ? darkShown * fit(p2, 0.6, 1) : act === 2 || act === 3 ? 1 : act === 4 ? darkShown : 0, now / 1000, y);
    stage.setLights(act === 1 ? fit(p2, 0.8, 1) : 1);
    // act 4: the room light rises through the whole act and the wall of clients drifts up a little (never a still half-screen)
    stage.setRoom(act === 3 ? 0.35 + 0.65 * p4 : act === 4 ? 1 - fit(p5, 0, 0.25) : 0);
    act4.style.setProperty('--p4', act === 3 ? p4 : act > 3 ? 1 : 0);
    stage.setCurtains(0);                                 // the walkthrough has no stage set (only the Work page does)

    /* act 3: a trick fires past 12% of each third and is undone below 8% */
    if (act >= 2) {
      const ps = [segP(y, 3), segP(y, 4), segP(y, 5)];
      while (k3 < 2 && ps[k3 + 1] >= 0.12) k3++;
      while (k3 >= 0 && ps[k3] < 0.08) k3--;
    } else k3 = -1;
    stage.goTo(k3);
    hdrStart.hidden = act < 2;

    /* act 4: the screen folds away; clients settle in */
    const in4 = act >= 3;
    if (in4 !== want4) { want4 = in4; stage.collapse(in4); }
    act4.classList.toggle('on', act === 3);

    /* act 6: the title rises at 30–70%; the mark is written at 60% */
    act6.classList.toggle('vis', act === 5);
    title6.style.opacity = fit(p6, 0.3, 0.7); title6.style.transform = `translateY(${(1 - EASE.enter(fit(p6, 0.3, 0.7))) * 40}px)`;
    $('.w6-rest', root).style.opacity = fit(p6, 0.45, 0.8);
    if (act === 5 && p6 >= 0.6 && !wrote) { wrote = writeIntro() || true; window.__mock.mark = true; }

    /* the hat */
    let pose, z = 3, drift = 0, hatO = 1, filmHat = null;
    if (act < 0 && phone) {
      // phone: the hat is already in its act 1 place and fades in with the title as the band fades out
      pose = P1(); drift = 1; hatO = 1 - phoneBand; pose.visible = hatO > 0.01;
    } else if (act < 0) {
      // laptop: the 3D hat appears exactly on the still's hat (35–50%), drops 6 px (50–56%), lifts off the «t» and flies
      // in an arc to its act 1 place, growing and turning once (56–100%)
      filmHat = coverBox(FILM.hatStill, FILM.vw, FILM.vh, fr.width, fr.height, fr.left, fr.top);
      const A = fitPose(filmHat, true), B = P1();
      if (reduced()) { pose = p0 < 0.5 ? A : B; hatO = p0 < 0.5 ? fit(p0, 0.35, 0.5) : 1; }
      else if (p0 < 0.56) {
        pose = { ...A, y: A.y + 6 / innerHeight * EASE.between(fit(p0, 0.5, 0.56)) };
        hatO = fit(p0, 0.42, 0.5);
      } else {
        const k = EASE.between(fit(p0, 0.56, 1)), A6 = { ...A, y: A.y + 6 / innerHeight };
        pose = mix(A6, B, k);
        pose.y -= Math.sin(Math.PI * k) * 0.14;                       // the arc: up and over
        pose.ry += Math.PI * 2 * k;                                   // one full turn on the way
        pose.sy = lerp(A.sy, 1, EASE.between(fit(p0, 0.56, 0.75)));   // back to its own proportions as it lifts off
        drift = fit(p0, 0.85, 1);
      }
      pose.visible = p0 >= 0.35 && hatO > 0.001;
    } else if (act === 0) {
      pose = P1(); drift = 1;
    } else if (act === 1) {
      const a = P1(), tilt = { ...a, rx: a.rx - 8 * Math.PI / 180 };
      const m = { ...MOUTH, h: a.h };
      if (p2 < 0.1) pose = mix(a, tilt, EASE.cam(fit(p2, 0, 0.1)));
      else pose = mix(tilt, m, EASE.cam(fit(p2, 0.1, 0.2)));
      pose.s = lerp(1, 9, EASE.cam(fit(p2, 0.2, 0.8)));
      pose.visible = !(darkShown > 0.995 && p2 > 0.85);
      if (p2 >= 0.85 && darkShown > 0.995) { pose = stage.hatPose(); z = 5; }
    } else if (act === 2 || act === 3 || (act === 4 && p5 < 0.25)) {
      pose = stage.hatPose(); z = 5; drift = 0.3;
      if (act === 4) pose = { ...pose, s: Math.max(0.02, 1 - EASE.exit(fit(p5, 0, 0.25))) };   // the small hat sinks away before the way out
    } else if (act === 4) {
      const m = { ...MOUTH, h: UPRIGHT().h };
      pose = mix(m, UPRIGHT(), EASE.cam(fit(p5, 0.85, 1)));
      // the way out runs on the light ramp: the screen area the hat covers shrinks in step with the light
      // (area ∝ scale², so a linear scale would uncover all the paper in the last fifth of the ramp)
      hat.pose({ ...pose, s: 1 });
      const D1 = Math.max(1, hat.rect().width), WH = innerWidth * innerHeight, C1 = Math.min(1, Math.PI * D1 * D1 / 4 / WH);
      const A = C1 + (1 - C1) * darkShown;
      pose.s = Math.max(1, Math.sqrt(4 * A * WH / Math.PI) / D1);
    } else {
      pose = mix(UPRIGHT(), slotPose(), EASE.cam(fit(p6, 0, 0.5)));
    }
    canvas.style.zIndex = z;
    canvas.style.opacity = hatO < 1 ? hatO : '';
    hat.pose({ ...pose, drift: reduced() ? 0 : drift });
    let covered = false;
    if (act === 1 && p2 >= 0.25 && p2 <= 0.55) {
      capRange.selectNodeContents(cap2);   // the words themselves, not the full-width paragraph
      const L = hat.rect('lining'), c = capRange.getBoundingClientRect(), cx = L.left + L.width / 2, cy = L.top + L.height / 2, rx = L.width / 2, ry = L.height / 2;
      // every corner inside the lining's opening, and none yet reached by the dark growing from the mouth
      const mo = hat.mouth(), rd = Math.sqrt(darkShown) * Math.hypot(Math.max(mo.x, innerWidth - mo.x), Math.max(mo.y, innerHeight - mo.y)) * 1.05;
      const M = 24;   // the caption's own box plus a margin: the lining must fill all of it
      covered = rx > 0 && ry > 0 && [[c.left - M, c.top - M], [c.right + M, c.top - M], [c.left - M, c.bottom + M], [c.right + M, c.bottom + M]].every(([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 0.92 && Math.hypot(x - mo.x, y - mo.y) > rd + 24);
    }
    const capT = covered ? Math.min(1, 1 - fit(p2, 0.51, 0.55)) : 0, capStep = dt / 0.18;
    capShown = reduced() ? capT : capShown + clamp(capT - capShown, -capStep * 2, capStep);
    if (!covered) capShown = Math.min(capShown, 0);        // never shows outside the lining, not even while fading
    cap2.style.opacity = capShown; cap2.style.visibility = capShown > 0.001 ? 'visible' : 'hidden';
    if (act === 0 || act === 2 || act === 3 || (act < 0 && (phone || p0 >= 0.9))) hat.fitAway(textRects(), { inside: act <= 0 });
    if (act === 0) { const hr = hat.rect(); hint.style.left = (hr.left + hr.width / 2) + 'px'; hint.style.top = Math.min(innerHeight - 40, hr.bottom + 18) + 'px'; }

    /* the dark grows from (and shrinks back into) the hat's mouth */
    const m = hat.mouth(), r = Math.sqrt(darkShown) * Math.hypot(Math.max(m.x, innerWidth - m.x), Math.max(m.y, innerHeight - m.y)) * 1.05;
    dark.style.clipPath = darkShown >= 0.999 ? 'none' : `circle(${r}px at ${m.x}px ${m.y}px)`;
    dustC.style.clipPath = dark.style.clipPath;            // the dust lives only inside the dark
    dark.style.visibility = darkShown > 0.001 ? 'visible' : 'hidden';
    root.dataset.act = act + 1;
    root.classList.toggle("night", darkShown > 0.5);
    window.__mock.walk = { act: act + 1, p: +w.p.toFixed(3), y: Math.round(scrollY), total, dark: +darkShown.toFixed(3), darkT, stage: stage.index, busy: stage.busy, k3,
      film: { p0: +p0.toFixed(3), filmO, stillO, noHatO: +noHatO.toFixed(3), noHatS: +noHatS.toFixed(4), hatO: +hatO.toFixed(3), band: +phoneBand.toFixed(3), titleIn, waiting, playing: !fv.paused, t: +fv.currentTime.toFixed(3),
        frame: { left: fr.left, top: fr.top, width: fr.width, height: fr.height }, hatBox: filmHat, logoStill: logoS } };

    /* progress marks */
    if (act !== lastAct) { lastAct = act; marks.forEach((b, i) => b.setAttribute('aria-current', String(i === act))); }
    bar.style.transform = `scaleX(${clamp(y / (total * H))})`;
    $$('.w-bar b', root).forEach((b, i) => b.classList.toggle('on', i <= act));
  });

  const textRects = () => allTextRects(root);

  marks.forEach((b, i) => b.addEventListener('click', () => jump(i + 1)));
  $$('.w-bar b', root).forEach((b, i) => b.addEventListener('click', () => jump(i + 1)));
  document.addEventListener('click', e => {
    if (!active || e.target.closest('a, button, input, select, textarea, .mbar')) return;
    if (where(smoothY).act === 0 && hat.hit(e.clientX, e.clientY) && hat.trick()) { tapped = true; hint.classList.remove('on'); }
  });
  measure();
  return { start, stop, jump, measure, release, textRects, film: fv, get total() { return total; }, where: () => where(smoothY) };
}
