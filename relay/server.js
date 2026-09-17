/* Apex Draft relay
 *
 * Rooms of players, addressed by a short code. The server knows nothing about
 * racing: it hands out codes, keeps track of who is in which room, and passes
 * messages between them. All the driving stays on the clients.
 *
 * It deliberately holds no history. A room exists while someone is in it and
 * is forgotten the moment the last player leaves, so there is nothing to
 * store, nothing to expire and nothing to leak.
 */
const http = require("http");
const { WebSocketServer } = require("ws");
const { open } = require("./store");
const { makeAuth, carAllowedFor } = require("./auth");
const { makeTracks } = require("./tracks");
const { makeLaps } = require("./laps");
const { makeAdmin } = require("./admin");
const { makeVisits } = require("./visits");
const { makePresence } = require("./presence");
const { makeStats } = require("./stats");
const { makeDaily } = require("./daily");
const { makeCheckout } = require("./checkout");
const { makePass } = require("./pass");
const { makeQuests } = require("./quests");
const { OPEN_CODE, openHour, openTrackFor } = require("./open");

/* Accounts are the one thing here that does outlive a connection. The rooms
   above still know nothing and keep nothing; all an account does is settle
   what name goes on your car, so that it is yours and stays yours. */
const store = open();
const auth = makeAuth(store);
const tracks = makeTracks(store, auth.userFor);
const daily = makeDaily();
/* Quests needs dailyMod for its day/week period keys, and both laps and
   pass report progress into it, so it's built before either. */
const quests = makeQuests(store, auth.userFor, daily);
const laps = makeLaps(store, auth.userFor, quests);
const visits = makeVisits(store, auth.userFor);
const presence = makePresence(store, auth.userFor);
setInterval(presence.sweep, 30_000).unref();
const checkout = makeCheckout(store, auth.userFor);
const pass = makePass(store, auth.userFor, daily, quests);
/* Yesterday's daily result only ever changes once, at the roll into a new
   day, so this only has to look often enough to catch that — grantXpOnce
   makes looking again harmless. */
setInterval(() => { if (store.ready) pass.rolloverDaily(); }, 15 * 60_000).unref();
const stats = makeStats(store, auth.userFor, daily);
/* What is happening right now, for the admin desk. A socket only connects
   to host or join, so every socket is somebody in a party. */
const liveNow = () => ({
  players: wss ? wss.clients.size : 0,
  rooms: [...rooms.values()].filter((r) => r.players.size).length,
  racing: [...rooms.values()].filter((r) => r.live && r.players.size).length,
});
const admin = makeAdmin(store, auth.userFor, liveNow, presence);

/* How many are on the open track right now, and what it is, for the
   multiplayer screen to show before anyone has actually joined it — the
   room itself (rooms.get(OPEN_CODE)) only exists once somebody has. */
async function openTrackRoute(req, res, url) {
  const { json, cors } = require("./auth");
  if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
  if (req.method !== "GET") return json(res, 405, { error: "Not allowed." }), true;
  const hour = openHour();
  const t = openTrackFor(hour);
  const room = rooms.get(OPEN_CODE);
  return json(res, 200, {
    code: OPEN_CODE,
    count: room ? room.players.size : 0,
    theme: t.opts.theme,
    endsAt: (hour + 1) * 3_600_000,
  }), true;
}

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 8;
const MAX_ROOMS = 500;
const IDLE_MS = 60_000;          // no traffic at all from a socket -> drop it
const MAX_MSG = 64 * 1024;       // a track is a few KB; nothing legitimate is bigger

/* Codes people read aloud, so no O/0 or I/1 to mishear. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();

function makeCode() {
  for (let attempt = 0; attempt < 40; attempt++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += ALPHABET[(Math.random() * ALPHABET.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return null;
}

let nextId = 1;
/* Counted in the store so the desk can show it across restarts; never
   allowed to fail the thing it is counting. */
function played() {
  if (store.ready !== true) return;
  store.playing(visits.today(), wss ? wss.clients.size : 0).catch((e) => console.error("played:", e && e.message));
}
const send = (ws, obj) => {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket is going away */ }
  }
};

function roomPeers(room, exceptId) {
  const out = [];
  for (const p of room.players.values()) {
    if (p.id !== exceptId) out.push({ id: p.id, name: p.name, car: p.car, colour: p.colour, acct: p.acct });
  }
  return out;
}

