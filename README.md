# Apex Drawn

Draw a closed loop and it becomes a 3D circuit you drive immediately — elevation,
per-corner banking, kerbs, tyre walls, and lap/sector timing. No account, no install.

Open `index.html` in any modern browser, or host it as-is.

## Playing

- **Draw** a loop on the board. The direction you draw is the racing
  direction, and where you start becomes the start/finish line.
- **Bank a corner** by clicking its number on the map, then using the slider.
- **Start line** — it sits where you began drawing unless you move it:
  **Move the start line** on the board, then tap the circuit. Either way, a
  line that lands in a really tight corner slides back to the straight just
  before it, and the board shows both places — a dotted marker where it was
  asked for, the checkered line where it is. Corners are numbered from the
  line, and a banked corner keeps its angle when the numbers change.
- **Pick a car** in the garage, which is where **Drive it** takes you: a GT
  racer, a Formula single-seater, a kart with no top end and enormous grip,
  or a Yaris that never quite settles on its springs, each drawn from its own
  model in the colour you choose. Each keeps its own best lap, since they
  don't lap at the same pace. The garage is in the pause menu too.
- **Drive it** — `WASD`/arrows, `R` recover, `C` camera, `M` sound, `Esc`
  menu. On a phone, on-screen controls appear automatically.
- **Fullscreen** — on Android the browser is asked for it as you go out on
  track, and there is a toggle in the pause menu. iPhone Safari has no
  Fullscreen API at all, so there the route is Add to Home Screen: the page
  is set up to launch standalone, with no browser around it.
- **The Yaris has a beat.** An original drill track — sliding 808s, a
  clapped snare, rolling hats, a dark piano line — synthesised in the
  browser while it is driven; nothing is a file and nothing is anyone's
  record. It stops with the pause menu and on the board, and has its own
  switch in the pause menu, separate from the engine sound.
- **Lock the rear** by holding the brake. A stab slows you down; keep it
  pinned and the back end lets go — at the cost of some braking, because a
  locked wheel stops the car worse than one on the edge of grip.

## Racing other people

**Host** a party and you get a four-character code. Anyone who enters it joins
you, and the circuit you have drawn is sent to them — they don't need to draw
anything. Everyone drives their own car on their own machine; you see each
other live, and you drive through each other rather than colliding, so two
machines can never disagree about a crash.

Once the host has started, the room is live: anyone who joins — or comes
back after leaving — goes straight out onto the circuit, and a guest who
steps back to the board gets a **Join the race** button instead of a wait.
It stays live for as long as the party does — the host stepping back to
the board to change something does not close it, and whoever goes out next
goes out onto the circuit as it now is.

**Garage**, in the pause menu, changes car without leaving the track: the
new car is built where you are and you restart from the line, since its
laps are a different record. Everyone in the party sees the change.

The relay that carries the messages is in [`relay/`](relay/): a small
websocket server that hands out codes and passes messages between players in
a room. It knows nothing about racing and keeps nothing about a race — a room
exists while someone is in it and is forgotten when the last player leaves.

It is deployed alongside the game by the same blueprint. The page finds it by
name (`apexdrawn` → `apexdrawn-relay`), and `?relay=ws://localhost:8080`
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

The desk also counts: who is playing right now, visits and different people
today and all time, parties started, accounts, and a thirty-day chart. The
page sends one beacon per load carrying a random id its browser made up and
keeps; the relay stores a count per day against it. No address, no browser
string, no path — enough to say how many came, and nothing about any one of
them. Copies opened from disk or a dev server are not counted. The desk
also lists when the recent visits happened, on the admin's own clock, with
each browser shown as a short tag and marked as a newcomer or a return.
"People" means different browsers: a phone and a laptop count twice, two
people on one machine count once.

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

## Being found

The page carries what a search engine or a link preview needs: a real
document head with a description, Open Graph and Twitter cards, JSON-LD
describing it as a free browser racing game and track maker, a canonical
URL, a web manifest with icons, `robots.txt` and `sitemap.xml`, and the same
description as visible text on the board — an About section at the end of
the rail with real headings and an FAQ, which is also in the structured data.
Nothing is hidden: text a visitor cannot see is text search engines punish.

Bing, DuckDuckGo and Yandex are told about the page through IndexNow (the
key file at the root is what makes the ping ours). Google does not take
IndexNow, and ranking anywhere is up to the engines; submitting the sitemap
in Google Search Console is the one step worth doing by hand.

The game lives at https://apexdrawn.onrender.com/. It was Apex Draft, at
apexdraft.onrender.com: a Render service keeps the address it was created
with whatever it is later renamed, so the move meant new services under the
new names — the blueprint declares `apexdrawn` and `apexdrawn-relay`, and
the old address checks the new one is up and then sends people on. The
database kept its name, and the accounts with it.

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
