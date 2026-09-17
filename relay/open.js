/* The Open Track: one public room nobody needs a code for, its circuit
 * picked by the clock rather than by a host — a new one every hour, the
 * same for everyone who's on it, built the same way the daily time
 * trial's own circuit already is (relay/daily.js's design()), just
 * seeded by the hour instead of the day so the two never draw the same
 * shape from the same seed.
 *
 * The code itself is chosen from outside the alphabet makeCode() ever
 * draws from — no O in it — so a real hosted party can never collide
 * with this one by chance, and nobody has to reserve it.
 */
const { design } = require("./daily");

const NET_VER = 3;
const PAD_W = 1600, PAD_H = 1000, TAU = Math.PI * 2;
const OPEN_CODE = "OPEN";

function loop(cfg, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let rad = 1;
    for (const hh of cfg.h) rad += hh[0] * Math.sin(hh[1] * a + hh[2]);
    pts.push([+(PAD_W / 2 + Math.cos(a) * cfg.rx * rad).toFixed(2), +(PAD_H / 2 + Math.sin(a) * cfg.ry * rad).toFixed(2)]);
  }
  return pts;
}
function loopAt(cfg, n, size) {
  return loop(cfg, n).map((p) => [
    +(PAD_W / 2 + (p[0] - PAD_W / 2) * size).toFixed(2),
    +(PAD_H / 2 + (p[1] - PAD_H / 2) * size).toFixed(2),
  ]);
}

const openHour = () => Math.floor(Date.now() / 3_600_000);

/* Sized larger than a daily's own loop on purpose: a daily is scaled to
   suit one car's pace, and this has no one car to scale to — a kart and
   a Monster Truck are both out on it at once — so it errs toward the
   room a quick car actually wants room to use rather than the one a
   slow car does. No car is recorded against it either, for the same
   reason: nothing here should be read as "today's car" the way a
   daily's is. */
const SIZE = 1.55;
const made = new Map();
function openTrackFor(hour) {
  if (made.has(hour)) return made.get(hour);
  const cfg = design(hour);
  const t = {
    v: NET_VER,
    raw: loopAt(cfg, 140, SIZE),
    opts: { width: cfg.width, hills: cfg.hills, smooth: cfg.smooth, theme: cfg.theme,
            seed: cfg.seed, banks: cfg.banks, start: null, solid: false, car: null },
  };
  made.set(hour, t);
  /* this hour and the last are all that is ever wanted */
  for (const k of made.keys()) if (k < hour - 1) made.delete(k);
  return t;
}

module.exports = { OPEN_CODE, openHour, openTrackFor };
