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
    s3.enter(project >= 0 ? project : 0, { gate });
    window.__mock.workMode = '3d';
  }

  // the gallery (C2): «View the gallery», «Back to my seat», a portal chosen by its name, by a click on it, or with Enter
  galB.addEventListener('click', () => s3 && s3.gallery());
  seatB.addEventListener('click', () => s3 && s3.seat());
  portalsEl.addEventListener('focusin', e => { const b = e.target.closest('.k3-portal'); if (b && s3 && anState() === 'galeria') s3.turnToPortal(+b.dataset.k); });
  portalsEl.addEventListener('click', e => { const b = e.target.closest('.k3-portal'); if (b && s3) s3.choosePortal(+b.dataset.k); });
  prevB.addEventListener('click', () => s3 && s3.step(-1));
  nextB.addEventListener('click', () => s3 && s3.step(1));
  $('.k3-hats', root).addEventListener('click', e => { const b = e.target.closest('.k3-hat'); if (b && s3) s3.pick(+b.dataset.i); });
  c3.addEventListener('click', e => { if (!s3) return; const st = anState();
    if (st === 'galeria') { if (!s3.dragged) { const k = s3.portalAt(e.clientX, e.clientY); if (k >= 0) s3.choosePortal(k); } return; }
    if (st && st !== 'lugar') return; const i = s3.pickAt(e.clientX, e.clientY); if (i >= 0) s3.pick(i); });
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
    if (st === 'galeria' && e.key === 'Enter' && !e.target.closest('button, a')) { e.preventDefault(); s3.choosePortal(s3.focusedPortal()); }
    if ((st === 'galeria' || st === 'ida' || st === 'escolha') && e.key === 'Escape') { e.preventDefault(); s3.seat(); }
  });
  let sx = null;
  c3.addEventListener('pointerdown', e => { sx = e.clientX; });
  c3.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; const st = anState(); if (st && st !== 'lugar') return;   /* in the gallery a drag turns, never swaps */ if (Math.abs(dx) > 40 && s3) s3.step(dx < 0 ? 1 : -1); });
  c3.style.touchAction = 'pan-y';

  // the HTML that follows the 3D: arrows beside the screen, a button over each hat
  onFrame(() => {
    if (!active || mode !== '3d' || !s3) return;
    hat.pose({ x: 0.5, y: 0.5, h: 0.1, visible: false });       // the page's own hat stays out of the 3D stage
    const st = anState(), gal = st === 'galeria' || st === 'ida' || st === 'escolha' || st === 'volta';
    k3.classList.toggle('anfi', !!st); k3.classList.toggle('gallery', gal); k3.classList.toggle('opening', st === 'abertura' && !s3.anfiTextIn);   /* C2c: the title and buttons come in over the descent's last 400 ms */ c3.style.touchAction = gal ? 'none' : 'pan-y';
    galB.hidden = !(st === 'lugar') || !back.hidden; seatB.hidden = !gal; portalsEl.hidden = st !== 'galeria';
    // each portal's name: under its portal while it is in view; otherwise held at the edge on its side (← LING), so every portal can be
    // reached by Tab, by touch or by a click at any moment — focusing one turns the camera to it
    if (st === 'galeria') { const edgeY = { l: 0, r: 0 }; s3.portalPoints().forEach((q, k) => { const b = portalsEl.children[k], t = PROJECTS[k % PROJECTS.length].title;
      b.classList.toggle('focus', q.focus); b.hidden = false;
      if (q.on) { b.classList.remove('edge', 'left', 'right'); if (b.dataset.lbl !== 'c') { b.dataset.lbl = 'c'; b.textContent = t; } b.style.left = q.x + 'px'; b.style.top = Math.min(innerHeight - 90, q.bottom + 32) + 'px'; }   /* under the portal's own edge, however close the lens */
      else { const side = q.side < 0 ? 'l' : 'r'; b.classList.add('edge'); b.classList.toggle('left', side === 'l'); b.classList.toggle('right', side === 'r'); if (b.dataset.lbl !== side) { b.dataset.lbl = side; b.innerHTML = side === 'l' ? '<span aria-hidden="true">← </span>' + esc(t) : esc(t) + '<span aria-hidden="true"> →</span>'; }
        b.style.left = (side === 'l' ? 12 : innerWidth - 12) + 'px'; b.style.top = (innerHeight * 0.62 + edgeY[side]++ * 52) + 'px'; } }); }
    const r = s3.screenRect(), ph = isPhone(), midY = gal ? innerHeight / 2 : (r.top + r.bottom) / 2;
    if ((st === 'lugar' || (st === 'abertura' && s3.anfiTextIn)) && !ph) {   // C2b: the text starts 10 px under the screen; C2c: its left edge on the screen's
      text.style.setProperty('--k3-below', Math.round(r.bottom + 10) + 'px'); text.style.setProperty('--k3-left', Math.round(r.left) + 'px'); }
    if (gal) { prevB.disabled = nextB.disabled = false; prevB.setAttribute('aria-label', 'Turn left'); nextB.setAttribute('aria-label', 'Turn right'); prevB.style.cssText = `left:12px;top:${midY - 22}px`; nextB.style.cssText = `left:${innerWidth - 56}px;top:${midY - 22}px`; }
    else { prevB.setAttribute('aria-label', 'Previous work'); nextB.setAttribute('aria-label', 'Next work'); prevB.disabled = s3.index <= 0; nextB.disabled = s3.index >= s3.list.length - 1; }
    if (gal) {} else if (ph) { prevB.style.cssText = `left:${r.left + 6}px;right:auto;top:${midY - 22}px`; nextB.style.cssText = `left:${r.right - 50}px;right:auto;top:${midY - 22}px`; }   // on the screen's margins, clear of the hats
    else { prevB.style.cssText = `left:${Math.max(8, r.left - 56)}px;top:${midY - 22}px`; nextB.style.cssText = `left:${Math.min(innerWidth - 52, r.right + 12)}px;top:${midY - 22}px`; }
    for (const b of $$('.k3-hat', root)) {
      const h = s3.hats[+b.dataset.i], q = s3.project(h.position.clone().setY(h.position.y + 0.22)), sz = Math.max(44, Math.abs(s3.project(h.position.clone().setX(h.position.x + 0.33)).x - q.x) * 2);
      b.hidden = !h.visible || gal; b.style.cssText = `left:${q.x - sz / 2}px;top:${q.y - sz / 2}px;width:${sz}px;height:${sz}px`;
    }
    window.__mock.work3d = { index: s3.index, busy: s3.busy(), case: +s3.caseK.toFixed(2), title: s3.current && s3.current.title, state: st };
  });

  return {
    get stage() { return mode === '3d' ? { get target() { return s3.index; } } : flat.stage; },
    get s3() { return s3; }, get mode() { return mode; },
    ready() { return mode === '3d' && s3 && s3.ready ? s3.ready() : Promise.resolve(); },
    enter(project, gate) {
      active = true;
      if (ensure3D()) use3D(project, gate); else { if (!no3D() && !s3) slowNote = slowNote || 'This browser has no WebGL, so this is the flat version.'; useFlat(project); }
    },
    leave() { active = false; if (s3) s3.leave(); flat.leave(); document.documentElement.classList.remove('stage-lock'); },
    resetVisit() { flat.resetVisit(); seen = false; if (s3) s3.resetVisit(); }
  };
}
