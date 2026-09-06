# Apex Draft

Draw a closed loop and it becomes a 3D circuit you drive immediately — elevation,
per-corner banking, kerbs, tyre walls, and lap/sector timing. No account, no install.

Open `index.html` in any modern browser, or host it as-is.

## Playing

- **Draw** a loop on the board. The direction you draw is the racing
  direction, and where you start becomes the start/finish line.
- **Bank a corner** by clicking its number on the map, then using the slider.
- **Pick a car** — a GT racer, a Formula single-seater, a kart with no top
  end and enormous grip, or a Yaris that never quite settles on its springs.
  Each keeps its own best lap, since they don't lap at the same pace.
- **Drive it** — `WASD`/arrows, `R` recover, `C` camera, `M` sound, `Esc`
  menu. On a phone, on-screen controls appear automatically.
- **Fullscreen** — on Android the browser is asked for it as you go out on
  track, and there is a toggle in the pause menu. iPhone Safari has no
  Fullscreen API at all, so there the route is Add to Home Screen: the page
  is set up to launch standalone, with no browser around it.
- **Lock the rear** by holding the brake. A stab slows you down; keep it
  pinned and the back end lets go — at the cost of some braking, because a
  locked wheel stops the car worse than one on the edge of grip.

## Racing other people

**Host** a party and you get a four-character code. Anyone who enters it joins
you, and the circuit you have drawn is sent to them — they don't need to draw
anything. Everyone drives their own car on their own machine; you see each
other live, and you drive through each other rather than colliding, so two
machines can never disagree about a crash.

The relay that carries the messages is in [`relay/`](relay/): a small
websocket server that hands out codes and passes messages between players in
a room. It knows nothing about racing and keeps nothing about a race — a room
exists while someone is in it and is forgotten when the last player leaves.

It is deployed alongside the game by the same blueprint. The page finds it by
name (`apexdraft` → `apexdraft-relay`), and `?relay=ws://localhost:8080`
points it somewhere else for local work.

## Accounts

Optional, and they settle one thing: the name other people see on your car.
Sign in from the bar along the top — a username, an email and a password, and
nothing else asked for. You can host and join parties without one.

The name comes from the session token rather than from the client, so a
signed-in driver races under their own name and nobody else can turn up
wearing it.

### Saved circuits

**Tracks** in the top bar is a shelf of circuits you have kept. Name the one
on the board and save it; load one back and it replaces what you are drawing,
keeping your car and colour. Hosting a party and loading one sends it to
everyone, since the circuit is the host's to set.

Each is drawn from its own points in the list, because a row of names tells
you nothing about which lap is which. Thirty per account, and saving over a
name you have used replaces that circuit rather than leaving you two you
can't tell apart — it asks first.

They live with the account, so they are there on whatever you next sit down
at. That also means they need one: signed out, the page says so rather than
keeping them somewhere that won't last.

### Fastest laps

Every circuit has its own leaderboard — a lap time means nothing except
against the same layout, so one big list would just crown the shortest
scribble. Pause mid-race to see it: everyone who has driven that circuit,
their best lap and what car they set it in.

The circuit is identified by what it is made of rather than by who saved it,
so two people who drew — or were sent — the same layout land on the same
board without anybody publishing anything. The key is taken from the drawing
and the settings that shape it, measured from the circuit's own corner so
that re-centring it on a differently shaped board doesn't move it to a
different board. Change the width, the elevation or the smoothing and it is a
different circuit, because it is a different lap; change the scenery and it
is not.

While you race other people there is a live order of the room under the
timing tower, fed by everyone's improvements as they set them.

Every other car carries a name tag in their colour, with how far away they
are. When they are off the screen — behind you, or round the next corner —
the tag pins itself to the edge nearest them and points, so you always know
where somebody is even when you cannot see them.

**Contact** — whether cars touch or drive through each other — is in the
pause menu as well as on the drawing board, since it is the sort of thing you
decide two laps in. Only the host can change it: if one car is solid and the
other is not, one of you gets shoved and the other feels nothing.

Times need an account to appear, but the board is readable without one.

**A lap time is a claim.** The physics run in the browser, so the server
cannot referee one, and all it checks is that a time is plausible. Treat the
board as a scoreboard among people you know rather than as a record book.

### Admin

Accounts named in `ADMIN_USERS` on the relay (comma-separated usernames, set
in the Render dashboard) get an **Admin** section on their account page and
two extra controls on the leaderboard. Everything there removes something —
an account and everything it saved, one lap time, a whole board — and
nothing creates or edits, which is the whole of moderating a game whose lap
times are claims the server cannot referee.

There is deliberately no way to become an admin from inside the game, and an
admin cannot delete their own account or another admin's from there. Every
removal is logged on the relay with who did it.

### The small print

There is **no verification email and no password reset**, and the UI says so
where you choose a password. Passwords are hashed with scrypt and a random
salt per account; sessions are stored as a hash of the token, so a copy of
the database is not a set of keys to everyone's account.

Accounts are the one thing here that outlives a connection, so they need
somewhere to live:

- **`DATABASE_URL` set** — Postgres. The server creates its own tables.
  The blueprint declares a free Render database and wires this up, so
  applying it is all that is needed.
- **not set** — a JSON file beside the server, for local work. A free Render
  instance has no filesystem that survives a restart, so an account made
  there would not last the day. The server says as much at boot.

Render's free Postgres expires 30 days after it is created. To keep accounts
past that, make a database that doesn't expire — [Neon](https://neon.tech)'s
free tier is the usual choice — and set `DATABASE_URL` on the relay by hand.

To run the whole thing locally:

```
cd relay && npm install && node server.js
```

then open the game with `?relay=ws://localhost:8080`.

## Hosting

It's a single self-contained file. Drop `index.html` onto any static host
(GitHub Pages, Netlify, Cloudflare Pages) and it works — no build step, no backend.

three.js is loaded from a CDN, so the page needs an internet connection.

### Deploying to Render

`render.yaml` in this repo declares the site as a Render **static site**, so
there's nothing to configure by hand:

1. On [Render](https://dashboard.render.com), choose **New → Blueprint**.
2. Connect this repository. Render reads `render.yaml` and creates the site.
3. Click **Apply**. It's live in well under a minute.

Every push to `main` redeploys automatically.

There's deliberately no Dockerfile. A container would mean running an nginx web
service to hand over one HTML file — on Render that gives up the static tier's
CDN and never-sleeping free plan in exchange for cold starts.

## Built with

Vanilla JS + three.js (WebGL). Everything else — the tarmac texture, the sky,
the environment map, the car body — is generated procedurally at runtime.
