/* mockup v6 — the page: three views by hash (#walkthrough, #home, #work), the first-visit rules, the door and its
   passage into the logo film, the lightbox and the mockup bar.
   v6.2: one wait — the door opens as soon as the film can play; the 3D hat finishes loading behind it. */
import { $, $$, onFrame, frameStats, log, esc, isShown, isPhone, clamp, lerp, EASE, coverBox } from './util.js';
import { asset, PROJECTS, ACT_NAMES, CLIENTS, FILM } from './data.js';
import { storageOK, readIntro, writeIntro, clearIntro } from './store.js';
import { createHat } from './hat.js';
import { createStage } from './stage.js';
import { createWalk } from './walk.js';
import { createWorkPage } from './work3d.js';
import { loadTheatre } from './theatre3d.js';
import { loadAnfi } from './anfi3d.js';
import { createHome } from './home.js';

const M = window.__mock = window.__mock || { log: [] };
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let forceReduced = null;
const reduced = () => forceReduced != null ? forceReduced : mq.matches;
const HOME_SECTIONS = ['selected-work', 'services', 'clients', 'studio', 'journal', 'contact'];
const views = { walkthrough: $('#v-walk'), home: $('#v-home'), work: $('#v-work') };
const door = $('#door'), film = $('.w-film-v'), canvas = $('#hatCanvas');
let hat, walk, work, home, view = null, settingHash = false, booted = false, pending = null;

$('.w6-mail').textContent = $('.h-mail').textContent = 'info@topperdigital.xyz';
$$('img[data-asset]').forEach(im => { im.src = asset(im.dataset.asset); });
$('.w4-grid').innerHTML = CLIENTS.map(([n, f], i) => `<li style="--i:${i}">${f ? `<img src="${asset('brand/clients/' + f)}" alt="${esc(n)}">` : `<b>${esc(n)}</b>`}</li>`).join('');

/* ── views ── */
function leaveView(next) { if (view && view !== next) { const m = { walkthrough: walk, home, work }[view]; if (m && m.leave) m.leave(); } }
function show(name, opts = {}) {
  if (!booted) { pending = [name, opts]; return; }
  leaveView(name);
  if (!opts.keepDoor) door.hidden = true;
  for (const k in views) views[k].hidden = k !== name;
  document.documentElement.dataset.view = name;
  view = name; M.view = name;
  const h = name === 'home' && opts.section ? opts.section : name;
  if (location.hash.slice(1) !== h) { settingHash = true; location.hash = h; }
  canvas.hidden = hat.kind === 'img';
  if (name === 'walkthrough') walk.start({ hold: !!opts.hold });
  if (name === 'home') home.enter(opts.section);
  if (name === 'work') work.enter(opts.project != null ? opts.project : -1, opts.gate);
  log({ name: 'view', view: name });
}
function go(name, opts = {}) {
  closeLightbox(true);
  if (name === 'skip') { writeIntro(); return show('home'); }
  if (name === 'replay') return replay();
  if (name === 'work' && view !== 'work' && stage === 'anfi' && !no3D) return throughTheDark(name, opts);
  show(name, opts);
}
/* C2b: into the amphitheatre through the site's dark — 350 ms down, the page changes and the stage gets ready (models, shaders, one
   frame drawn) behind it, 450 ms up on the arrival; only then may the silk start. Reduced motion: no fade down, 200 ms up. */
const veil = document.getElementById('veil');
function veilTo(o, ms) { return new Promise(res => { veil.style.transition = ms ? `opacity ${ms}ms cubic-bezier(.35,0,0,1)` : 'none'; void veil.offsetWidth; veil.style.opacity = String(o); setTimeout(res, ms + 20); }); }
let darkRun = 0;
async function throughTheDark(name, opts) {
  const id = ++darkRun, rm = reduced(); let open; const gate = new Promise(r => { open = r; });
  log({ name: 'veu-desce', start: performance.now() }); await veilTo(1, view && !rm ? 350 : 0); if (id !== darkRun) return;
  show(name, { ...opts, gate });
  await Promise.race([work.ready(), new Promise(r => setTimeout(r, 8000))]);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  log({ name: 'veu-sobe', start: performance.now() }); await veilTo(0, rm ? 200 : 450); open();
}
function replay() {
  if (reduced()) { $('#rmAsk').hidden = false; $('#rmAsk .btn').focus(); return; }
  show('walkthrough');                                  // starts at the film, frame 0
}
$('#rmAsk .btn').addEventListener('click', () => { $('#rmAsk').hidden = true; show('walkthrough'); });
$('#rmAsk .ghost').addEventListener('click', () => { $('#rmAsk').hidden = true; });
document.addEventListener('click', e => {
  const a = e.target.closest('[data-go]'); if (!a || a.closest('#v-home')) return;
  e.preventDefault(); go(a.dataset.go, a.dataset.section ? { section: a.dataset.section } : {});
});
addEventListener('hashchange', () => { if (settingHash) { settingHash = false; return; } route(location.hash.slice(1), false); });

