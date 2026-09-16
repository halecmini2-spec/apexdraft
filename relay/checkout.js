/* Buying a car, for real money, through Stripe.
 *
 * The prices live here rather than trusting whatever a checkout request
 * claims a car costs — the client is one file everybody downloads, so the
 * price it sends is a suggestion, never the amount actually charged.
 *
 * Two ways a purchase reaches the account it belongs to. The redirect back
 * from Stripe calls /verify, which is instant but depends on the driver's
 * own browser making it back here. The webhook is what actually settles
 * it — Stripe calls that one directly, whether or not the tab is still
 * open — so both paths land on the same addCar, and addCar itself only
 * ever adds, so calling it twice for the same purchase costs nothing.
 */
const { json, cors, overRate, clientIp } = require("./auth");

/* Every price a pack or a shop card already shows, kept once. Changing a
   price here is the only place it needs to change — the client's own copy
   is what a driver reads before paying, not what they are charged. */
/* LMP1 used to be here too, back when the shop was the only way to a test
   car — it's the Apex Pass's own Level 10 now (relay/pass.js, FREE_PASS),
   not something a card should be able to buy a second way. */
const CARS = {
  bike: { name: "Superbike X",     pence: 50   },
  trike:{ name: "Rocket Trike",    pence: 50   },
  v12:  { name: "V12 Monster",     pence: 150  },
};

/* Where the tab comes back to. Render sets this on the relay itself if it's
   ever put behind a custom domain; until then the static site's own address
   is the only sane default, and a local run can point it at the dev server
   it's actually being opened from. */
const GAME_ORIGIN = process.env.GAME_ORIGIN || "https://apexdrawn.onrender.com";

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
} else {
  console.log("STRIPE_SECRET_KEY is not set: the shop cannot take payment yet");
}

/* Stripe signs the webhook body as it arrived on the wire — parsed and
   re-serialized JSON will not match the signature even when the content is
   identical, so this keeps the raw bytes rather than reusing auth's own
   readBody, which returns only the parsed object. */
function rawBody(req, max) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const parts = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > max) { reject(new Error("too big")); req.destroy(); return; }
      parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function makeCheckout(store, userFor) {
  /* Both settlement paths land here. Whichever gets there first wins;
     the other finds the car already added and does nothing further. */
  async function fulfil(userId, carId) {
    if (!CARS[carId]) return false;
    await store.addCar(userId, carId);
    return true;
  }

  async function route(req, res, url) {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }

    if (url.pathname === "/api/checkout/webhook") {
      if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        return json(res, 503, { error: "Webhook not configured." }), true;
      let event;
      try {
        const buf = await rawBody(req, 64 * 1024);
        event = stripe.webhooks.constructEvent(
          buf, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
      } catch (e) {
        console.log("checkout webhook: bad signature —", e.message);
        return json(res, 400, { error: "Bad signature." }), true;
      }
      if (event.type === "checkout.session.completed") {
        const s = event.data.object;
        if (s.payment_status === "paid" && s.metadata && s.metadata.userId && s.metadata.carId)
          await fulfil(s.metadata.userId, s.metadata.carId);
      }
      return json(res, 200, { received: true }), true;
    }

    /* Everything past here is a driver's own request, not Stripe's. */
    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Sign in to buy a car." }), true;

    if (url.pathname === "/api/checkout/session" && req.method === "POST") {
      if (!stripe) return json(res, 503, { error: "The shop can't take payment yet." }), true;
      if (overRate("co:" + clientIp(req), 20, 10 * 60_000))
        return json(res, 429, { error: "Slow down a moment." }), true;

      let body;
      try {
        const buf = await rawBody(req, 2048);
        body = buf.length ? JSON.parse(buf.toString("utf8")) : {};
      } catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }

      const carId = String(body.carId || "");
      const car = CARS[carId];
      if (!car) return json(res, 400, { error: "That isn't a car the shop sells." }), true;

      const owned = String(user.cars || "").split(",").map((s) => s.trim());
      if (owned.includes(carId))
        return json(res, 409, { error: "That one's already yours." }), true;

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          /* Not set: Managed Payments (on by default for newer Stripe
             accounts) picks the payment methods itself and rejects the
             session outright if this legacy parameter is present at all. */
          line_items: [{
            price_data: { currency: "gbp", product_data: { name: car.name }, unit_amount: car.pence },
            quantity: 1,
          }],
          /* Managed Payments (on by default on this account) requires this
             to be true rather than false or left out — the account's own
             error is explicit about it, and disabling it outright was the
             wrong read of an earlier, vaguer one. Stripe collects whatever
             address it needs for this on the Checkout page itself; nothing
             else here has to know about tax jurisdictions. */
          automatic_tax: { enabled: true },
          success_url: GAME_ORIGIN + "/?checkout=success&session_id={CHECKOUT_SESSION_ID}",
          cancel_url: GAME_ORIGIN + "/?checkout=cancel",
          client_reference_id: user.id,
          metadata: { userId: user.id, carId },
        });
        return json(res, 200, { url: session.url }), true;
      } catch (e) {
        console.log("checkout session:", e.message);
        return json(res, 502, { error: "Stripe couldn't start that just now." }), true;
      }
    }

    if (url.pathname === "/api/checkout/verify" && req.method === "GET") {
      if (!stripe) return json(res, 503, { error: "The shop can't take payment yet." }), true;
      const id = String(url.searchParams.get("session_id") || "");
      if (!id) return json(res, 400, { error: "No session to check." }), true;
      try {
        const session = await stripe.checkout.sessions.retrieve(id);
        if (session.payment_status !== "paid" || !session.metadata
            || session.metadata.userId !== user.id)
          return json(res, 200, { ok: false }), true;
        await fulfil(session.metadata.userId, session.metadata.carId);
        return json(res, 200, { ok: true, carId: session.metadata.carId }), true;
      } catch (e) {
        return json(res, 502, { error: "Couldn't check that with Stripe just now." }), true;
      }
    }

    return json(res, 404, { error: "No such endpoint." }), true;
  }

  return { route, CARS };
}

module.exports = { makeCheckout };
