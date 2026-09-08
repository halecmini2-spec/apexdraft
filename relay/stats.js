/* What a driver has won, and anything the desk wants to tell them.
 *
 * Race wins are counted when the page reports one — the race itself runs
 * on the pages, so this is a tally, not a record. Daily time-trial wins
 * are the relay's own: the fastest time on a finished day's board is that
 * day's winner. A notice is a message for one account, shown when they
 * next sign in; set in NOTICES ("name=message;name=message").
 */
const { json, readBody, cors, overRate } = require("./auth");

const NOTICES = {
  sebvader: "Your account is under investigation for suspicious and advantageous activity on the leaderboards.",
};
for (const item of String(process.env.NOTICES || "").split(";").map((x) => x.trim()).filter(Boolean)) {
  const i = item.indexOf("="); if (i > 0) NOTICES[item.slice(0, i).trim().toLowerCase()] = item.slice(i + 1).trim();
}

function makeStats(store, userFor, dailyMod) {
  function bearer(req) {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  }
  async function route(req, res, url) {
    if (url.pathname !== "/api/me/stats" && url.pathname !== "/api/wins") return false;
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (store.ready === false) return json(res, 503, { error: "Not available just now." }), true;
    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Not signed in." }), true;

    if (url.pathname === "/api/me/stats" && req.method === "GET") {
      const today = dailyMod.circuitKey(dailyMod.dayIndex()), yesterday = dailyMod.circuitKey(dailyMod.dayIndex() - 1);
      const winners = await store.dailyWinners();
      let dailyWins = 0, wonYesterday = false;
      for (const w of winners) { if (w.circuit === today) continue; if (w.user_id === user.id) { dailyWins++; if (w.circuit === yesterday) wonYesterday = true; } }
      const w = await store.wins(user.id);
      return json(res, 200, {
        raceWins: w.race | 0, dailyWins, wonYesterday, yesterday,
        notice: NOTICES[user.name.toLowerCase()] || null,
      }), true;
    }
    if (url.pathname === "/api/wins" && req.method === "POST") {
      if (overRate("w:" + user.id, 30, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      let body; try { body = await readBody(req, 1024); } catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }
      if (body.kind !== "race") return json(res, 400, { error: "Not a kind of win." }), true;
      const w = await store.winsAdd(user.id, "race");
      return json(res, 200, { raceWins: w.race | 0 }), true;
    }
    return json(res, 405, { error: "Not allowed." }), true;
  }
  return { route };
}

module.exports = { makeStats };