/* ── first visit ── (spec §3) */
function route(h, first) {
  if (h === 'work') return show('work');
  if (h === 'home') return show('home');
  if (HOME_SECTIONS.includes(h)) return show('home', { section: h });
  if (h === 'walkthrough') return show('walkthrough');
  if (!first) return;
  if (reduced() || readIntro()) return show('home');
  openDoor();
}
function openDoor() {
  leaveView(null);
  for (const k in views) views[k].hidden = true;
  view = null; M.view = 'door'; delete document.documentElement.dataset.view;
  door.hidden = false; door.classList.toggle('wait', !filmOK);
  filmReady.then(() => { door.classList.remove('wait'); if (!door.hidden) $('.d-enter', door).focus({ preventScroll: true }); });
  log({ name: 'view', view: 'door' });
}
$('.d-enter', door).addEventListener('click', enterFilm);
$('.d-skip', door).addEventListener('click', e => { e.preventDefault(); door.hidden = true; go('skip'); });

/* «Enter» → the film, 900 ms (plan v6.2 §4): the flat logo moves in 600 ms (house curve) onto the logo of the film's frame 0
   (the measured box through the object-fit: cover sum), then for 300 ms the logo and the paper melt into the film, still on
   frame 0, which starts playing at the end. A logo is on screen in every frame. Phone and reduced motion: a 300 ms fade. */
let entering = false;
function enterFilm() {
  if (entering) return; entering = true;
  const img = $('img', door), row = $('.row', door), t0 = performance.now(), r0 = img.getBoundingClientRect();
  const fade = isPhone() || reduced(), MOVE = fade ? 0 : 600, FADE = 300;
  show('walkthrough', { keepDoor: true, hold: true });
  M.opening = { t0, mode: fade ? 'fade' : 'move', playedAt: null, from: plain(r0), to: null };
  film.addEventListener('playing', () => { M.opening.playedAt = performance.now() - t0; log({ name: 'film-playing', ms: Math.round(M.opening.playedAt) }); }, { once: true });
  log({ name: 'enter' });
  const off = onFrame((dt, now) => {
    const t = now - t0;
    row.style.opacity = 1 - clamp(t / 150);
    if (!fade) {
      const T = coverBox(FILM.logo0, FILM.vw, FILM.vh, innerWidth, innerHeight), k = EASE.between(clamp(t / MOVE));
      M.opening.to = T;
      img.style.transform = 'translate(' + lerp(0, T.left - r0.left, k) + 'px, ' + lerp(0, T.top - r0.top, k) + 'px) scale(' + lerp(1, T.width / r0.width, k) + ')';
    }
    door.style.opacity = 1 - clamp((t - MOVE) / FADE);
    if (t >= MOVE + FADE) {
      off(); door.hidden = true; door.style.opacity = ''; img.style.transform = ''; row.style.opacity = ''; entering = false;
      walk.release();
    }
  });
}

/* ── lightbox ── */
const lb = $('#lightbox'), lbv = $('#lbVideo');
let lastFocus = null;
function openLightbox(p) {
  lastFocus = document.activeElement;
  lbv.src = asset(p.clip); lbv.poster = asset(p.poster); $('#lbTitle').textContent = p.title + ' — ' + p.cat;
  lb.hidden = false; const pr = lbv.play(); if (pr && pr.catch) pr.catch(() => {});
  $('#lbClose').focus();
}
function closeLightbox(silent) {
  if (lb.hidden) return;
  lb.hidden = true; lbv.pause(); lbv.removeAttribute('src'); lbv.load();
  if (!silent && lastFocus) lastFocus.focus();
}
document.addEventListener('watch', e => openLightbox(e.detail));
$('#lbClose').addEventListener('click', () => closeLightbox());
addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

