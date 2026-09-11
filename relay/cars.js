"use strict";
/* ---- who may drive what ----
   The page is a single file that every visitor downloads, so the gate in it
   can be edited by anyone who opens the developer tools. That gate decides
   what a driver is shown; it cannot decide what is true, and it was never
   able to. This decides what is true.

   Nothing here trusts the client. A lap claiming one of these cars from an
   account that does not hold it is refused and never reaches a board, so
   editing the page buys a private car that no one else can see and no time
   that counts. That is the most a client-side game can do, and it is the
   part that matters.

   When buying becomes possible, a purchase writes the car into the account's
   own list and this answers yes without another line being changed. */

const GATED = ["bike", "trike", "v12"];

const { isAdmin } = require("./admins");

const isGated = (car) => GATED.includes(String(car || "").toLowerCase());

/* the list written on the account, which is where a purchase will land */
function bought(user) {
  return String((user && user.cars) || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter((c) => GATED.includes(c));
}

/* Whoever runs the place has everything, and that is not a name written in
   the page for anyone to read and try — it is the admin list, which exists
   only in the dashboard of the service and cannot be granted from inside the
   game at all. Everybody else has what they have bought.

   It also means the public source no longer says whose account to go for. */
function ownedBy(user) {
  if (!user) return [];
  if (isAdmin(user)) return GATED.slice();
  return bought(user);
}

/* A daily hands the day's car to everybody for the day, whatever it is, so a
   gated car on a daily is not a claim anyone is making — the circuit decides
   it and the relay works it out for itself. */
const mayDrive = (user, car, onDaily) =>
  !isGated(car) || !!onDaily || ownedBy(user).includes(String(car).toLowerCase());

module.exports = { GATED, isGated, ownedBy, bought, mayDrive };
