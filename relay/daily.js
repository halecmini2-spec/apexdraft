/* The daily time trial.
 *
 * One circuit a day, the same for everyone, drawn here from the date so
 * that every machine builds exactly the same lap without anything being
 * stored: the day is the seed. Always the GT, every setting rolled with the
 * shape — width, hills, smoothing, scenery, and a few banked corners.
 *
 * The shape is a set of harmonics on an oval, which is how the board's own
 * opening shape is made. The amplitudes are kept modest so the loop stays
 * star-shaped, and a star-shaped loop cannot cross itself; the orders and
 * count of harmonics are what make it a circuit with somewhere between six
 * and a dozen corners rather than an oval or a scribble.
 */
const NET_VER = 3;
const PAD_W = 1600, PAD_H = 1000, TAU = Math.PI * 2;
const THEMES = ["alpine", "desert", "dusk"];

/* A small deterministic generator: the same day gives the same numbers on
   every relay that ever runs this. */
function rng(seed) {
  let a = (seed * 2654435761 + 1013904223) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dayIndex = () => Math.floor(Date.now() / 86_400_000);
const dayId = (d) => new Date(d * 86_400_000).toISOString().slice(0, 10);
const circuitKey = (d) => "daily_" + dayId(d).replace(/-/g, "");

function design(day) {
  const r = rng(day + 7);
  const pick = (lo, hi) => lo + (hi - lo) * r();
  const nH = 4 + (r() < 0.5 ? 1 : 0);                       // four or five harmonics
  const orders = [3, 4, 5, 6, 7].sort(() => r() - 0.5).slice(0, nH).sort((a, b) => a - b);
  let budget = pick(0.44, 0.56);                            // total amplitude, kept star-shaped
  const h = orders.map((k, i) => {
    const share = i === orders.length - 1 ? budget : budget * pick(0.35, 0.6);
    budget -= share;
    return [+share.toFixed(3), k, +pick(0, TAU).toFixed(3)];
  });
  const rx = Math.round(pick(330, 400)), ry = Math.round(pick(220, 280));
  const banks = [];
  for (let k = 0; k < 10; k++) banks.push(r() < 0.3 ? Math.round(pick(4, 14)) : null);
  return {
    rx, ry, h,
    width: Math.round(pick(10, 14)),
    hills: Math.round(pick(20, 75)),
    smooth: Math.round(pick(30, 60)),
    theme: THEMES[Math.floor(r() * THEMES.length)],
    seed: 1 + Math.floor(r() * 97),
    banks,
  };
}

function loop(cfg, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    let rad = 1;
    for (const hh of cfg.h) rad += hh[0] * Math.sin(hh[1] * a + hh[2]);
    pts.push([+(PAD_W / 2 + Math.cos(a) * cfg.rx * rad).toFixed(2), +(PAD_H / 2 + Math.sin(a) * cfg.ry * rad).toFixed(2)]);
  }
  return pts;
}

function trackFor(day) {
  const cfg = design(day);
  return {
    v: NET_VER,
    raw: loop(cfg, 120),
    opts: { width: cfg.width, hills: cfg.hills, smooth: cfg.smooth, theme: cfg.theme,
            seed: cfg.seed, banks: cfg.banks, start: null, solid: false, car: "gt" },
  };
}

function today() {
  const d = dayIndex();
  return { day: dayId(d), circuit: circuitKey(d), car: "gt", endsAt: (d + 1) * 86_400_000, track: trackFor(d) };
}

function makeDaily() {
  async function route(req, res, url) {
    if (url.pathname !== "/api/daily") return false;
    const { json, cors } = require("./auth");
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (req.method !== "GET") return json(res, 405, { error: "Not allowed." }), true;
    return json(res, 200, today()), true;
  }
  return { route, today, trackFor, circuitKey, dayIndex };
}

module.exports = { makeDaily, trackFor, circuitKey, dayIndex, design };
