/* The open track.
 *
 * One room that is always there: no code to share, no host, no waiting for
 * a start. It is live from the moment the relay comes up, and anyone who
 * presses the button lands on its circuit with whoever else is out there.
 *
 * The circuit is the relay's own — drawn here from the same kind of shape
 * the board opens on, in the drawing's own units, so every player builds
 * exactly the same lap — and it changes with the day (UTC), when the room
 * is empty, so that coming back tomorrow is coming back to something new.
 */
const CODE = "OPEN";          // not a code the relay can hand out: O is not in its alphabet
const NET_VER = 3;
const PAD_W = 1600, PAD_H = 1000, TAU = Math.PI * 2;

/* Five circuits, one per day of the week-and-a-bit. Harmonics on an oval,
   the way the default board shape is made, at a size that gives a lap of
   two and a half kilometres or so. */
const SHAPES = [
  { rx: 364, ry: 231, h: [[0.16, 2, 0.9], [0.12, 3, 2.1], [0.06, 5, 0.4]], theme: "alpine", width: 12, hills: 45, smooth: 45 },
  { rx: 392, ry: 210, h: [[0.22, 3, 1.3], [0.08, 4, 0.2]],                 theme: "desert", width: 13, hills: 20, smooth: 60 },
  { rx: 336, ry: 252, h: [[0.18, 2, 0.3], [0.14, 4, 1.9], [0.05, 7, 1.0]], theme: "dusk",   width: 12, hills: 60, smooth: 35 },
  { rx: 378, ry: 224, h: [[0.12, 2, 2.4], [0.16, 3, 0.7]],                 theme: "alpine", width: 11, hills: 70, smooth: 50 },
  { rx: 350, ry: 238, h: [[0.20, 3, 2.0], [0.10, 5, 1.1], [0.04, 8, 0.6]], theme: "desert", width: 14, hills: 30, smooth: 40 },
];

function loop(cfg, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    let r = 1;
    for (const h of cfg.h) r += h[0] * Math.sin(h[1] * a + h[2]);
    pts.push([+(PAD_W / 2 + Math.cos(a) * cfg.rx * r).toFixed(2), +(PAD_H / 2 + Math.sin(a) * cfg.ry * r).toFixed(2)]);
  }
  return pts;
}

const dayIndex = () => Math.floor(Date.now() / 86_400_000);

function trackFor(day) {
  const cfg = SHAPES[((day % SHAPES.length) + SHAPES.length) % SHAPES.length];
  return {
    v: NET_VER,
    raw: loop(cfg, 120),
    opts: { width: cfg.width, hills: cfg.hills, smooth: cfg.smooth, theme: cfg.theme,
            seed: 7 + (day % 11), banks: [], start: null, solid: false },
  };
}

/* The room object the relay keeps in its map, made once. */
function makeOpenRoom() {
  const day = dayIndex();
  return { code: CODE, hostId: null, players: new Map(), live: true, public: true, day, track: trackFor(day) };
}

/* Called whenever someone arrives: a new day and an empty room means a new
   circuit. Never while people are on it — a circuit changing under a car is
   the one thing this must not do. */
function refresh(room) {
  const day = dayIndex();
  if (day !== room.day && room.players.size === 0) { room.day = day; room.track = trackFor(day); }
}

module.exports = { CODE, makeOpenRoom, refresh, trackFor, SHAPES };