/* ── mockup bar ── */
const bar = $('#mbar');
$('.mb-toggle', bar).addEventListener('click', () => { const open = bar.classList.toggle('open'); $('.mb-toggle', bar).setAttribute('aria-expanded', String(open)); });
$('.mb-acts', bar).innerHTML = ACT_NAMES.map((n, i) => `<button type="button" data-act="${i + 1}" title="${n}">${i + 1}</button>`).join('');
$('.mb-acts', bar).addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (view !== 'walkthrough') show('walkthrough');
  requestAnimationFrame(() => walk.jump(+b.dataset.act));
});
$('.mb-reset', bar).addEventListener('click', () => {
  clearIntro(); work.resetVisit(); closeLightbox(true); scrollTo(0, 0);
  settingHash = true; history.replaceState(null, '', location.pathname); settingHash = false;
  openDoor();
});
const rmB = $('.mb-rm', bar);
rmB.addEventListener('click', () => { forceReduced = !reduced(); rmB.setAttribute('aria-pressed', String(forceReduced)); document.documentElement.classList.toggle('rm', forceReduced); });
// «No 3D» forces the flat Work page; «Yellow ending» puts act 6 on the signature yellow (#FFC718), in black
// «Stage» (three positions): the amphitheatre (the default, plan §15) → the theatre (§14) → the simple stage
let no3D = false, stage = 'anfi';
const STAGE_LABEL = { anfi: 'Stage: Amphitheatre', theatre: 'Stage: Theatre', simple: 'Stage: Simple' };
const no3dB = $('.mb-no3d', bar), yB = $('.mb-yellow', bar), thB = $('.mb-theatre', bar), acB = $('.mb-acam', bar), lgB = $('.mb-light', bar);
const reshow = () => { if (view === 'work') show('work', { project: Math.max(0, (work.s3 && work.s3.current) ? PROJECTS.indexOf(work.s3.current) : 0) }); };
thB.addEventListener('click', () => { stage = { anfi: 'theatre', theatre: 'simple', simple: 'anfi' }[stage]; thB.textContent = STAGE_LABEL[stage]; thB.setAttribute('aria-pressed', String(stage !== 'simple')); acB.hidden = lgB.hidden = stage !== 'anfi'; reshow(); });
// the amphitheatre's fixed cameras (C1) and its two lights, «aberto» ↔ «sessão» (a 1 200 ms fade)
acB.addEventListener('click', () => { const s = work.s3; if (!s || !s.anfiCam) return; const n = s.anfiCam(); acB.textContent = 'Camera: ' + { chegada: 'Chegada', lugar: 'Lugar', galeria: 'Galeria' }[n]; });
let sessao = true;
lgB.addEventListener('click', () => {
  const s = work.s3; if (!s || !s.anfiMix) return; sessao = !sessao; lgB.textContent = 'Light: ' + (sessao ? 'Sessão' : 'Aberto'); lgB.setAttribute('aria-pressed', String(sessao));
  const from = s.anfiMix() ?? (sessao ? 0 : 1), to = sessao ? 1 : 0, t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 1200); s.anfiMix(from + (to - from) * k * k * (3 - 2 * k)); if (k < 1) requestAnimationFrame(step); }; step();
});
no3dB.addEventListener('click', () => { no3D = !no3D; no3dB.setAttribute('aria-pressed', String(no3D)); if (view === 'work') show('work', { project: Math.max(0, (work.s3 && work.s3.current) ? PROJECTS.indexOf(work.s3.current) : 0) }); });
yB.addEventListener('click', () => { const on = document.documentElement.classList.toggle('yellow-end'); yB.setAttribute('aria-pressed', String(on)); if (on && hat) hat.setLook(0); });
const fpsB = $('.mb-fps', bar), fpsOut = $('.mb-fpsv', bar);
let fpsOn = false;
fpsB.addEventListener('click', () => { fpsOn = !fpsOn; fpsB.setAttribute('aria-pressed', String(fpsOn)); fpsOut.hidden = !fpsOn; });
onFrame(() => { if (fpsOn) fpsOut.textContent = frameStats.fps + ' fps'; });
document.documentElement.classList.toggle('rm', reduced());
mq.addEventListener?.('change', () => document.documentElement.classList.toggle('rm', reduced()));
if (!storageOK) $('#storageNote').hidden = false;