function broadcast(room, obj, exceptId) {
  /* players holds the sockets themselves, so this is the socket, not a
     wrapper around one. Reading a .ws off it threw on every broadcast — and
     since that happened inside the message handler it took the whole relay
     down with it, which is why a host stopped hearing anything the moment
     somebody joined. */
  for (const p of room.players.values()) {
    if (p.id !== exceptId) send(p, obj);
  }
}

function leave(ws) {
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;
  room.players.delete(ws.id);
  ws.room = null;
  if (room.players.size === 0) { rooms.delete(room.code); return; }
  /* The host leaving would strand everyone, so the room is handed to whoever
     has been in it longest rather than being torn down under them. */
  if (room.hostId === ws.id) {
    const next = room.players.values().next().value;
    room.hostId = next.id;
    broadcast(room, { t: "host", id: next.id });
  }
  broadcast(room, { t: "gone", id: ws.id });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, "http://" + (req.headers.host || "localhost")); }
  catch (e) { res.writeHead(400).end(); return; }

  /* A plain GET is how Render checks the service is alive, and how you can
     see at a glance that it is running. */
  if (url.pathname === "/health" || url.pathname === "/") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss ? wss.clients.size : 0 }));
    return;
  }

  /* The account desk, and the shelf of saved circuits beside it. They answer
     on the same service because it is the same small amount of work, and
     because one address is one thing to wake. */
  const handle = url.pathname === "/api/hit" ? visits.route
                : url.pathname === "/api/presence" ? presence.route
                : (url.pathname === "/api/me/stats" || url.pathname === "/api/wins") ? stats.route
                : url.pathname === "/api/daily" ? daily.route
                : url.pathname === "/api/open-track" ? openTrackRoute
                : url.pathname.startsWith("/api/checkout") ? checkout.route
                : url.pathname.startsWith("/api/pass") ? pass.route
                : url.pathname.startsWith("/api/quests") ? quests.route
                : url.pathname.startsWith("/api/tracks") ? tracks.route
                : url.pathname.startsWith("/api/laps") ? laps.route
                : url.pathname.startsWith("/api/admin") ? admin.route
                : auth.route;
  handle(req, res, url)
    .then((handled) => { if (!handled) res.writeHead(404).end(); })
    .catch((e) => {
      console.error("api:", e && e.message);
      if (res.headersSent) return;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Something went wrong at our end." }));
    });
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });

