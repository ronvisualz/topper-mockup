/* topper. mockup v6 — round E of the amphitheatre (E-DESIGN): the pure logic of the new Work page, with no three.js (tested in Node by
   mockup/tools/test-anfie.mjs). Angles in degrees, positions as [x, y, z] in the amphitheatre's metres (the screen at z −7.9). */

// the hat a trick comes out of: any of the n, never the one before (prev −1: none yet)
export function pickHat(prev, n = 4, rnd = Math.random) {
  if (n <= 1) return 0;
  if (prev < 0 || prev >= n) return Math.min(n - 1, Math.floor(rnd() * n));
  const k = Math.min(n - 2, Math.floor(rnd() * (n - 1)));
  return k >= prev ? k + 1 : k;
}

// yaw and pitch from a point to another, in the gallery's convention (stage3d poseOf('galeria')):
// look = pos + (sin y·cos p, sin p, −cos y·cos p) — yaw 0 faces the screen (−z), positive turns toward +x
export function aimAt(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const rad = 180 / Math.PI;
  return { yaw: Math.atan2(dx, -dz) * rad, pitch: Math.atan2(dy, Math.hypot(dx, dz)) * rad };
}

// the short descent into the amphitheatre (E-DESIGN «Entrada»): out of the hat's dark 22 m over the stage looking straight down through the
// shell's opening, then three jumps with short holds between them; in the last one the gaze rises from the floor to the screen and the
// camera settles at eye height in the centre (the gallery's place). ms 0 → 2100 (E2); ease: the house curve (EASE.cam), linear in the tests.
// Round E2 (the creative chat's point 2, options a + b): no pause at 5 m — the last jump starts as the second ends (2 100 ms in all); and
// the gaze starts to rise in the second jump, once the camera is below the shell's crest (9.2 m: above it the island's edge would show),
// from straight down to −45° at 5 m, then up to the screen in the last jump — the water's mirror leaves the frame's centre
const JUMPS = [{ t0: 0, t1: 500, y0: 22, y1: 12 }, { t0: 650, t1: 1150, y0: 12, y1: 5 }, { t0: 1150, t1: 2100, y0: 5, y1: 1.9, look: true }];
const CREST = 9.2, PITCH_5M = -45;   // E2: −55 in the plan left the frame's lower centre on the water (16–36 %)
export const DESCENT_MS = 2100, LAST_JUMP_MS = 1150;
export function descentAt(ms, ease = t => t) {
  let y = JUMPS[0].y0, pitch = -90;
  for (const j of JUMPS) {
    if (ms < j.t0) break;
    const k = ease(Math.min(1, (ms - j.t0) / (j.t1 - j.t0)));
    y = j.y0 + (j.y1 - j.y0) * k;
    pitch = j.look ? PITCH_5M + (0 - PITCH_5M) * k : y > CREST ? -90 : -90 + (PITCH_5M + 90) * Math.min(1, (CREST - y) / (CREST - 5));
  }
  return { pos: [0, y, 0], pitch };
}

// a wheel event → the turn it asks for. Two fingers on a touchpad come in pixels (deltaMode 0): across turns, along tilts (a swipe up
// looks up); a classic mouse wheel comes in lines (deltaMode 1): it turns, step by step; a pinch comes with ctrlKey: the lens only
// The final review: Chrome, Edge and Safari report a mouse wheel's notch in pixels too (deltaMode 0, deltaY ±100, wheelDeltaY ∓120) — a
// notch is told from two fingers by being vertical only, large and whole (and, where the browser gives it, a multiple of 120 in
// wheelDeltaY): it turns as a line does, 12° for 100 px (three lines)
export function wheelLook(e, k = { perPx: 0.15, perLine: 4, fovPerPx: 0.05 }) {
  if (e.ctrlKey) return { dyaw: 0, dpitch: 0, dfov: (e.deltaY || 0) * k.fovPerPx };
  if (e.deltaMode === 1) return { dyaw: (e.deltaY || e.deltaX || 0) * k.perLine, dpitch: 0, dfov: 0 };
  const dy = e.deltaY || 0, notch = !e.deltaX && Math.abs(dy) >= 50 && (e.wheelDeltaY != null ? e.wheelDeltaY !== 0 && e.wheelDeltaY % 120 === 0 : Number.isInteger(dy));
  if (notch) return { dyaw: dy * k.perLine * 3 / 100, dpitch: 0, dfov: 0 };
  return { dyaw: (e.deltaX || 0) * k.perPx, dpitch: -(e.deltaY || 0) * k.perPx, dfov: 0 };
}