/* ── boot: the door shows at once; the hat (3D) loads behind it ── */
M.state = () => ({ view: M.view, walk: M.walk, mark: readIntro(), storageOK, reduced: reduced(), hat: hat && hat.kind });
M.go = go; M.jump = a => walk && walk.jump(a);
// test hooks: the hat's screen box, and every visible line of text with whether it is drawn above the hat (z-order)
const plain = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
M.hatVisible = () => !!(hat && hat.visible);
M.hatRect = () => (hat && hat.visible ? plain(hat.rect()) : null);
M.workStage = () => work.stage;
M.s3 = () => work.s3;
M.textRects = () => {
  const scope = views[view]; if (!scope) return [];
  const cz = +getComputedStyle(canvas).zIndex || 0, rg = document.createRange(), out = [];
  for (const el of scope.querySelectorAll('[data-text]')) {
    if (!isShown(el)) continue;
    let z = 0; for (let n = el; n && n !== scope; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.position !== 'static' && cs.zIndex !== 'auto') { z = +cs.zIndex; } }
    rg.selectNodeContents(el);
    for (const q of rg.getClientRects()) if (q.width > 2 && q.height > 2 && q.bottom > 0 && q.top < innerHeight) out.push({ ...plain(q), text: el.textContent.trim().slice(0, 30), above: z > cz });
  }
  return out;
};
/* ── the film loads first (the door waits for it), the hat behind it ── */
let filmOK = false;
film.src = film.dataset.src = asset(FILM.src()); film.load();
const filmReady = new Promise(res => {
  const ok = () => { if (filmOK) return; filmOK = true; M.filmReadyAt = performance.now(); log({ name: 'film-ready' }); res(); };
  if (film.readyState >= 3) ok(); else { film.addEventListener('canplay', ok, { once: true }); film.addEventListener('error', ok, { once: true }); setTimeout(ok, 10000); }
});
// the hat model is fetched by the page so the wait can show a progress line; ?slow3d=ms holds it back (tests only)
let hatP = 0;
const HAT_URL = new URL('../assets/hat-plain.glb.js', import.meta.url).href, SLOW = +new URLSearchParams(location.search).get('slow3d') || 0;
const source = (async () => {
  const res = await fetch(HAT_URL); if (!res.ok || !res.body) throw new Error('model ' + res.status);
  const total = +res.headers.get('content-length') || 2282928, rd = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; hatP = Math.min(0.9, got / total * 0.9) * (SLOW ? 0.3 : 1); }
  if (SLOW) { const s0 = performance.now(); while (performance.now() - s0 < SLOW) { await new Promise(r => setTimeout(r, 50)); hatP = 0.27 + 0.63 * (performance.now() - s0) / SLOW; } }
  const m = (await new Blob(parts).text()).match(/"([A-Za-z0-9+/=]+)"/); if (!m) throw new Error('model text');
  return m[1];
})();
// the modules start at once on a stand-in that becomes the real hat when it arrives
hat = hatProxy();
const walkStage = createStage($('.w-stagebg'), $('.w-stagefg'), { projects: PROJECTS.filter(p => p.walk), mode: 'walk', hat, reduced, onCase: i => go('work', { project: i }) });
walk = createWalk(views.walkthrough, { hat, stage: walkStage, canvas, reduced, go, hatReady: () => hat.kind !== 'pending', hatProgress: () => hatP });
work = createWorkPage(views.work, { hat, canvas, reduced, go, no3D: () => no3D, theatreOn: () => stage === 'theatre', anfiOn: () => stage === 'anfi' });
// the chosen stage downloads in the background, after the page has settled
setTimeout(() => (stage === 'anfi' ? new Promise(r => (window.requestIdleCallback || setTimeout)(r)).then(loadAnfi) : stage === 'theatre' ? loadTheatre() : Promise.resolve()).catch(() => {}), 1500);
home = createHome(views.home, { hat, canvas, reduced, go });
walk.leave = walk.stop;
onFrame(() => { if (view) hat.render(); });         // registered last: draws after every module has posed the hat
booted = true;
createHat(canvas, HAT_URL, { fallbackSrc: asset('brand/topper-icon-black.svg'), reduced, source }).then(h => {
  hat.attach(h); hatP = 1; canvas.hidden = h.kind === 'img';
  M.ready = true; M.hatReadyAt = performance.now(); document.documentElement.classList.add('ready'); log({ name: 'hat-ready' });
}).catch(e => { console.error('[mockup] boot', e); M.bootError = String(e); });

const first = location.hash.slice(1);
if (first) route(first, true);
else if (reduced() || readIntro()) show('home');
else openDoor();

function hatProxy() {
  let real = null, last = null;
  return {
    attach(h) { real = h; if (last) h.pose(last); },
    get kind() { return real ? real.kind : 'pending'; }, get height() { return real ? real.height : 1; }, get width() { return real ? real.width : 1; },
    pose(p) { last = p; if (real) real.pose(p); },
    fitAway(r, o) { return real ? real.fitAway(r, o) : 1; },
    mouth() { return real ? real.mouth() : { x: innerWidth / 2, y: innerHeight / 2 }; },
    rect(role) { return real ? real.rect(role) : new DOMRect(innerWidth / 2, innerHeight / 2, 0, 0); },
    get visible() { return real ? real.visible : false; },
    hit(x, y) { return real ? real.hit(x, y) : false; }, trick() { return real ? real.trick() : false; },
    setLook(k) { if (real) real.setLook(k); }, get look() { return real ? real.look : 0; },
    render() { if (real) real.render(); }
  };
}
