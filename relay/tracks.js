/* Circuits somebody wants to keep.
 *
 * A saved circuit is exactly what a host sends a party — the same points and
 * the same settings — so loading one back is the same code path as being
 * handed one over the wire. The server never looks inside it beyond checking
 * it is the right shape; it stores it and hands it back.
 *
 * Saving is per account, so the circuits follow you to whatever you are
 * sitting at, which is the whole point of having somewhere to put them.
 */
const crypto = require("crypto");
const { json, readBody, cors, clientIp, overRate } = require("./auth");

const MAX_TRACKS = 30;
const MAX_NAME = 40;
const MAX_BODY = 96 * 1024;     // a circuit is a few KB; this is room to spare
const MAX_POINTS = 4000;

function nameProblem(name) {
  if (!name) return "Give it a name.";
  if (name.length > MAX_NAME) return "That name is too long.";
  /* Control characters would come back out into a list somewhere. Written as
     a loop rather than a regular expression: an escape for a control
     character is the sort of thing that gets mangled by whatever edits the
     file next, and it did. */
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 32 || c === 127) return "That name has characters that will not work.";
  }
  return null;
}

/* Enough of a check that nothing which cannot be drawn is kept. The client
   built this, but the client is whatever is on the other end of the wire. */
function dataProblem(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "That isn't a circuit.";
  if (!Array.isArray(d.raw)) return "That isn't a circuit.";
  if (d.raw.length < 8) return "That circuit is too short to save.";
  if (d.raw.length > MAX_POINTS) return "That circuit has too many points.";
  for (const p of d.raw) {
    if (!Array.isArray(p) || p.length !== 2) return "That isn't a circuit.";
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return "That isn't a circuit.";
  }
  if (!d.opts || typeof d.opts !== "object" || Array.isArray(d.opts)) return "That isn't a circuit.";
  if (Object.keys(d.opts).length > 60) return "That isn't a circuit.";
  return null;
}

const publicTrack = (t) => {
  let data = null;
  try { data = JSON.parse(t.data); } catch (e) { data = null; }
  return { id: t.id, name: t.name, created: Number(t.created), data };
};

function makeTracks(store, userFor) {
  function bearer(req) {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  }

  async function route(req, res, url) {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (store.ready === false) {
      return json(res, 503, {
        error: "Saved circuits are unavailable just now. You can still draw and drive.",
      }), true;
    }

    const user = await userFor(bearer(req));
    /* Circuits belong to an account. Without one there is nowhere to put them
       that would still be there tomorrow, and the page says so rather than
       quietly keeping them somewhere that will not last. */
    if (!user) return json(res, 401, { error: "Sign in to keep circuits." }), true;

    if (url.pathname === "/api/tracks" && req.method === "GET") {
      const rows = await store.tracks(user.id);
      return json(res, 200, { tracks: rows.map(publicTrack), max: MAX_TRACKS }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;

    let body;
    try { body = await readBody(req, MAX_BODY); }
    catch (e) {
      return json(res, 400, {
        error: (e && e.message === "too big")
          ? "That circuit is too big to save."
          : "That request didn't make sense.",
      }), true;
    }

    if (url.pathname === "/api/tracks/save") {
      if (overRate("t:" + clientIp(req), 60, 10 * 60_000))
        return json(res, 429, { error: "Slow down a moment." }), true;

      const name = String(body.name || "").trim().replace(/\s+/g, " ");
      const problem = nameProblem(name) || dataProblem(body.data);
      if (problem) return json(res, 400, { error: problem }), true;

      /* Saving over a name you have already used replaces that circuit. Two
         entries with the same name are two things you cannot tell apart in a
         list, which is worse than losing the older one on purpose — and the
         page asks before it does it. */
      const existing = await store.trackNamed(user.id, name.toLowerCase());
      if (!existing) {
        const rows = await store.tracks(user.id);
        if (rows.length >= MAX_TRACKS)
          return json(res, 409, {
            error: "That's " + MAX_TRACKS + " circuits saved — delete one to make room.",
          }), true;
      }

      const t = {
        id: existing ? existing.id : crypto.randomUUID(),
        user_id: user.id,
        name,
        name_lower: name.toLowerCase(),
        data: JSON.stringify({ raw: body.data.raw, opts: body.data.opts }),
        created: Date.now(),
      };
      await store.putTrack(t);
      return json(res, 200, { track: publicTrack(t), replaced: !!existing }), true;
    }

    if (url.pathname === "/api/tracks/delete") {
      const id = String(body.id || "");
      /* Scoped to the account inside the query, so an id from somewhere else
         deletes nothing rather than deleting somebody else's circuit. */
      const gone = await store.dropTrack(user.id, id);
      return json(res, 200, { ok: gone }), true;
    }

    return json(res, 404, { error: "No such endpoint." }), true;
  }

  return { route };
}

module.exports = { makeTracks };
