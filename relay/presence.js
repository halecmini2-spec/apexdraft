/* Who is on right now.
 *
 * A party is not the only way to be here: most people draw and drive alone,
 * and the desk could not see them at all. So every open page sends a small
 * ping every half minute — the same random id the visit beacon uses, the
 * account token if signed in, and one word for what it is doing — and says
 * goodbye when it is closed. What is kept in memory is the moment each page
 * arrived and was last heard from; when one goes quiet or leaves, that
 * stay is written down with how long it lasted.
 */
const { json, readBody, cors, overRate, clientIp } = require("./auth");

const VID = /^[A-Za-z0-9_-]{8,40}$/;
const WHAT = new Set(["home", "board", "driving", "daily", "party", "away"]);
const STALE_MS = 75_000;     // two missed pings and the page is taken to be gone
const MIN_STAY_MS = 10_000;  // a bounce is not a stay

function makePresence(store, userFor) {
  const on = new Map();      // vid -> { since, last, name, what }

  function end(vid, at) {
    const p = on.get(vid);
    if (!p) return;
    on.delete(vid);
    const until = Math.max(p.since, Math.min(at, p.last + STALE_MS));
    if (until - p.since < MIN_STAY_MS) return;
    if (store.ready === false) return;
    store.stay(vid, p.name, p.since, until).catch((e) => console.error("stay:", e && e.message));
  }

  async function route(req, res, url) {
    if (url.pathname !== "/api/presence") return false;
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;
    /* Never an error to the page. */
    cors(res);
    if (overRate("p:" + clientIp(req), 240, 10 * 60_000)) { res.writeHead(204).end(); return true; }
    let vid = null, name = null, what = "home", bye = false;
    try {
      const b = await readBody(req, 1024);
      vid = String(b.v || ""); bye = !!b.bye;
      what = WHAT.has(b.w) ? b.w : "home";
      if (b.t && userFor) { const u = await userFor(String(b.t)); if (u) name = u.name; }
    } catch (e) { vid = null; }
    if (vid && VID.test(vid)) {
      const now = Date.now();
      if (bye) end(vid, now);
      else {
        const p = on.get(vid);
        if (p) { p.last = now; p.what = what; if (name) p.name = name; }
        else on.set(vid, { since: now, last: now, name, what });
      }
    }
    res.writeHead(204).end();
    return true;
  }

  /* pages that stopped pinging are gone, and their stays are written down */
  function sweep() {
    const now = Date.now();
    for (const [vid, p] of on) if (now - p.last > STALE_MS) end(vid, p.last);
  }

  function online() {
    return [...on.entries()]
      .map(([vid, p]) => ({ vid, name: p.name, what: p.what, since: p.since, last: p.last }))
      .sort((a, b) => a.since - b.since);
  }

  return { route, sweep, online };
}

module.exports = { makePresence };
