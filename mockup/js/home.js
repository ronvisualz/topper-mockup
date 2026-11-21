/* mockup v6 — the normal site: classic and fast, nothing pinned to the scroll. Sections rise 16 px once as they enter.
   The hat stands still in the hero and still changes what it is made of when tapped. */
import { $, $$, esc, onFrame, textRects, relLum, contrast, logoLuminance } from './util.js';
import { PROJECTS, CLIENTS, COPY, asset } from './data.js';

export function createHome(root, { hat, canvas, reduced, go }) {
  const sel = PROJECTS.filter(p => p.walk);
  $('.h-cards', root).innerHTML = sel.map(p => `
    <li class="h-card"><a href="#work" data-project="${PROJECTS.indexOf(p)}" aria-label="${esc(p.title)}, ${esc(p.cat)}: open on the stage">
      <span class="h-media"><img src="${asset(p.poster)}" alt="" loading="lazy"><video muted loop playsinline preload="none" data-src="${asset(p.clip)}" aria-hidden="true"></video></span>
      <span class="h-meta"><span class="lbl">${esc(p.cat)}</span><b>${esc(p.title)}</b><span class="mute">Placeholder — one line on what Topper made.</span></span></a></li>`).join('');
  $('.h-svcs', root).innerHTML = COPY.services.map(([t, d]) => `<li><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('');
  $('.h-logos', root).innerHTML = CLIENTS.map(([n, f]) => `<li>${f ? `<img src="${asset('brand/clients/' + f)}" alt="${esc(n)}">` : `<b>${esc(n)}</b>`}</li>`).join('');
  $('.h-studio img', root).src = asset('brand/magician.jpg');
  // on paper every logo needs ≥ 3:1; a logo that only exists in a light version goes on a dark pill
  const PAPER = relLum(0xe6, 0xe1, 0xdc), STAGE = relLum(0x0c, 0x0c, 0x10);
  $$('.h-logos img', root).forEach(img => {
    const judge = () => {
      const L = logoLuminance(img), onPaper = contrast(L, PAPER), pill = onPaper < 3;
      img.parentElement.classList.toggle('pill', pill);
      img.dataset.lum = L.toFixed(4); img.dataset.contrast = (pill ? contrast(L, STAGE) : onPaper).toFixed(2); img.dataset.bg = pill ? 'pill' : 'paper';
    };
    if (img.complete && img.naturalWidth) judge(); else img.addEventListener('load', judge, { once: true });
  });

  // cards: the clip plays on hover (or tap on touch: the first tap plays, the second opens the stage)
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  $$('.h-card a', root).forEach(a => {
    const v = $('video', a), on = yes => { if (yes) { if (!v.src) v.src = v.dataset.src; const p = v.play(); if (p && p.catch) p.catch(() => {}); a.classList.add('playing'); } else { v.pause(); a.classList.remove('playing'); } };
    v.addEventListener('playing', () => a.classList.add('ready'));
    if (fine) { a.addEventListener('mouseenter', () => on(true)); a.addEventListener('mouseleave', () => on(false)); a.addEventListener('focus', () => on(true)); a.addEventListener('blur', () => on(false)); }
    a.addEventListener('click', e => {
      e.preventDefault();
      if (!fine && !a.classList.contains('playing')) { on(true); return; }
      go('work', { project: +a.dataset.project });
    });
  });
  $$('[data-go]', root).forEach(a => a.addEventListener('click', e => { e.preventDefault(); go(a.dataset.go, a.dataset.section ? { section: a.dataset.section } : {}); }));

  // rise once on entering (the resting state is visible: only a 16 px offset, never hidden)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 }) : null;

  // contact: nothing is sent from the mockup
  const form = $('#hForm', root), st = $('#hStatus', root);
  form.addEventListener('submit', e => { e.preventDefault(); st.textContent = 'Mockup — nothing was sent'; });
  $('.h-copy', root).addEventListener('click', () => {
    const t = COPY.email, done = () => { $('.h-copy', root).textContent = 'Copied'; setTimeout(() => { $('.h-copy', root).textContent = 'Copy'; }, 1600); };
    try { navigator.clipboard.writeText(t).then(done, () => selectMail()); } catch (e) { selectMail(); }
  });
  function selectMail() { const r = document.createRange(); r.selectNodeContents($('.h-mail', root)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  // the hat in the hero
  const box = $('.h-hat', root);
  let active = false;
  onFrame(() => {
    if (!active) return;
    canvas.style.zIndex = 3;
    const r = box.getBoundingClientRect(), on = r.bottom > 0 && r.top < innerHeight;
    hat.pose({ x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight, h: Math.min(r.height, r.width * (hat.height || 1) / (hat.width || 1)) * 0.82 / innerHeight, rx: 0.16, ry: -0.55, rz: 0.1, visible: on, drift: 0 });
    if (on) hat.fitAway(textRects($('.h-hero', root)), { inside: true });
  });
  document.addEventListener('click', e => {
    if (!active || e.target.closest('a, button, input, select, textarea, label, .mbar')) return;
    if (hat.hit(e.clientX, e.clientY)) hat.trick();
  });

  return {
    enter(section) {
      active = true;
      $$('.h-sec', root).forEach(s => { if (io && !s.classList.contains('in')) io.observe(s); else s.classList.add('in'); });
      if (section) { const el = document.getElementById(section); if (el) requestAnimationFrame(() => el.scrollIntoView()); } else scrollTo(0, 0);
    },
    leave() { active = false; }
  };
}
