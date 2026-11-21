/* mockup v6 — the Work page: the stage with all four works, filters, a list, arrows, ← → keys and swipe;
   the case study below (placeholders only). The first entry in a visit opens with «da cartola», later ones open the curtains (400 ms). */
import { $, $$, esc, onFrame, Timeline, EASE, textRects } from './util.js';
import { PROJECTS, FILTERS, asset } from './data.js';
import { createStage } from './stage.js';

export function createWork(root, { hat, canvas, reduced, go }) {
  const stage = createStage($('.k-stagebg', root), $('.k-stagefg', root), { projects: PROJECTS, mode: 'work', hat, reduced, onCase: i => scrollToCase() });
  const fg = stage.fg;
  $('.st-top', fg).innerHTML = '<div class="k-filters" role="group" aria-label="Filter work">' +
    FILTERS.map(([k, l], i) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${i === 0}">${l}</button>`).join('') + '</div>';
  fg.insertAdjacentHTML('beforeend', '<button type="button" class="k-arrow prev" aria-label="Previous work">←</button><button type="button" class="k-arrow next" aria-label="Next work">→</button>');
  const listEl = $('.st-list', fg), prevB = $('.k-arrow.prev', fg), nextB = $('.k-arrow.next', fg);
  let filter = 'all', seen = false, active = false;
  const filtered = () => PROJECTS.filter(p => filter === 'all' || p.tab === filter);

  function drawList() {
    const l = stage.list, cur = stage.current();
    listEl.innerHTML = '<ol aria-label="Works">' + l.map((p, i) => `<li><button type="button" data-i="${i}" aria-current="${p === cur}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(p.title)}</button></li>`).join('') + '</ol>';
    prevB.disabled = stage.target <= 0; nextB.disabled = stage.target >= l.length - 1;
    const p = cur || l[0];
    $('.c-name', root).textContent = p.title;
    $('.c-cat', root).textContent = p.cat;
    $$('.c-ba img', root).forEach(im => { if (im.getAttribute('src') !== asset(p.poster)) im.src = asset(p.poster); });
  }
  function step(d) {
    const i = Math.max(0, Math.min(stage.list.length - 1, stage.target + d));
    if (i !== stage.target) stage.silkTo(i, d);
  }
  prevB.addEventListener('click', () => step(-1));
  nextB.addEventListener('click', () => step(1));
  listEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { const i = +b.dataset.i; stage.silkTo(i, i > stage.target ? 1 : -1); } });
  $('.k-filters', fg).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.f === filter) return;
    filter = b.dataset.f; $$('.k-filters button', fg).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    stage.replaceList(filtered(), 1);
  });
  addEventListener('keydown', e => {
    if (!active || document.getElementById('lightbox').hidden === false || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  // swipe on the screen
  let sx = null;
  const scrWrap = $('.st-scr-wrap', fg);
  scrWrap.addEventListener('pointerdown', e => { sx = e.clientX; });
  scrWrap.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); });
  scrWrap.style.touchAction = 'pan-y';

  // the curtains opening (later entries in the visit): 400 ms
  const curtTL = new Timeline('curtains', 400, t => stage.setCurtains(1 - EASE.between(t / 400)));
  // before / after comparison
  const ba = $('.c-ba', root), range = $('#baRange', root);
  range.addEventListener('input', () => ba.style.setProperty('--cut', range.value + '%'));

  function scrollToCase() { $('.c-case', root).scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); }

  onFrame(() => {
    if (!active) return;
    canvas.style.zIndex = 5;
    const inView = scrollY < innerHeight * 0.9;
    hat.pose({ ...stage.hatPose(), visible: inView, drift: reduced() ? 0 : 0.3 });
    if (inView) hat.fitAway([...textRects(fg), ...$$('.st-list button', fg).map(el => el.getBoundingClientRect())]);
    drawListIfChanged();
  });
  let lastSig = '';
  function drawListIfChanged() { const sig = stage.target + '|' + (stage.current() && stage.current().title) + '|' + stage.list.length; if (sig !== lastSig) { lastSig = sig; drawList(); } }

  return {
    stage,
    enter(project) {
      active = true; scrollTo(0, 0);
      filter = 'all'; $$('.k-filters button', fg).forEach(x => x.setAttribute('aria-pressed', String(x.dataset.f === 'all')));
      stage.setList(PROJECTS); stage.layout(); stage.setLights(1); stage.setRoom(0); stage.collapse(false);
      const i = project >= 0 ? project : 0;
      if (!seen) { seen = true; stage.cut(-1); stage.setCurtains(0); requestAnimationFrame(() => stage.goTo(i)); }
      else { stage.cut(i); if (reduced()) stage.setCurtains(0); else { stage.setCurtains(1); curtTL.set(0); curtTL.play(1); } }
      lastSig = '';
    },
    leave() { active = false; },
    get seen() { return seen; }, resetVisit() { seen = false; }
  };
}
