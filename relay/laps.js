/* Fastest laps.
 *
 * A lap time only means something against the same circuit, so a board is
 * kept per circuit rather than one big list: a thirty-second scribble would
 * otherwise beat every proper lap ever driven. The circuit is identified by
 * a key the client works out from the points and the settings, so two people
 * who drew — or were sent — the same layout land on the same board without
 * anybody having to publish anything.
 *
 * The server cannot referee a lap. The physics run on the client, so a time
 * is a claim, and all that is checked here is that it is a plausible one.
 * Worth knowing before treating the board as a record book.
 */
const { json, readBody, cors, clientIp, overRate } = require("./auth");

const TOP = 25;
const MIN_MS = 5000;            // nothing real is quicker than five seconds
const MAX_MS = 30 * 60 * 1000;  // nor slower than half an hour
const KEY_RE = /^[A-Za-z0-9_]{6,64}$/;
/* A ghost is a run of [ms, x, z, yaw] samples, a few a second for a lap:
   a few thousand at most, and only for the daily circuits, which are the
   ones people race against the world on. */
const GHOST_MAX = 4000;
const isDaily = (c) => /^daily_\d{8}$/.test(c);
function cleanGhost(g) {
  if (!Array.isArray(g) || g.length < 10 || g.length > GHOST_MAX) return null;
  let last = -1;
  const out = [];
  for (const s of g) {
    if (!Array.isArray(s) || s.length !== 4) return null;
    const [t, x, z, yaw] = s.map(Number);
    if (![t, x, z, yaw].every(Number.isFinite) || t < last) return null;
    last = t;
    out.push([Math.round(t), +x.toFixed(2), +z.toFixed(2), +yaw.toFixed(3)]);
  }
  return out;
}

function makeLaps(store, userFor) {
  function bearer(req) {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  }

  const row = (r) => ({ name: r.name, ms: Number(r.ms), car: r.car, at: Number(r.at) });

  async function route(req, res, url) {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (store.ready === false) {
      return json(res, 503, { error: "The leaderboard is unavailable just now." }), true;
    }

    /* Reading is open. Half the point of a board is seeing what there is to
       beat before deciding whether to sign up and chase it. */
    if (req.method === "GET") {
      const circuit = String(url.searchParams.get("circuit") || "");
      if (!KEY_RE.test(circuit)) return json(res, 400, { error: "That isn't a circuit." }), true;
      /* the fastest lap, as something to drive against */
      if (url.pathname === "/api/laps/ghost") {
        const g = await store.ghost(circuit);
        return json(res, 200, g ? { name: g.name, ms: g.ms, car: g.car, samples: JSON.parse(g.data) } : { samples: null }), true;
      }
      const board = await store.board(circuit, TOP);
      /* Signed in, the answer also says where you stand: your time, your
         place, and how many are on the board — which the top of the list
         cannot tell you once you are off it. */
      const user = await userFor(bearer(req));
      const you = user ? await store.rank(circuit, user.id) : null;
      return json(res, 200, { board: board.map(row), top: TOP, you }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;

    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Sign in to put a time on the board." }), true;
    if (overRate("l:" + user.id, 120, 10 * 60_000))
      return json(res, 429, { error: "Slow down a moment." }), true;

    let body;
    try { body = await readBody(req, 320 * 1024); }
    catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }

    const circuit = String(body.circuit || "");
    const ms = Math.round(Number(body.ms));
    const car = String(body.car || "gt").slice(0, 16);
    if (!KEY_RE.test(circuit)) return json(res, 400, { error: "That isn't a circuit." }), true;
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS)
      return json(res, 400, { error: "That isn't a lap time." }), true;

    /* Only an improvement is worth writing, and the board is what you wanted
       back anyway — so one round trip does both. */
    const best = await store.putLap({
      circuit, user_id: user.id, name: user.name, ms, car, at: Date.now(),
    });
    const kept = best === ms;
    /* The lap itself travels with an improvement on a daily circuit, so the
       record can be driven against. */
    if (kept && isDaily(circuit) && body.ghost) {
      const g = cleanGhost(body.ghost);
      if (g) {
        try { await store.putGhost(circuit, user.id, JSON.stringify(g)); }
        catch (e) { console.error("ghost:", e && e.message); }
      }
      /* yesterday's ghosts are nobody's to race any more */
      if (Math.random() < 0.05) {
        const before = "daily_" + new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
        store.pruneGhosts(before).catch(() => {});
      }
    }
    const board = await store.board(circuit, TOP);
    const rank = await store.rank(circuit, user.id);
    return json(res, 200, {
      board: board.map(row), best, kept, you: user.name, top: TOP, rank,
    }), true;
  }

  return { route };
}

module.exports = { makeLaps };
