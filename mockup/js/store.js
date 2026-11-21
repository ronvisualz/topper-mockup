/* mockup v6 — the first-visit mark. localStorage key tp_intro = {"v":6,"t":<ms>}; valid 180 days and while v is 6.
   No IP, no personal data. Every access is guarded: a blocked store just means "first visit" every time. */
const KEY = 'tp_intro', V = 6, TTL = 180 * 864e5;

export let storageOK = true;
try { const k = '__tp_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); } catch (e) { storageOK = false; }

export function readIntro() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!m || m.v !== V || !(Date.now() - m.t < TTL)) return null;
    return m;
  } catch (e) { return null; }
}
export function writeIntro() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: V, t: Date.now() })); return true; } catch (e) { return false; }
}
export function clearIntro() {
  try { localStorage.removeItem(KEY); } catch (e) { /* nothing stored, nothing to clear */ }
}
