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
a room. It knows nothing about racing and stores nothing — a room exists
while someone is in it and is forgotten when the last player leaves.

It is deployed alongside the game by the same blueprint. The page finds it by
name (`apexdraft` → `apexdraft-relay`), and `?relay=ws://localhost:8080`
points it somewhere else for local work.

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
