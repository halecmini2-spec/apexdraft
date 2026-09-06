/* Counting visits.
 *
 * The page sends one small beacon when it loads: a random id its browser
 * made up and keeps. That is the whole of it — no address, no agent string,
 * no path, nothing that says who. What the server keeps is a count per day
 * per id, which is enough to say how many people came and how often, and
 * not enough to say anything about any one of them.
 */
const { json, readBody, cors, overRate, clientIp } = require("./auth");

const VID = /^[A-Za-z0-9_-]{8,40}$/;
const today = () => new Date().toISOString().slice(0, 10);   // UTC, so every machine agrees on the day

function makeVisits(store) {
  async function route(req, res, url) {
    if (url.pathname !== "/api/hit") return false;
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;
    /* Never an error to the page: a visit that could not be counted is not
       the visitor's problem. */
    cors(res);
    if (store.ready === false || overRate("h:" + clientIp(req), 40, 10 * 60_000)) { res.writeHead(204).end(); return true; }
    let vid = null;
    try { const b = await readBody(req, 512); vid = String(b.v || ""); } catch (e) { vid = null; }
    if (vid && VID.test(vid)) {
      try { await store.hit(today(), vid); } catch (e) { console.error("hit:", e && e.message); }
    }
    res.writeHead(204).end();
    return true;
  }
  return { route, today };
}

module.exports = { makeVisits };