wss.on("connection", (ws) => {
  ws.id = String(nextId++);
  ws.room = null;
  ws.alive = true;
  ws.seen = Date.now();
  ws.on("pong", () => { ws.alive = true; });

  ws.on("message", (buf) => {
    ws.seen = Date.now();
    let m;
    try { m = JSON.parse(buf); } catch (e) { return; }
    if (!m || typeof m.t !== "string") return;
    /* One unexpected message must never be able to take the relay down for
       everyone in every room, which is exactly what the broadcast bug did.
       handle is a promise now — looking an account up is a round trip — so
       a rejection has to be caught as well as a throw. */
    try {
      const r = handle(ws, m);
      if (r && r.catch) r.catch((e) => console.error("handler:", e && e.message));
    } catch (e) { console.error("handler:", e && e.message); }
  });

  /* A signed-in player races under the name on their account, and the name
     comes from the token rather than from the message: a name you can type
     is a name you can type somebody else's into. */
  async function named(ws, m, fallback) {
    let acct = null;
    try { acct = await auth.userFor(m.token); } catch (e) { console.error("auth:", e && e.message); }
    ws.acct = !!acct;
    ws.name = acct ? acct.name : String(m.name || fallback).slice(0, 16);
    /* Cached here rather than re-fetched per message: a car claimed later,
       in a "meta", is checked against what was already looked up at
       host/join rather than trusting the token freshly each time. */
    ws.cars = acct ? acct.cars : "";
  }

  /* A car a room hears about — at host, at join, or later in a "meta" — only
     ever reaches another player's screen once it is checked against what
     the account actually owns; a guest (no account) gets the free set.
     The one exception is the open track, where every car is the point:
     a room is passed in so that bypass is a property of which room this
     is, not of who is asking, and carAllowedFor itself — shared with the
     lap route — stays exactly as strict as it has always been. */
  function ownedCar(ws, claimed, room) {
    const id = String(claimed || "gt").slice(0, 16);
    if (room && room.openTrack) return id;
    return carAllowedFor(ws.cars, id) ? id : "gt";
  }

  async function handle(ws, m) {

    if (m.t === "host") {
      leave(ws);
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: "err", m: "The relay is full — try again shortly." });
      await named(ws, m, "Host");
      if (ws.readyState !== 1) return;            // gone while we were looking
      const code = makeCode();
      if (!code) return send(ws, { t: "err", m: "Could not allocate a code." });
      const room = { code, hostId: ws.id, players: new Map() };
      rooms.set(code, room);
      ws.room = code;
      ws.car = ownedCar(ws, m.car, room); ws.colour = String(m.colour || "#8FA3A0").slice(0, 12);
      room.players.set(ws.id, ws);
      send(ws, { t: "hosted", code, id: ws.id });
      played();
      return;
    }

    if (m.t === "join") {
      leave(ws);
      const code = String(m.code || "").toUpperCase().trim();
      let room = rooms.get(code);
      /* The open track isn't hosted by anyone in particular — whoever
         turns up first on a given hour makes the room exist, on the
         circuit the hour itself already decided, not one they drew. */
      if (!room && code === OPEN_CODE) {
        const hour = openHour();
        room = { code: OPEN_CODE, hostId: null, players: new Map(),
                 openTrack: true, trackHour: hour, track: openTrackFor(hour) };
        rooms.set(OPEN_CODE, room);
      }
      if (!room) return send(ws, { t: "err", m: "No party with that code." });
      if (room.players.size >= MAX_PLAYERS)
        return send(ws, { t: "err", m: room.openTrack ? "The open track is full for now — try again shortly." : "That party is full." });
      await named(ws, m, "Driver");
      if (ws.readyState !== 1) return;
      ws.room = code;
      ws.car = ownedCar(ws, m.car, room); ws.colour = String(m.colour || "#8FA3A0").slice(0, 12);
      const peers = roomPeers(room, ws.id);
      room.players.set(ws.id, ws);
      if (room.openTrack && room.hostId == null) room.hostId = ws.id;   // first in takes the wheel
      /* The circuit the room is on and whether it is racing on it travel with
         the welcome, so a latecomer can go straight out rather than wait for
         a start that has already happened. The host is still asked below, in
         case what it has is newer than what the room remembers. */
      send(ws, { t: "joined", code, id: ws.id, hostId: room.hostId, peers,
                 live: !!room.live, track: room.track || null,
                 cfg: room.cfg || null, race: room.race || null });
      played();
      broadcast(room, { t: "peer", id: ws.id, name: ws.name, car: ws.car, colour: ws.colour, acct: ws.acct }, ws.id);
      if (room.ai && room.ai.length) send(ws, { t: "aiset", cars: room.ai });
      /* Ask the host to re-send the circuit for the newcomer — except on
         the open track, where the circuit just sent above is already the
         relay's own and final answer, not a stand-in for one the "host"
         is about to draw. */
      if (!room.openTrack) {
        const host = room.players.get(room.hostId);
        if (host) send(host, { t: "want-track", id: ws.id });
      }
      return;
    }

    const room = ws.room && rooms.get(ws.room);
    if (!room) return;

    if (m.t === "track") {
      /* On the open track the circuit is the relay's to set, on the hour
         — not the "host" seat's, which only exists there so somebody can
         still start the race. */
      if (ws.id !== room.hostId || room.openTrack) return;
      room.track = m.data;
      broadcast(room, { t: "track", data: m.data }, ws.id);
      return;
    }
    if (m.t === "state") {
      /* The hot path: position updates, several times a second per player.
         Stamped with the sender so nobody can drive anyone else's car. */
      broadcast(room, { t: "state", id: ws.id, p: m.p }, ws.id);
      return;
    }
    if (m.t === "meta") {
      ws.car = ownedCar(ws, m.car, room); ws.colour = String(m.colour || "#8FA3A0").slice(0, 12);
      /* An account name is not the client's to change. */
      if (m.name && !ws.acct) ws.name = String(m.name).slice(0, 16);
      broadcast(room, { t: "meta", id: ws.id, name: ws.name, car: ws.car, colour: ws.colour, acct: ws.acct }, ws.id);
      return;
    }
    if (m.t === "lap") {
      broadcast(room, { t: "lap", id: ws.id, ms: m.ms, lap: m.lap }, ws.id);
      return;
    }
    if (m.t === "go") {
      /* Only the host sends everyone out on track, for the same reason only
         the host sets the circuit. */
      if (ws.id !== room.hostId) return;
      room.live = true;                    // and stays so while the room lasts
      room.race = null;                    // practice: no laps to count
      broadcast(room, { t: "go" }, ws.id);
      return;
    }
    /* ---- a race: so many laps, from a grid the host set ---- */
    const raceCfg = (m) => ({
      laps: Math.max(0, Math.min(50, m.laps | 0)),
      grid: Array.isArray(m.grid) ? m.grid.map(String).slice(0, MAX_PLAYERS) : [],
    });
    if (m.t === "rcfg") {
      /* the settings as the host changes them, so the room can see what it
         is about to line up for; kept, so a latecomer sees them too */
      if (ws.id !== room.hostId) return;
      room.cfg = raceCfg(m);
      broadcast(room, Object.assign({ t: "rcfg" }, room.cfg), ws.id);
      return;
    }
    if (m.t === "race") {
      if (ws.id !== room.hostId) return;
      room.live = true;
      room.race = raceCfg(m);
      room.cfg = room.race;
      broadcast(room, Object.assign({ t: "race" }, room.race), ws.id);
      return;
    }
    /* ---- opponents in a party ----
       Only the host runs them. The machines are simulated on one machine and
       everybody else is told where they are, because a field simulated
       separately on each browser would be a different field on each screen
       within a corner. The room keeps the last field so somebody arriving
       late is told about them too. */
    if (m.t === "aiset") {
      if (ws.id !== room.hostId) return;
      room.ai = Array.isArray(m.cars) ? m.cars.slice(0, 12).map((c) => ({
        id: String(c.id).slice(0, 12), name: String(c.name || "Driver").slice(0, 24),
        car: String(c.car || "gt").slice(0, 16), colour: String(c.colour || "#8FA3A0").slice(0, 12),
      })) : [];
      broadcast(room, { t: "aiset", cars: room.ai }, ws.id);
      return;
    }
    if (m.t === "aist") {
      if (ws.id !== room.hostId) return;
      broadcast(room, { t: "aist", a: Array.isArray(m.a) ? m.a.slice(0, 12) : [] }, ws.id);
      return;
    }
    if (m.t === "aifin") {
      if (ws.id !== room.hostId) return;
      broadcast(room, { t: "aifin", id: String(m.id).slice(0, 12), ms: +m.ms || 0 }, ws.id);
      return;
    }
    if (m.t === "rlap") {
      broadcast(room, { t: "rlap", id: ws.id, lap: m.lap | 0, ms: +m.ms || 0 }, ws.id);
      return;
    }
    if (m.t === "finish") {
      broadcast(room, { t: "finish", id: ws.id, ms: +m.ms || 0 }, ws.id);
      return;
    }
    if (m.t === "bye") { leave(ws); return; }
  }

  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});

