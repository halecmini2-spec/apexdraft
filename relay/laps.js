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
      const board = await store.board(circuit, TOP);
      return json(res, 200, { board: board.map(row), top: TOP }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;

    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Sign in to put a time on the board." }), true;
    if (overRate("l:" + user.id, 120, 10 * 60_000))
      return json(res, 429, { error: "Slow down a moment." }), true;

    let body;
    try { body = await readBody(req); }
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
    const board = await store.board(circuit, TOP);
    return json(res, 200, {
      board: board.map(row), best, kept: best === ms, you: user.name, top: TOP,
    }), true;
  }

  return { route };
}

module.exports = { makeLaps };
