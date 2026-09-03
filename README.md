# Apex Draft

Draw a closed loop and it becomes a 3D circuit you drive immediately — elevation,
per-corner banking, kerbs, tyre walls, and lap/sector timing. No account, no install.

Open `index.html` in any modern browser, or host it as-is.

## Playing

- **Draw** a loop on the board, or load a preset. The direction you draw is the
  racing direction, and where you start becomes the start/finish line.
- **Bank a corner** by clicking its number on the map, then using the slider.
- **Drive it** — `WASD`/arrows, `Space` handbrake, `R` recover, `C` camera,
  `M` sound, `Esc` menu. On a phone, on-screen controls appear automatically.

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
