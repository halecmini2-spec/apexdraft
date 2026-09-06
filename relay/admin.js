/* The admin desk.
 *
 * Small on purpose: see the accounts, and undo things — an account, a lap
 * time, a whole board. Nothing here creates or edits; it only removes what
 * someone else put there, which is the entire job of moderating a game
 * whose lap times are claims the server cannot referee.
 *
 * Who counts as an admin is decided by ADMIN_USERS in the environment (see
 * auth.js). There is no way to become one through the API.
 */
const { json, readBody, cors, isAdmin } = require("./auth");

function makeAdmin(store, userFor, liveNow) {
  function bearer(req) {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  }

  async function route(req, res, url) {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (store.ready === false) return json(res, 503, { error: "Not available just now." }), true;

    const me = await userFor(bearer(req));
    /* The same answer whether you are signed out or signed in without the
       flag: a 404 tells someone poking at the URL nothing about which. */
    if (!isAdmin(me)) return json(res, 404, { error: "No such endpoint." }), true;

    if (url.pathname === "/api/admin/users" && req.method === "GET") {
      return json(res, 200, { users: (await store.users()).map((u) => ({
        name: u.name, email: u.email, created: Number(u.created),
        tracks: Number(u.tracks), laps: Number(u.laps), admin: isAdmin(u),
      })) }), true;
    }

    /* How many came and how many played: today, the last thirty days, and
       all time — plus who is on right now. */
    if (url.pathname === "/api/admin/stats" && req.method === "GET") {
      const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const st = await store.stats(since);
      /* The visitor id never leaves the server as itself: the desk gets a
         short tag made from it, enough to see the same browser twice. */
      const crypto = require("crypto");
      const tag = (v) => crypto.createHash("sha256").update("tag:" + v).digest("hex").slice(0, 4);
      const recent = (await store.recent(400)).map((r) => ({ at: r.at, who: tag(r.vid), first: r.first }));
      return json(res, 200, {
        live: liveNow ? liveNow() : { players: 0, rooms: 0, racing: 0 },
        today: new Date().toISOString().slice(0, 10),
        days: st.days, totals: st.totals, recent,
      }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }

    if (url.pathname === "/api/admin/users/delete") {
      const name = String(body.name || "").trim().toLowerCase();
      const u = await store.userByName(name);
      if (!u) return json(res, 404, { error: "No account by that name." }), true;
      /* Locking yourself out is not a thing an undo button should be able
         to do, and another admin is not yours to remove from here. */
      if (u.id === me.id) return json(res, 400, { error: "You can't delete your own account from here." }), true;
      if (isAdmin(u)) return json(res, 400, { error: "That account is an admin too." }), true;
      await store.deleteUser(u.id);
      console.log("admin " + me.name + " deleted account " + u.name);
      return json(res, 200, { ok: true }), true;
    }

    if (url.pathname === "/api/admin/laps/delete") {
      const circuit = String(body.circuit || "");
      const name = String(body.name || "").trim().toLowerCase();
      const u = await store.userByName(name);
      if (!u || !circuit) return json(res, 404, { error: "No such time." }), true;
      const ok = await store.deleteLap(circuit, u.id);
      console.log("admin " + me.name + " removed " + u.name + "'s time on " + circuit);
      return json(res, 200, { ok }), true;
    }

    if (url.pathname === "/api/admin/laps/wipe") {
      const circuit = String(body.circuit || "");
      if (!circuit) return json(res, 400, { error: "Which circuit?" }), true;
      const n = await store.wipeBoard(circuit);
      console.log("admin " + me.name + " wiped the board on " + circuit + " (" + n + " times)");
      return json(res, 200, { ok: true, removed: n }), true;
    }

    return json(res, 404, { error: "No such endpoint." }), true;
  }

  return { route };
}

module.exports = { makeAdmin };
