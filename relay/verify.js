/* Whether a lap could have been driven.
 *
 * The physics run on the page, so the relay cannot replay a lap; but it
 * can ask for the evidence and check it against the circuit it holds. A
 * lap has to arrive with the trace the page keeps as it drives — a point
 * every tenth of a second — and the trace has to make sense: on the road,
 * once round the lap in the right direction, at speeds and changes of
 * speed the car model can produce, over the time claimed. The time itself
 * has to be one a perfect driver could conceivably set, and the lap has to
 * have taken that long in real time since the page said it began. A number
 * typed into the console fails every one of these.
 */
const { centreline, nearest } = require("./geom");

/* the car model's ceilings, with a little on top */
const PERF = {
  gt:      { power: 1.00, top: 1.00, grip: 1.12 },
  formula: { power: 1.26, top: 1.20, grip: 1.46 },
  yaris:   { power: 0.72, top: 0.74, grip: 0.90 },
  kart:    { power: 0.94, top: 0.58, grip: 1.34 },
};
const TOP = 64;          // m/s on tarmac, GT
const GRIP = 23.0;       // m/s^2 of lateral grip, GT, at speed
/* the page gives more grip the slower the car: the same curve here */
const latBoost = (v) => 1 + 1.30 * Math.max(0, Math.min(1, 1 - v / 40));
const BRAKE = 19;        // m/s^2
const POWER = 14;        // m/s^2 off the line

/* The quickest lap the model allows: a car that never lifts except to
   make the next bend at the grip limit, on the least-curvature line the
   road allows, with everything a little better than the page can give.
   Anything quicker than this was not driven. */
function lapBound(C, car) {
  const p = PERF[car] || PERF.gt;
  const vmax = TOP * p.top * 1.03, aLat = GRIP * p.grip * 1.30, accel = POWER * p.power * 1.15, brake = BRAKE * 1.15;
  const N = C.N, sp = C.len / N;
  /* the line straightens the road: at best a bend is taken on a radius
     wider by most of the road */
  const kEff = new Float64Array(N);
  for (let i = 0; i < N; i++) { const k = Math.abs(C.K[i]); const r = k > 1e-6 ? 1 / k : 1e6; kEff[i] = 1 / (r + C.halfW * 1.6); }
  const vT = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    /* the grip depends on the speed and the speed on the grip: a few
       rounds settle it */
    let v = Math.min(vmax, Math.sqrt(aLat / Math.max(kEff[i], 1e-6)));
    for (let r = 0; r < 6; r++) v = Math.min(vmax, Math.sqrt(aLat * latBoost(v) / Math.max(kEff[i], 1e-6)));
    vT[i] = v;
  }
  /* backward pass: braking limits; forward pass: acceleration limits; two
     laps so the flying lap starts at speed */
  const v = new Float64Array(N);
  for (let i = 0; i < N; i++) v[i] = vT[i];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * brake * sp)); }
    for (let i = 0; i < N; i++) { const j = (i - 1 + N) % N; const t = Math.min(1, v[j] / vmax); v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * accel * (1 - t * t * 0.9) * sp + 1e-6)); }
  }
  let ms = 0;
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; ms += sp / Math.max(1, (v[i] + v[j]) / 2) * 1000; }
  return Math.round(ms);
}

/* The trace, checked against the circuit. Returns null when it holds up,
   otherwise a short reason. */
