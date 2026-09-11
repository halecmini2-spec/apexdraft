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
const ALL = 500;   // "show all": as many as anyone will scroll through
const MIN_MS = 5000;            // nothing real is quicker than five seconds
const MAX_MS = 30 * 60 * 1000;  // nor slower than half an hour
const KEY_RE = /^[A-Za-z0-9_]{6,64}$/;
/* A ghost is a run of [ms, x, z, yaw] samples, a few a second for a lap:
   a few thousand at most, and only for the daily circuits, which are the
   ones people race against the world on. */
const GHOST_MAX = 4000;
const isDaily = (c) => /^daily_\d{8}$/.test(c);
const { lapBound, checkTrace, circuitFor } = require("./verify");
const dailyMod = require("./daily");
const carsMod = require("./cars");
/* A lap has to have begun before it can end: the page asks for a ticket
   as it crosses the line, and the finish has to come at least the lap's
   own length later. One ticket, one lap, and only for the driver and the
   circuit it was issued to. */
const tickets = new Map();
const TICKET_TTL = 2 * 3600_000;
function makeTicket(userId, circuit) {
  const crypto = require("crypto");
  const id = crypto.randomBytes(12).toString("base64url");
  tickets.set(id, { userId, circuit, at: Date.now() });
  if (tickets.size > 20000) for (const [k, v] of tickets) { if (Date.now() - v.at > TICKET_TTL) tickets.delete(k); if (tickets.size < 15000) break; }
  return id;
}
/* the circuits a lap was judged against, kept for a while */
const geomCache = new Map();
function geometry(circuit, track) {
  const hit = geomCache.get(circuit);
  if (hit && Date.now() - hit.at < 3600_000) return hit.C;
  const C = circuitFor(circuit, track, dailyMod);
  if (C) { geomCache.set(circuit, { C, at: Date.now() }); if (geomCache.size > 200) geomCache.delete(geomCache.keys().next().value); }
  return C;
}
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
  /* Times that could not have been driven are taken off the daily boards
     when the relay starts, and any named in PURGE_LAPS ("circuit:name,...")
     go with them. */
  async function sweep() {
    try {
      for (const back of [0, 1, 2]) {
        const circuit = dailyMod.circuitKey(dailyMod.dayIndex() - back);
        const C = geometry(circuit, null); if (!C) continue;
        const floor = lapBound(C, "gt") * 0.92;
        for (const l of await store.board(circuit, 500)) {
          if (l.ms < floor) { await store.deleteLap(circuit, l.user_id); console.log("sweep: removed " + l.name + " " + l.ms + " ms on " + circuit + " (floor " + Math.round(floor) + ")"); }
        }
      }
      /* a time that was put on the board by hand rather than driven, taken
         off by name; joined by anything named in PURGE_LAPS */
      const purge = [];
      for (const back of [0, 1, 2]) purge.push(dailyMod.circuitKey(dailyMod.dayIndex() - back) + ":sebvader");
      for (const item of purge.concat(String(process.env.PURGE_LAPS || "").split(",").map((x) => x.trim()).filter(Boolean))) {
        const [circuit, name] = item.split(":");
        const u = name && await store.userByName(name.toLowerCase());
        if (u && circuit && await store.deleteLap(circuit, u.id)) console.log("purge: removed " + u.name + " on " + circuit);
      }
    } catch (e) { console.error("sweep:", e && e.message); }
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
      const all = url.searchParams.get("all") === "1";
      const board = await store.board(circuit, all ? ALL : TOP);
      const count = await store.count(circuit);
      /* Signed in, the answer also says where you stand: your time, your
         place, and how many are on the board — which the top of the list
         cannot tell you once you are off it. */
      const user = await userFor(bearer(req));
      const you = user ? await store.rank(circuit, user.id) : null;
      return json(res, 200, { board: board.map(row), top: all ? ALL : TOP, count, you }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;

    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Sign in to put a time on the board." }), true;

    let body;
    try { body = await readBody(req, 320 * 1024); }
    catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }

    /* the lap begins: a ticket, to be handed back with the time */
    if (url.pathname === "/api/laps/ticket") {
      if (overRate("t:" + user.id, 60, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      const circuit = String(body.circuit || "");
      if (!KEY_RE.test(circuit)) return json(res, 400, { error: "That isn't a circuit." }), true;
      return json(res, 200, { ticket: makeTicket(user.id, circuit) }), true;
    }
    if (url.pathname !== "/api/laps") return json(res, 404, { error: "No such endpoint." }), true;
    if (overRate("l:" + user.id, 20, 10 * 60_000))
      return json(res, 429, { error: "Slow down a moment." }), true;

    const circuit = String(body.circuit || "");
    const ms = Math.round(Number(body.ms));
    let car = String(body.car || "gt").slice(0, 16);
    /* On the daily the car is not the driver's to claim: the day decides it,
       and a lap sent as something quicker than the day's car would be judged
       against the wrong ceiling. Everywhere else the claim is all there is,
       and a wrong one only sorts the board oddly. */
    if (/^daily_\d{8}$/.test(circuit)) {
      const y = +circuit.slice(6, 10), mo = +circuit.slice(10, 12), da = +circuit.slice(12, 14);
      car = dailyMod.carFor(Math.floor(Date.UTC(y, mo - 1, da) / 86_400_000));
    }
    if (!KEY_RE.test(circuit)) return json(res, 400, { error: "That isn't a circuit." }), true;
    if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS)
      return json(res, 400, { error: "That isn't a lap time." }), true;

    /* ---- could this lap have been driven? ---- */
    const refuse = (why) => { console.log("lap refused: " + user.name + " " + ms + " ms on " + circuit + " — " + why); return json(res, 422, { error: "That lap couldn't be verified (" + why + "), so it wasn't kept." }), true; };
    /* Is this car theirs at all? Asked before any of the work below, because
       it is a question about the account rather than about the lap, and the
       answer does not depend on a single thing the page says.

       This is the gate that holds. The page is one file that everybody who
       opens the game downloads and it can be edited in any browser, so the
       gate inside it decides only what a driver is shown. Refusing here is
       what stops an edited page putting anything in front of anybody else:
       the time is not kept, reaches no board, and is never raced against.
       On a daily the car is not a claim at all — the day hands the same one
       to everybody and the relay worked it out from the circuit above,
       without asking. */
    if (!carsMod.mayDrive(user, car, isDaily(circuit)))
      return refuse("that car isn't on your account");

    const tk = tickets.get(String(body.ticket || ""));
    if (!tk || tk.userId !== user.id || tk.circuit !== circuit) return refuse("no ticket for this lap");
    tickets.delete(String(body.ticket));
    if (Date.now() - tk.at < ms - 3000) return refuse("finished before it could have");
    const C = geometry(circuit, body.track);
    if (!C) return refuse("circuit unknown");
    if (ms < lapBound(C, car) * 0.92) return refuse("quicker than the car can go");
    const bad = checkTrace(C, body.ghost, ms);
    if (bad) return refuse(bad);

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

  return { route, sweep };
}

module.exports = { makeLaps };
