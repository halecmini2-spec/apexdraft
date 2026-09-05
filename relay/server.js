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
const send = (ws, obj) => {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* socket is going away */ }
  }
};

function roomPeers(room, exceptId) {
  const out = [];
  for (const p of room.players.values()) {
    if (p.id !== exceptId) out.push({ id: p.id, name: p.name, car: p.car, colour: p.colour });
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
  /* A plain GET is how Render checks the service is alive, and how you can
     see at a glance that it is running. */
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss ? wss.clients.size : 0 }));
    return;
  }
  res.writeHead(404).end();
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
       everyone in every room, which is exactly what the broadcast bug did. */
    try { handle(ws, m); } catch (e) { console.error("handler:", e && e.message); }
  });

  function handle(ws, m) {

    if (m.t === "host") {
      leave(ws);
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: "err", m: "The relay is full — try again shortly." });
      const code = makeCode();
      if (!code) return send(ws, { t: "err", m: "Could not allocate a code." });
      const room = { code, hostId: ws.id, players: new Map() };
      rooms.set(code, room);
      ws.room = code;
      ws.name = String(m.name || "Host").slice(0, 16);
      ws.car = m.car; ws.colour = m.colour;
      room.players.set(ws.id, ws);
      send(ws, { t: "hosted", code, id: ws.id });
      return;
    }

    if (m.t === "join") {
      leave(ws);
      const code = String(m.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: "err", m: "No party with that code." });
      if (room.players.size >= MAX_PLAYERS) return send(ws, { t: "err", m: "That party is full." });
      ws.room = code;
      ws.name = String(m.name || "Driver").slice(0, 16);
      ws.car = m.car; ws.colour = m.colour;
      const peers = roomPeers(room, ws.id);
      room.players.set(ws.id, ws);
      send(ws, { t: "joined", code, id: ws.id, hostId: room.hostId, peers });
      broadcast(room, { t: "peer", id: ws.id, name: ws.name, car: ws.car, colour: ws.colour }, ws.id);
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
      if (m.name) ws.name = String(m.name).slice(0, 16);
      broadcast(room, { t: "meta", id: ws.id, name: ws.name, car: ws.car, colour: ws.colour }, ws.id);
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

server.listen(PORT, () => console.log("apexdraft relay listening on " + PORT));
