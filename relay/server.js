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
const { makeAuth } = require("./auth");
const { makeTracks } = require("./tracks");
const { makeLaps } = require("./laps");
const { makeAdmin } = require("./admin");
const { makeVisits } = require("./visits");

/* Accounts are the one thing here that does outlive a connection. The rooms
   above still know nothing and keep nothing; all an account does is settle
   what name goes on your car, so that it is yours and stays yours. */
const store = open();
const auth = makeAuth(store);
const tracks = makeTracks(store, auth.userFor);
const laps = makeLaps(store, auth.userFor);
const visits = makeVisits(store);
/* What is happening right now, for the admin desk. A socket only connects
   to host or join, so every socket is somebody in a party. */
const liveNow = () => ({
  players: wss ? wss.clients.size : 0,
  rooms: rooms.size,
  racing: [...rooms.values()].filter((r) => r.live).length,
});
const admin = makeAdmin(store, auth.userFor, liveNow);

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
      ws.car = m.car; ws.colour = m.colour;
      room.players.set(ws.id, ws);
      send(ws, { t: "hosted", code, id: ws.id });
      played();
      return;
    }

    if (m.t === "join") {
      leave(ws);
      const code = String(m.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: "err", m: "No party with that code." });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { t: "err", m: "That party is full." });
      await named(ws, m, "Driver");
      if (ws.readyState !== 1) return;
      ws.room = code;
      ws.car = m.car; ws.colour = m.colour;
      const peers = roomPeers(room, ws.id);
      room.players.set(ws.id, ws);
      /* The circuit the room is on and whether it is racing on it travel with
         the welcome, so a latecomer can go straight out rather than wait for
         a start that has already happened. The host is still asked below, in
         case what it has is newer than what the room remembers. */
      send(ws, { t: "joined", code, id: ws.id, hostId: room.hostId, peers,
                 live: !!room.live, track: room.track || null });
      played();
      broadcast(room, { t: "peer", id: ws.id, name: ws.name, car: ws.car, colour: ws.colour, acct: ws.acct }, ws.id);
      /* Ask the host to re-send the circuit for the newcomer. */
      const host = room.players.get(room.hostId);
      if (host) send(host, { t: "want-track", id: ws.id });
      return;
    }

    const room = ws.room && rooms.get(ws.room);
    if (!room) return;

    if (m.t === "track") {
      if (ws.id !== room.hostId) return;      // only the host sets the circuit
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
      ws.car = m.car; ws.colour = m.colour;
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
      broadcast(room, { t: "go" }, ws.id);
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
