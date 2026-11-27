/* mockup v6.1 — the Work page on the 3D stage, with its HTML on top: label, title, line, «Watch the film» and «See the case study»
   at the bottom left; filters and the counter at the top; arrows by the screen; an invisible button over each hat (keyboard and touch).
   Falls back to the flat page (the 2D stage) without WebGL, below 24 fps for 2 s, or with «No 3D» in the mockup bar. */
import { $, $$, esc, onFrame, isPhone } from './util.js';
import { PROJECTS, FILTERS, PLACEHOLDER_LINE, asset } from './data.js';
import { createStage3D } from './stage3d.js';
import { createWork } from './work.js';

export function createWorkPage(root, { hat, canvas, reduced, go, no3D, theatreOn = () => false, anfiOn = () => false }) {
  const flat = createWork(root, { hat, canvas, reduced, go });     // the flat version (2D stage), also the fallback
  const k3 = $('.k3', root), c3 = $('.k3-canvas', root), note = $('.k3-note', root);
  $('.k3-top', root).insertAdjacentHTML('afterbegin', '<div class="k-filters" role="group" aria-label="Filter work">' +
    FILTERS.map(([k, l], i) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${i === 0}">${l}</button>`).join('') + '</div>');
  $('.k3-hats', root).innerHTML = PROJECTS.map((p, i) => `<button type="button" class="k3-hat" data-i="${i}" aria-label="Take ${esc(p.title)} out of its hat"></button>`).join('');
  const lbl = $('.k3-lbl', root), title = $('.k3-title', root), line = $('.k3-line', root), count = $('.k3-count', root), text = $('.k3-text', root);
  const prevB = $('.k3-prev', root), nextB = $('.k3-next', root), back = $('.k3-back', root);
  const galB = $('.k3-gal', root), seatB = $('.k3-seat', root), portalsEl = $('.k3-portals', root);
  // round E: the landing's hint (how to look, how to come closer), gone at the first move; the waiting sign in the hat's dark after 1 s
  k3.insertAdjacentHTML('beforeend', '<p class="k3-hint" hidden></p><p class="k3-wait" role="status" hidden>Loading<span>.</span><span>.</span><span>.</span></p><div class="k3-veil" aria-hidden="true"></div>');
  const hintEl = $('.k3-hint', root), waitEl = $('.k3-wait', root), veilEl = $('.k3-veil', root), hdrEl = $('.s-hdr', root);
  let veilOn = false, veilOp = 0, veilOpW = -1, veilH = -1;   // E3 (point 1): the veil at the top, see onFrame
  // its gradient is an image, drawn once here at the veil's own size (16 × 200 px; a 1 px-wide one was drawn as a flat band, no fade): a CSS
  // gradient's first draw over the canvas cost a 115–127 ms frame on a browser's first entry, and drawn early in the hat's dark instead it
  // made the cold entry ~130 ms longer; an image costs neither
  { const cv = document.createElement('canvas'); cv.width = 16; cv.height = 200; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 200);
    gr.addColorStop(0, 'rgba(12, 12, 16, .58)'); gr.addColorStop(0.7, 'rgba(12, 12, 16, .58)'); gr.addColorStop(1, 'rgba(12, 12, 16, 0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 200);
    veilEl.style.backgroundImage = `url(${cv.toDataURL()})`; veilEl.style.backgroundSize = '100% 100%'; }
  portalsEl.innerHTML = PROJECTS.map((p, i) => `<button type="button" class="k3-portal" data-k="${i}">${esc(p.title)}</button>`).join('');
  const anState = () => s3 && s3.anfi.mode ? s3.anfi.state : null;
  let s3 = null, mode = 'none', active = false, filter = 'all', seen = false, slowNote = '';

  function onShown(p, i, n) {
    lbl.textContent = p.cat; title.textContent = p.title; line.textContent = PLACEHOLDER_LINE;
    count.textContent = `${i + 1} / ${n}`;
    text.classList.remove('in'); void text.offsetWidth; text.classList.add('in');
    prevB.disabled = i <= 0; nextB.disabled = i >= n - 1;
    $('.c-name', root).textContent = p.title; $('.c-cat', root).textContent = p.cat;
    $$('.c-ba img', root).forEach(im => { if (im.getAttribute('src') !== asset(p.poster)) im.src = asset(p.poster); });
    $$('.k3-hat', root).forEach(b => b.setAttribute('aria-current', String(PROJECTS[+b.dataset.i] === p)));
  }
  function ensure3D() {
    if (no3D()) return null;               // «No 3D» wins even when the 3D stage already exists
    if (s3) return s3;
    s3 = createStage3D(c3, { projects: PROJECTS, reduced, onShown, theatreOn, anfiOn });
    if (s3) s3.onSlow(() => { slowNote = 'The 3D stage ran below 24 fps, so this is the flat version.'; useFlat(); });
    return s3;
  }
  function useFlat(project) {
    const i = s3 && s3.current ? PROJECTS.indexOf(s3.current) : project;
    mode = 'flat'; k3.hidden = true; if (s3) s3.leave();
    $('.k-stage', root).hidden = false; document.documentElement.classList.remove('stage-lock');
    note.hidden = !slowNote && !no3D(); note.textContent = no3D() ? 'Mockup: «No 3D» is on — this is the flat version.' : slowNote;
    flat.enter(i != null && i >= 0 ? i : 0);
    window.__mock.workMode = 'flat';
  }
  function use3D(project, gate) {
    mode = '3d'; k3.hidden = false; $('.k-stage', root).hidden = true; note.hidden = true; flat.leave();
    document.documentElement.classList.add('stage-lock'); back.hidden = true; scrollTo(0, 0);
    filter = 'all'; $$('.k3 .k-filters button', root).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.f === 'all')));
    s3.filterNow && s3.filterNow(PROJECTS);
    s3.enter(project >= 0 ? project : 0, { gate, carried: project >= 0 });   // round E: a work brought by the page comes out of a hat on landing
    window.__mock.workMode = '3d';
  }

  // the gallery (C2): «View the gallery», «Back to my seat», a portal chosen by its name, by a click on it, or with Enter
  galB.addEventListener('click', () => s3 && s3.gallery());
  seatB.addEventListener('click', () => s3 && s3.lookAround());   // round E: «Look around» — from «ver» back to the 360°
  portalsEl.addEventListener('focusin', e => { const b = e.target.closest('.k3-portal'); if (b && s3 && anState() === 'galeria') s3.turnToPortal(+b.dataset.k); });
  portalsEl.addEventListener('click', e => { const b = e.target.closest('.k3-portal'); if (b && s3) s3.choosePortal(+b.dataset.k); });
  prevB.addEventListener('click', () => s3 && s3.step(-1));
  nextB.addEventListener('click', () => s3 && s3.step(1));
  $('.k3-hats', root).addEventListener('click', e => { const b = e.target.closest('.k3-hat'); if (b && s3) s3.pick(+b.dataset.i); });
  // round E: in the 360° a hat (the next work comes out of it), a portal, or the screen (straight to «ver»); in «ver» a hat
  c3.addEventListener('click', e => { if (!s3) return; const st = anState(), x = e.clientX, y = e.clientY;
    if (st === 'galeria') { if (s3.dragged) return; const h = s3.pickAt(x, y); if (h >= 0) { s3.pick(h); return; } const k = s3.portalAt(x, y); if (k >= 0) { s3.choosePortal(k); return; } if (s3.screenAt(x, y)) s3.toView(); return; }
    if (st && st !== 'lugar' && st !== 'ver') return; const i = s3.pickAt(x, y); if (i >= 0) s3.pick(i); });
  $('.k3 .k-filters', root).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !s3 || b.dataset.f === filter) return;
    filter = b.dataset.f; $$('.k3 .k-filters button', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    s3.filter(PROJECTS.filter(p => filter === 'all' || p.tab === filter));
  });
  $('.k3 .st-watch', root).addEventListener('click', () => { if (s3 && s3.current) document.dispatchEvent(new CustomEvent('watch', { detail: s3.current })); });
  $('.k3 .st-case', root).addEventListener('click', e => { e.preventDefault(); if (!s3) return; s3.caseStudy(true).then(() => { document.documentElement.classList.remove('stage-lock'); back.hidden = false; back.focus({ preventScroll: true }); }); });
  back.addEventListener('click', () => { scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); back.hidden = true; document.documentElement.classList.add('stage-lock'); s3 && s3.caseStudy(false); });
  addEventListener('keydown', e => {
    if (!active || mode !== '3d' || document.getElementById('lightbox').hidden === false || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); s3.step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); s3.step(-1); }
    const st = anState();
    if (st === 'galeria' && e.key === 'Enter' && !e.target.closest('button, a')) { e.preventDefault(); const k = s3.focusedPortal(); if (k >= 0) s3.choosePortal(k); else s3.toView(); }   // round E: no portal in focus: straight to «ver»
    if (st === 'ver' && e.key === 'Escape') { e.preventDefault(); if (!back.hidden) back.click(); else s3.lookAround(); }   // round E: Esc in «ver» looks around (the seat is gone); E2 (minor 11): the case study open, Esc closes it first
  });
  let sx = null;
  c3.addEventListener('pointerdown', e => { sx = e.clientX; });
  c3.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; const st = anState(); if (st && st !== 'lugar' && st !== 'ver') return;   /* in the gallery a drag turns, never swaps; in «ver» it swaps */ if (Math.abs(dx) > 40 && s3) s3.step(dx < 0 ? 1 : -1); });
  c3.style.touchAction = 'pan-y';

  // the HTML that follows the 3D: arrows beside the screen, a button over each hat
  onFrame(dt => {
    if (!active || mode !== '3d' || !s3) return;
    hat.pose({ x: 0.5, y: 0.5, h: 0.1, visible: false });       // the page's own hat stays out of the 3D stage
    const st = anState(), gal = st === 'galeria' || st === 'ida' || st === 'escolha' || st === 'volta';
    k3.classList.toggle('anfi', !!st); k3.classList.toggle('gallery', gal); k3.classList.toggle('opening', st === 'entrada');   /* round E: no text or controls over the hat, the dive and the descent */ c3.style.touchAction = gal ? 'none' : 'pan-y';
    // round E: no «View the gallery» (the page opens in the 360°); «Look around» in «ver», not over the case study
    // E3 (the creative chat's point 2b): on a phone no portal names until the first move — the film, its category and title, the hint
    galB.hidden = true; seatB.hidden = st !== 'ver' || !back.hidden; portalsEl.hidden = st !== 'galeria' || (isPhone() && s3.anfiHint);
    // each portal's name: under its portal while it is in view; otherwise held at the edge on its side (← LING), so every portal can be
    // reached by Tab, by touch or by a click at any moment — focusing one turns the camera to it
    // E2 (the 100 % proofs): the names held at the edges start under the title line when it shows (on a phone they came up against it)
    const lineOn = text.classList.contains('show'), lineBox = lineOn ? text.getBoundingClientRect() : null, edgeTop = Math.max(innerHeight * 0.62, lineBox ? lineBox.bottom + 30 : 0);
    // E3 (point 2a): the work on the screen is never a name held at the edge — its title is already under the screen
    if (st === 'galeria') { const edgeY = { l: 0, r: 0 }, curT = s3.current && s3.current.title; s3.portalPoints().forEach((q, k) => { const b = portalsEl.children[k], t = PROJECTS[k % PROJECTS.length].title;
      b.classList.toggle('focus', q.focus); b.hidden = q.inList === false; if (b.hidden) return;   // the final review: a portal filtered out has no name
      // the work on the screen held at the edge: not seen, no place in the column, still reached by Tab (E's criterion 6) — focused, it shows
      const quiet = !q.on && t === curT && document.activeElement !== b; b.classList.toggle('cur', quiet);
      if (q.on) { b.classList.remove('edge', 'left', 'right'); if (b.dataset.lbl !== 'c') { b.dataset.lbl = 'c'; b.textContent = t; } b.style.left = q.x + 'px'; b.style.top = Math.min(innerHeight - 90, q.bottom + 32) + 'px'; }   /* under the portal's own edge, however close the lens */
      else { const side = q.side < 0 ? 'l' : 'r'; b.classList.add('edge'); b.classList.toggle('left', side === 'l'); b.classList.toggle('right', side === 'r'); if (b.dataset.lbl !== side) { b.dataset.lbl = side; b.innerHTML = side === 'l' ? '<span aria-hidden="true">← </span>' + esc(t) : esc(t) + '<span aria-hidden="true"> →</span>'; }
        b.style.left = (side === 'l' ? 12 : innerWidth - 12) + 'px'; b.style.top = (edgeTop + edgeY[side] * 52) + 'px'; if (!quiet) edgeY[side]++; } }); }
    const r = s3.screenRect(), ph = isPhone(), midY = gal ? innerHeight / 2 : (r.top + r.bottom) / 2;
    if ((st === 'lugar' || st === 'ver') && !ph) {   // C2b: the text starts 10 px under the screen; C2c: its left edge on the screen's (round E: in «ver» too — never on the film)
      text.style.setProperty('--k3-below', Math.round(r.bottom + 10) + 'px'); text.style.setProperty('--k3-left', Math.round(r.left) + 'px'); }
    // E2 (the creative chat's point 4): in the 360°, while the screen is in the frame (≥ 60 % of it in the window, room under it), the work's
    // category and title under it — no buttons, never on the film; gone as the screen leaves the frame
    // the final review of E2: compact on the whole 360° side (going, choosing, coming back too) — out of it the full block (its line and
    // buttons) showed while it faded, and its buttons took clicks in the flight; shown with hysteresis (on at ≥ 60 % of the screen, off under
    // 55 %; its bottom 24 px clear to come on, 16 px to stay), measured with its real height — no flicker at the gate
    const was = text.classList.contains('show'), lh = text.offsetHeight || 48, vis = st === 'galeria' ? s3.screenVisible() : 0;
    const showLine = st === 'galeria' && vis >= (was ? 0.55 : 0.6) && r.bottom + 10 + lh <= innerHeight - (was ? 16 : 24);
    text.classList.toggle('compact', gal); text.classList.toggle('show', showLine);
    if (showLine) { text.style.setProperty('--k3-below', Math.round(r.bottom + 10) + 'px'); text.style.setProperty('--k3-left', Math.round(Math.max(16, r.left)) + 'px'); }
    // E3 (the creative chat's point 1): in the 360° the menu never depends on the film — the filters and the counter on solid pills (CSS,
    // .in360), and while the screen is behind the header a veil of the stage's colour at the top, never past the visible film's top quarter;
    // on and off with hysteresis (on with the screen behind ≥ 6 % of the header's band, off under 2 %), its opacity stepped ≤ 0.08 a frame
    // (~200 ms; at once in reduced motion); its height is a scale of a fixed gradient (no repaint)
    const in360 = st === 'galeria'; k3.classList.toggle('in360', in360);
    let vh = -1, hb = 0;
    if (in360) { hb = hdrEl.getBoundingClientRect().bottom; const f = s3.screenBehind(0, hb);
      veilOn = veilOn ? f >= 0.02 : f >= 0.06;
      const sp = s3.screenSpan(); if (sp) vh = Math.max(0, Math.min(hb + 24, sp.top + (sp.bottom - sp.top) * 0.25)); } else veilOn = false;   // no span (a point behind the camera): the height holds
    const stp = reduced() ? 1 : Math.min(0.08, dt * 5); veilOp += Math.max(-stp, Math.min(stp, (veilOn ? 1 : 0) - veilOp));
    if (veilOn && vh >= 0 && Math.abs(vh - veilH) > 0.5) { veilH = vh; veilEl.style.transform = `scaleY(${(vh / 200).toFixed(4)})`; }
    if (veilOp !== veilOpW) { veilOpW = veilOp; veilEl.style.opacity = veilOp.toFixed(3); }
    veilEl.classList.toggle('on', veilOn);
    // the final review (I1): looking down, the film's top quarter falls short of the menu — then the menu takes the pills too (the plan's own
    // branch): on while the veil's solid part (its top 70 %) ends above the header's foot, off once it reaches 8 px past it
    const solid = veilOn && veilH > 0 ? veilH * 0.7 : 0, short = veilOn && (hdrEl.classList.contains('veil-short') ? solid < hb + 8 : solid < hb - 8);
    hdrEl.classList.toggle('veil-short', short);
    if (gal) { prevB.disabled = nextB.disabled = false; prevB.setAttribute('aria-label', 'Turn left'); nextB.setAttribute('aria-label', 'Turn right'); prevB.style.cssText = `left:12px;top:${midY - 22}px`; nextB.style.cssText = `left:${innerWidth - 56}px;top:${midY - 22}px`; }
    else { prevB.setAttribute('aria-label', 'Previous work'); nextB.setAttribute('aria-label', 'Next work'); prevB.disabled = s3.index <= 0; nextB.disabled = s3.index >= s3.list.length - 1; }
    if (gal) {} else if (ph) { prevB.style.cssText = `left:${r.left + 6}px;right:auto;top:${midY - 22}px`; nextB.style.cssText = `left:${r.right - 50}px;right:auto;top:${midY - 22}px`; }   // on the screen's margins, clear of the hats
    else { prevB.style.cssText = `left:${Math.max(8, r.left - 56)}px;top:${midY - 22}px`; nextB.style.cssText = `left:${Math.min(innerWidth - 52, r.right + 12)}px;top:${midY - 22}px`; }
    for (const b of $$('.k3-hat', root)) {
      const h = s3.hats[+b.dataset.i], q = s3.project(h.position.clone().setY(h.position.y + 0.22)), sz = Math.max(44, Math.abs(s3.project(h.position.clone().setX(h.position.x + 0.33)).x - q.x) * 2);
      // round E: in the 360° too (a hat clicked: the next work comes out of it) — only a hat in front of the camera and inside the window
      const front = h.position.clone().sub(s3.camera.position).dot(s3.camera.getWorldDirection(h.position.clone())) > 0, inView = front && q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight;
      if (st && b.dataset.lbl !== 'e') { b.dataset.lbl = 'e'; b.setAttribute('aria-label', 'Take the next work out of this hat'); }   // round E: a hat is no work's in the amphitheatre
      b.hidden = !h.visible || (gal && st !== 'galeria') || st === 'entrada' || (!!st && !inView); b.style.cssText = `left:${q.x - sz / 2}px;top:${q.y - sz / 2}px;width:${sz}px;height:${sz}px`;
    }
    // round E: the hint after landing (until the first move), the waiting sign after 1 s of the hat's dark
    const ht = isPhone() ? 'Swipe to look around · tap the screen to get closer' : 'Drag to look around · click the screen to get closer';
    if (hintEl.textContent !== ht) hintEl.textContent = ht; hintEl.hidden = !s3.anfiHint; waitEl.hidden = !(s3.anfiDarkFor > 1000);
    window.__mock.work3d = { index: s3.index, busy: s3.busy(), case: +s3.caseK.toFixed(2), title: s3.current && s3.current.title, state: st };
  });

  return {
    get stage() { return mode === '3d' ? { get target() { return s3.index; } } : flat.stage; },
    get s3() { return s3; }, get mode() { return mode; },
    get intro() { return mode === '3d' && !!s3 && !!s3.anfiIntro; },   // round E: the hat is on — the page lifts its veil on it at once
    ready() { return mode === '3d' && s3 && s3.ready ? s3.ready() : Promise.resolve(); },
    enter(project, gate) {
      active = true;
      if (ensure3D()) use3D(project, gate); else { if (!no3D() && !s3) slowNote = slowNote || 'This browser has no WebGL, so this is the flat version.'; useFlat(project); }
    },
    leave() { active = false; if (s3) s3.leave(); flat.leave(); document.documentElement.classList.remove('stage-lock'); },
    resetVisit() { flat.resetVisit(); seen = false; if (s3) s3.resetVisit(); }
  };
}