/* Drop sockets that have stopped answering, so rooms do not fill up with
   players whose laptop lid closed somewhere. */
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (!ws.alive || now - ws.seen > IDLE_MS) { try { ws.terminate(); } catch (e) {} continue; }
    ws.alive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 20_000);

/* The open track rotates on the hour even if it never empties out — but
   only while nobody on it is actually racing, so the circuit never
   changes under a lap in progress. A room mid-race just waits for the
   next quiet minute to catch up. */
setInterval(() => {
  const room = rooms.get(OPEN_CODE);
  if (!room || !room.openTrack || room.live) return;
  const hour = openHour();
  if (room.trackHour === hour) return;
  room.trackHour = hour;
  room.track = openTrackFor(hour);
  broadcast(room, { t: "track", data: room.track }, null);
}, 60_000).unref();

/* The tables have to be made before the first request can use them, and
   nothing was making them: every signup answered 500 because users did not
   exist. The store is not ready until this has run, and the account desk
   says so plainly rather than blaming the request.

   Parties do not touch the store at all, so the server listens either way. A
   database that is slow to come up, or down altogether, must not take the
   racing down with it — and Render's health check needs an answer regardless. */
store.ready = false;
(async () => {
  for (let attempt = 1; ; attempt++) {
    try {
      await store.init();
      store.ready = true;
      console.log("accounts ready (" + store.kind + ")");
      laps.sweep();                 // times that could not have been driven come off
      return;
    } catch (e) {
      console.error("account store attempt " + attempt + ":", e && e.message);
      if (attempt >= 5) {
        console.error("Accounts are unavailable. Parties still work.");
        return;
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
})();

server.listen(PORT, () => console.log("apexdraft relay listening on " + PORT));
