/* The circuit's centreline, built on the relay exactly as the page builds
 * it — the same resampling, smoothing and curvature relaxation, copied
 * from the page so that a point the page calls "on the road" is on the
 * road here too. Only the plan view is needed: to check that a lap really
 * went round the circuit, and to say how fast a lap could possibly be.
 */
const SCALE = 1.30;   // metres per pad unit, as on the page

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function plen(p) { let L = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; L += Math.hypot(q.x - p[i].x, q.y - p[i].y); } return L; }

function resampleClosed(p, step) {
  if (p.length < 3) return p.slice();
  const out = []; const cur = { x: p[0].x, y: p[0].y };
  out.push({ x: cur.x, y: cur.y });
  const total = plen(p); const n = Math.max(16, Math.round(total / step)); const st = total / n;
  let carry = 0;
  for (let k = 0; k < p.length; k++) {
    const a = p[k], b = p[(k + 1) % p.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 1e-9) continue;
    let pos = carry;
    while (pos < d) {
      const u = pos / d;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      pos += st;
    }
    carry = pos - d;
  }
  out.shift();
  return out;
}

function smoothClosed(pts, passes, alpha, anchorPull) {
  const n = pts.length; if (n < 5) return pts.slice();
  const orig = pts.map((p) => ({ x: p.x, y: p.y }));
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let s = 0; s < passes; s++) {
    const nx = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n], b = cur[i], c = cur[(i + 1) % n];
      let x = b.x + alpha * ((a.x + c.x) * .5 - b.x);
      let y = b.y + alpha * ((a.y + c.y) * .5 - b.y);
      x += anchorPull * (orig[i].x - x); y += anchorPull * (orig[i].y - y);
      nx[i] = { x, y };
    }
    cur = nx;
  }
  return cur;
}

function circumRadius(a, b, c) {
  const A = Math.hypot(b.x - c.x, b.y - c.y), B = Math.hypot(a.x - c.x, a.y - c.y), C = Math.hypot(a.x - b.x, a.y - b.y);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) * .5;
  if (area < 1e-6) return 1e9;
  return (A * B * C) / (4 * area);
}

function relaxCurvature(pts, minRadius, iters) {
  const n = pts.length; if (n < 8) return pts;
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let s = 0; s < iters; s++) {
    let worst = 0;
    const nx = cur.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < n; i++) {
      const a = cur[(i - 1 + n) % n], b = cur[i], c = cur[(i + 1) % n];
      const r = circumRadius(a, b, c);
      if (r < minRadius) {
        const w = clamp(1 - r / minRadius, 0, 1) * .45;
        nx[i].x = b.x + w * ((a.x + c.x) * .5 - b.x);
        nx[i].y = b.y + w * ((a.y + c.y) * .5 - b.y);
        worst = Math.max(worst, 1 - r / minRadius);
      }
    }
    cur = nx;
    if (worst < 0.02) break;
  }
  return cur;
}

function canonRaw(raw, fit) {
  const f = fit || 1;
  if (!raw || !raw.length || Math.abs(f - 1) < 1e-9) return raw;
  let cx = 0, cy = 0;
  for (const p of raw) { cx += p.x; cy += p.y; }
  cx /= raw.length; cy /= raw.length;
  return raw.map((p) => ({ x: cx + (p.x - cx) / f, y: cy + (p.y - cy) / f }));
}

/* The plan of the circuit in metres: points, cumulative distance, length,
   curvature per point, and half the road width. null if it is not a loop
   the page would build either. */
function centreline(rawIn, opts, fit) {
  if (!Array.isArray(rawIn) || rawIn.length < 8 || rawIn.length > 4000) return null;
  let raw = rawIn.map((p) => Array.isArray(p) ? { x: +p[0], y: +p[1] } : { x: +p.x, y: +p.y });
  if (!raw.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  raw = canonRaw(raw, fit);
  let p = resampleClosed(raw, 7);
  if (p.length < 14) return null;
  const smoothAmt = clamp((+opts.smooth || 0) / 100, 0, 1);
  p = smoothClosed(p, Math.round(6 + smoothAmt * 26), .55, .22 - smoothAmt * .16);
  p = resampleClosed(p, 5);
  const minR = (18 + smoothAmt * 30);
  p = relaxCurvature(p, minR, 90);
  p = smoothClosed(p, 4, .5, .1);
  p = resampleClosed(p, 4);
  if (p.length < 20) return null;
  let cx = 0, cy = 0; for (const q of p) { cx += q.x; cy += q.y; } cx /= p.length; cy /= p.length;
  const N = p.length, X = new Float64Array(N), Z = new Float64Array(N);
  for (let i = 0; i < N; i++) { X[i] = (p[i].x - cx) * SCALE; Z[i] = (p[i].y - cy) * SCALE; }
  const S = new Float64Array(N); let len = 0;
  for (let i = 0; i < N; i++) { S[i] = len; const j = (i + 1) % N; len += Math.hypot(X[j] - X[i], Z[j] - Z[i]); }
  /* curvature, signed, from a three-point circle, lightly smoothed */
  const K = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, c = (i + 2) % N;
    const ax = X[i] - X[a], az = Z[i] - Z[a], bx = X[c] - X[i], bz = Z[c] - Z[i];
    const cross = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(X[c] - X[a], Z[c] - Z[a]);
    K[i] = (la && lb && lc) ? 2 * cross / (la * lb * lc) : 0;
  }
  const Ks = new Float64Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let w = -3; w <= 3; w++) s += K[(i + w + N) % N]; Ks[i] = s / 7; }
  const width = clamp(+opts.width || 12, 4, 40);
  return { N, X, Z, S, len, K: Ks, halfW: width / 2 };
}

/* Which board a drawn circuit belongs to: the page's key, computed the same
   way from the same points and settings, so a lap can only be filed under
   the circuit it was really driven on. */
function circuitKey(raw, opts) {
  const o = opts || {};
  const pts = raw.map((p) => Array.isArray(p) ? [+p[0], +p[1]] : [+p.x, +p.y]);
  let mx = Infinity, my = Infinity;
  for (const p of pts) { if (p[0] < mx) mx = p[0]; if (p[1] < my) my = p[1]; }
  const s = pts.map((p) => Math.round((p[0] - mx) * 100) + "," + Math.round((p[1] - my) * 100)).join(";")
    + "|w" + (+o.width || 0) + "|h" + (+o.hills || 0) + "|s" + (+o.smooth || 0) + "|e" + (+o.seed || 0)
    + "|b" + ((o.banks || []).map((b) => b == null ? "-" : +b).join(","));
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b + c, 2246822519) >>> 0; b = ((b << 13) | (b >>> 19)) >>> 0;
  }
  return ("0000000" + a.toString(16)).slice(-8) + ("0000000" + b.toString(16)).slice(-8);
}

/* the nearest point of the centreline to (x,z): its index and distance */
function nearest(C, x, z, hint) {
  const N = C.N;
  let best = -1, bd = Infinity;
  const scan = (i) => { const dx = C.X[i] - x, dz = C.Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
  if (hint != null) { for (let o = -40; o <= 40; o++) scan((hint + o + N * 2) % N); if (bd < 30 * 30) return { i: best, d: Math.sqrt(bd) }; }
  for (let i = 0; i < N; i++) scan(i);
  return { i: best, d: Math.sqrt(bd) };
}

module.exports = { centreline, circuitKey, nearest, SCALE };