function checkTrace(C, trace, ms) {
  if (!Array.isArray(trace) || trace.length < 10) return "no trace of the lap";
  const want = ms / 100;
  if (trace.length < want * 0.6 || trace.length > want * 1.6 + 8) return "trace does not match the time";
  const t0 = +trace[0][0], tn = +trace[trace.length - 1][0];
  if (!(t0 <= 500) || tn < ms - 800 || tn > ms + 800) return "trace does not span the lap";
  const vLimit = TOP * 1.32 + 3;              // the formula's top, and some
  let hint = null, startI = null, progress = 0, lastI = null, off = 0, far = 0, backs = 0, gaps = 0, prevV = null, prevT = null, prevX = null, prevZ = null, jumps = 0;
  const N = C.N, sp = C.len / N;
  for (let n = 0; n < trace.length; n++) {
    const s = trace[n];
    if (!Array.isArray(s) || s.length < 3) return "malformed trace";
    const t = +s[0], x = +s[1], z = +s[2];
    if (![t, x, z].every(Number.isFinite)) return "malformed trace";
    if (prevT != null) {
      const dt = (t - prevT) / 1000;
      if (dt < 0) return "trace runs backwards";
      if (dt > 2.0) gaps++;
      if (dt > 0.02) {
        const v = Math.hypot(x - prevX, z - prevZ) / dt;
        /* Losing speed suddenly is what a wall does; gaining it suddenly is
           what nothing here does. A recover teleports for one sample. A few
           such moments are allowed, a lap made of them is not. */
        if (v > vLimit || (prevV != null && (v - prevV) / dt > 20)) { if (++jumps > 6) return v > vLimit ? "faster than any car here" : "impossible gains of speed"; prevV = null; }
        else prevV = v;
      }
    }
    const np = nearest(C, x, z, hint);
    hint = np.i;
    if (np.d > C.halfW + 9) { off++; if (np.d > 45) far++; }
    if (startI == null) startI = np.i;
    if (lastI != null) {
      let di = np.i - lastI; if (di > N / 2) di -= N; if (di < -N / 2) di += N;
      if (di < -8) backs++;                    // a spin is allowed; driving the lap backwards is not
      progress += di * sp;
    }
    lastI = np.i;
    prevT = t; prevX = x; prevZ = z;
  }
  /* cornering: the path the trace draws, at the speed it draws it, cannot
     ask more of the tyres than they have — half a second either side */
  let hot = 0, judged = 0;
  for (let n = 5; n < trace.length - 5; n++) {
    const a = trace[n - 5], b = trace[n], c = trace[n + 5];
    const dtA = (+b[0] - +a[0]) / 1000, dtC = (+c[0] - +b[0]) / 1000; if (dtA <= 0.2 || dtC <= 0.2 || dtA > 1.5 || dtC > 1.5) continue;
    const ax = +b[1] - +a[1], az = +b[2] - +a[2], bx = +c[1] - +b[1], bz = +c[2] - +b[2];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(+c[1] - +a[1], +c[2] - +a[2]);
    if (la < 3 || lb < 3 || !lc) continue;
    const kappa = Math.abs(2 * (ax * bz - az * bx) / (la * lb * lc)), vv = (la / dtA + lb / dtC) / 2;
    judged++; if (vv * vv * kappa > GRIP * latBoost(vv) * 1.32 * 1.25) hot++;
  }
  if (judged > 20 && hot > judged * 0.06) return "cornering faster than the tyres allow";
  if (gaps > 4) return "trace has holes";
  if (far > 0 || off > trace.length * 0.12) return "not on the circuit";
  if (backs > 3) return "wrong way";
  if (progress < C.len * 0.93 || progress > C.len * 1.12) return "not a whole lap";
  return null;
}

/* the geometry a lap is judged against: the daily's from the relay's own
   generator, a drawn circuit's from the copy the page sends, which must
   hash to the board it claims */
function circuitFor(circuit, track, dailyMod) {
  if (/^daily_\d{8}$/.test(circuit)) {
    const y = +circuit.slice(6, 10), m = +circuit.slice(10, 12), d = +circuit.slice(12, 14);
    const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
    const t = dailyMod.trackFor(day);
    return centreline(t.raw, t.opts, 1);
  }
  if (!track || !Array.isArray(track.raw)) return null;
  const { circuitKey } = require("./geom");
  if (circuitKey(track.raw, track.opts || {}) !== circuit) return null;
  return centreline(track.raw, track.opts || {}, 1);
}

module.exports = { lapBound, checkTrace, circuitFor, PERF };
