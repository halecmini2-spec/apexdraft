/* The daily time trial.
 *
 * One circuit a day, the same for everyone, drawn here from the date so
 * that every machine builds exactly the same lap without anything being
 * stored: the day is the seed. The car changes with the day too, and the
 * circuit is sized to suit it — a kart gets a short one and a V12 a long
 * one, so a good lap is about the same length of time whatever is being
 * driven. Every other setting is rolled with the shape: width, hills,
 * smoothing, scenery, and a few banked corners.
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

/* ---- which car, and how big a lap of it ----
   Every car comes up once a week, in an order the week itself decides, so
   nobody gets the kart twice running and nobody waits a month for it.
   Whichever it is, the loop is then scaled until a good lap of it takes
   about the same time as a good lap of any other. */
const DAILY_CARS = ["gt", "formula", "yaris", "kart", "bike", "trike", "v12"];
function carFor(day) {
  const week = Math.floor(day / DAILY_CARS.length);
  const r = rng(week + 4241);
  const bag = DAILY_CARS.slice();
  /* a shuffle the week decides, dealt one a day */
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag[((day % bag.length) + bag.length) % bag.length];
}

/* What a strong lap actually takes, against what the verifier says is the
   quickest one possible. Measured across all seven cars on this very
   generator: a machine at full strength comes in at 1.15 times the bound,
   near enough the same multiple for every one of them, which is what makes
   the bound usable as a stopwatch here rather than only as a limit. */
const PACE = 1.15;
const TARGET = 45;                 // seconds for that strong lap
const SIZE_LO = 0.45, SIZE_HI = 2.10;

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

/* the loop drawn about its own middle at a given size */
function loopAt(cfg, n, size) {
  return loop(cfg, n).map((p) => [
    +(PAD_W / 2 + (p[0] - PAD_W / 2) * size).toFixed(2),
    +(PAD_H / 2 + (p[1] - PAD_H / 2) * size).toFixed(2),
  ]);
}

/* How long a strong lap of a given size would take, in seconds. Built the
   way the client will build it and judged by the same model the relay uses
   to refuse impossible laps, so the two can never drift apart. */
function paceOf(cfg, size, car) {
  const { centreline } = require("./geom");
  const { lapBound } = require("./verify");
  const opts = { width: cfg.width, hills: cfg.hills, smooth: cfg.smooth, theme: cfg.theme,
                 seed: cfg.seed, banks: cfg.banks, start: null, solid: false, car };
  const C = centreline(loopAt(cfg, 120, size), opts, 1);
  if (!C || !C.len) return null;
  return (lapBound(C, car) / 1000) * PACE;
}

/* Shrink it for a slow car and stretch it for a quick one. Bisection rather
   than a formula, because the two do not scale together: a smaller loop is
   a tighter loop, so halving the length takes rather more than half the
   time out of the lap. Sixteen steps settles it to well under a second. */
function sizeFor(cfg, car) {
  let lo = SIZE_LO, hi = SIZE_HI;
  const at = (x) => paceOf(cfg, x, car);
  if (at(lo) > TARGET) return lo;                 // already as small as it goes
  if (at(hi) < TARGET) return hi;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const t = at(mid);
    if (t == null) break;
    if (t < TARGET) lo = mid; else hi = mid;
  }
  return +((lo + hi) / 2).toFixed(4);
}

/* One day's work is the same every time it is asked for, and it is asked
   for on every visit, so it is worked out once and kept. */
const made = new Map();
function trackFor(day) {
  if (made.has(day)) return made.get(day);
  const cfg = design(day);
  const car = carFor(day);
  let size = 1;
  try { size = sizeFor(cfg, car); } catch (e) { size = 1; }
  const t = {
    v: NET_VER,
    raw: loopAt(cfg, 120, size),
    opts: { width: cfg.width, hills: cfg.hills, smooth: cfg.smooth, theme: cfg.theme,
            seed: cfg.seed, banks: cfg.banks, start: null, solid: false, car },
  };
  made.set(day, t);
  /* yesterday and today are all that is ever wanted */
  for (const k of made.keys()) if (k < day - 1) made.delete(k);
  return t;
}

function today() {
  const d = dayIndex();
  const t = trackFor(d);
  return { day: dayId(d), circuit: circuitKey(d), car: t.opts.car, endsAt: (d + 1) * 86_400_000, track: t };
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

module.exports = { makeDaily, trackFor, circuitKey, dayIndex, design, carFor };
