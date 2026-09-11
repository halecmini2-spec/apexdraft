"use strict";
/* ---- handing over a car ----
   The three cars that are not in the page are here, and they go out only to
   an account that holds one. A driver who is not entitled to a car is not
   given the shape of it, so there is nothing in their copy of the game to
   turn on: the gate they could have edited was guarding something that was
   never sent to them.

   Where this stops is worth being plain about. Anyone who is entitled has
   the car on their own machine from the moment they are given it, and could
   pass it on from there. No page that runs in somebody's browser can do
   better than that. What it does fix is the thing that actually happened:
   helping yourself out of your own copy of the file. */

const { json, cors } = require("./auth");
const carsMod = require("./cars");
const dailyMod = require("./daily");
/* The shapes themselves. They are deliberately not in the public repository
   — putting them there would hand them to exactly the people they are being
   kept from — so the file may be absent on a given deploy. If it is, the
   relay runs and the three cars are simply not on offer; it does not fall
   over for the sake of a car. */
let SOURCE = {};
try { SOURCE = require("./locked-cars").SOURCE || {}; }
catch (e) { console.log("no locked-cars.js here — the three bought cars are not being served"); }

function makeCarCode(userFor) {
  /* userFor is given the token, not the request */
  const bearer = (req) => {
    const h = String(req.headers.authorization || "");
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  };
  return async function route(req, res, url) {
    cors(res);
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return true; }
    if (req.method !== "GET") return json(res, 405, { error: "Not allowed." }), true;

    const user = await userFor(bearer(req));
    const held = new Set(carsMod.ownedBy(user));

    /* The daily hands the day's car to everybody for the day, and on a day
       whose car is one of these that has to include people who do not hold
       it — otherwise the daily simply would not run. It is the one way a
       car reaches someone who has not been given it, and it is the feature
       working as it was asked for rather than a hole in this. */
    const today = dailyMod.carFor(Math.floor(Date.now() / 86_400_000));
    if (carsMod.isGated(today)) held.add(today);

    const want = [...held].filter((c) => SOURCE[c]);
    const body = want.map((c) => SOURCE[c]).join("\n");

    res.setHeader("Access-Control-Allow-Origin", "*");
    /* Never let this sit in a shared cache: what comes back depends on who
       asked, and two drivers asking are owed different answers. */
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Vary", "Authorization");
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(body);
    return true;
  };
}

module.exports = { makeCarCode };
