/* Counting visits.
 *
 * The page sends one small beacon when it loads: a random id its browser
 * made up and keeps. That is the whole of it — no address, no agent string,
 * no path, nothing that says who — unless the visitor is signed in, in
 * which case their own account name goes on the desk beside the visit.
 * What the server keeps is a count per day per id, and a month of moments.
 */
const { json, readBody, cors, overRate, clientIp } = require("./auth");

const VID = /^[A-Za-z0-9_-]{8,40}$/;
const today = () => new Date().toISOString().slice(0, 10);   // UTC, so every machine agrees on the day

function makeVisits(store, userFor) {
  async function route(req, res, url) {
    if (url.pathname !== "/api/hit") return false;
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;
    /* Never an error to the page: a visit that could not be counted is not
       the visitor's problem. */
    cors(res);
    if (store.ready === false || overRate("h:" + clientIp(req), 40, 10 * 60_000)) { res.writeHead(204).end(); return true; }
    let vid = null, name = null, bind = false;
    try {
      const b = await readBody(req, 1024); vid = String(b.v || ""); bind = !!b.bind;
      /* A signed-in visitor is named on the desk. The token is the same one
         the account desk already trusts; it is never stored, only resolved. */
      if (b.t && userFor) { const u = await userFor(String(b.t)); if (u) name = u.name; }
    } catch (e) { vid = null; }
    if (vid && VID.test(vid)) {
      try {
        /* Signing in mid-visit binds the browser to the account without
           counting another visit: the earlier visits from it get the name. */
        if (bind) { if (name) await store.bind(vid, name); }
        else await store.hit(today(), vid, Date.now(), name);
      } catch (e) { console.error("hit:", e && e.message); }
    }
    res.writeHead(204).end();
    return true;
  }
  return { route, today };
}

module.exports = { makeVisits };
