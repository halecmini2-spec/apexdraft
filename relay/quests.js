/* Quests: three tabs — daily, weekly, seasonal — three challenges each,
 * paying real Apex Pass XP on top of everything else it can be earned
 * from. Every challenge here is checked against something the relay
 * already trusts rather than something a client merely claims:
 *
 *   - "laps" and "distance" are incremented from relay/laps.js, at the
 *     exact point a lap has already cleared ticket/timing/lapBound/
 *     checkTrace — the same verified moment drive-time XP is granted
 *     from. Distance is the circuit's own length (C.len, in metres),
 *     which checkTrace already requires the lap to have covered.
 *   - "races" is incremented from relay/pass.js, at the point a
 *     race-finish event has already passed that endpoint's own
 *     rate limit and once-only dedup — the same trust level the
 *     race-finish XP tiers themselves already carry.
 *
 * Nothing here is client-reported on its own; a quest can only progress
 * by riding along on an event that was already going to be checked (or
 * self-reported and rate-limited) for another reason.
 */

/* One counter per account/period/quest, keyed through store.addQuestProgress
   — a new period is just a key nothing has written under yet, not a
   row that gets reset. Distance targets are in metres. */
const QUESTS = {
  daily: [
    { id: "d-laps", label: "Complete 3 laps", metric: "laps", target: 3, xp: 250 },
    { id: "d-dist", label: "Drive 10 km", metric: "distance", target: 10_000, xp: 250 },
    { id: "d-race", label: "Finish 1 race", metric: "races", target: 1, xp: 300 },
  ],
  weekly: [
    { id: "w-dist", label: "Drive 100 km", metric: "distance", target: 100_000, xp: 1500 },
    { id: "w-laps", label: "Complete 20 laps", metric: "laps", target: 20, xp: 1200 },
    { id: "w-race", label: "Finish 5 races", metric: "races", target: 5, xp: 1500 },
  ],
  seasonal: [
    { id: "s-dist", label: "Drive 500 km", metric: "distance", target: 500_000, xp: 5000 },
    { id: "s-laps", label: "Complete 100 laps", metric: "laps", target: 100, xp: 4000 },
    { id: "s-race", label: "Finish 25 races", metric: "races", target: 25, xp: 5000 },
  ],
};
const TABS = Object.keys(QUESTS);
const SEASON = "s1"; // same literal the Apex Pass itself uses (relay/pass.js)

const { json, readBody, cors, overRate } = require("./auth");

function makeQuests(store, userFor, dailyMod) {
  /* Daily: a plain UTC day number, the same one relay/daily.js already
     uses for the daily circuit. Weekly: that same day number divided
     into 7-day buckets — not ISO-week-aligned, matching the only other
     "week" concept already in this codebase (the daily car rotation in
     relay/daily.js). Seasonal: the season string itself; there is no
     season rollover anywhere yet, so a season's quests simply run until
     SEASON changes. */
  function periodKeys() {
    const day = dailyMod.dayIndex();
    const week = Math.floor(day / 7);
    return { daily: "d" + day, weekly: "w" + week, seasonal: SEASON };
  }

  /* Called from relay/laps.js (metric "laps"/"distance") and
     relay/pass.js (metric "races") right after each has already
     verified or rate-limited the event on its own terms. Fans one raw
     delta out to every quest across all three tabs that tracks that
     metric — a caller never needs to know which quests exist. */
  async function addMetricProgress(userId, metric, amount) {
    if (!userId || !amount) return;
    const pk = periodKeys();
    for (const tab of TABS) {
      const periodKey = tab + ":" + pk[tab];
      for (const q of QUESTS[tab]) {
        if (q.metric !== metric) continue;
        try { await store.addQuestProgress(userId, periodKey, q.id, amount); }
        catch (e) { console.error("quest progress:", tab, q.id, e && e.message); }
      }
    }
  }

  function bearer(req) {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  }

  async function route(req, res, url) {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (!url.pathname.startsWith("/api/quests/")) return false;

    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Sign in for quests." }), true;

    if (url.pathname === "/api/quests/state" && req.method === "GET") {
      const pk = periodKeys();
      const periodKeyOf = {};
      for (const tab of TABS) periodKeyOf[tab] = tab + ":" + pk[tab];
      const rows = await store.questProgress(user.id, Object.values(periodKeyOf));
      const countOf = {};
      for (const r of rows) countOf[r.period_key + ":" + r.quest_id] = Number(r.count) || 0;
      const tabs = {};
      for (const tab of TABS) {
        tabs[tab] = await Promise.all(QUESTS[tab].map(async (q) => {
          const count = countOf[periodKeyOf[tab] + ":" + q.id] || 0;
          const claimed = await store.hasGrant(user.id, "quest:" + periodKeyOf[tab] + ":" + q.id);
          return { id: q.id, label: q.label, metric: q.metric, target: q.target, xp: q.xp,
            count: Math.min(count, q.target), claimed };
        }));
      }
      return json(res, 200, { tabs, resetsAt: { daily: (Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000 } }), true;
    }

    if (url.pathname === "/api/quests/claim" && req.method === "POST") {
      if (overRate("qc:" + user.id, 30, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      let body;
      try { body = await readBody(req); }
      catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }
      const tab = String(body.tab || "");
      const questId = String(body.questId || "");
      const list = QUESTS[tab];
      const q = list && list.find((x) => x.id === questId);
      if (!q) return json(res, 400, { error: "No such quest." }), true;
      const pk = periodKeys();
      const periodKey = tab + ":" + pk[tab];
      const rows = await store.questProgress(user.id, [periodKey]);
      const row = rows.find((r) => r.quest_id === questId);
      const count = row ? Number(row.count) || 0 : 0;
      if (count < q.target) return json(res, 403, { error: "Not there yet." }), true;
      const r = await store.grantXpOnce(user.id, "quest:" + periodKey + ":" + questId, q.xp);
      if (!r.granted) return json(res, 409, { error: "Already claimed." }), true;
      return json(res, 200, { xp: r.xp, amount: q.xp }), true;
    }

    return json(res, 404, { error: "No such endpoint." }), true;
  }

  return { route, addMetricProgress, periodKeys, QUESTS };
}

module.exports = { makeQuests };
