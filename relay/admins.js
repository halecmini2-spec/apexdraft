"use strict";
/* ---- who is an admin ----
   One list, read from the environment, and the only way onto it is the
   dashboard of the service this runs on. There is deliberately no way to
   grant it from inside the game: an admin flag that could be set through the
   API is an admin flag anyone can set.

   It sits in its own file because two things need the answer and neither
   should have to reach through the other for it — the account desk, and
   what an account is allowed to drive.

   That second one is why this is worth more than a username. A name is
   written in the page and anyone can read it and try it; this is a value
   that exists only where the service is configured, on the far side of a
   login that has nothing to do with the game. */

const ADMINS = new Set(
  (process.env.ADMIN_USERS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);

/* Works from whichever the row carries: full user rows have name_lower, the
   admin listing has only name. */
const isAdmin = (u) => !!u && ADMINS.has(u.name_lower || String(u.name || "").toLowerCase());

/* Nothing prints the list — only whether there is one, so a relay that was
   deployed without it says so instead of quietly having no admins. */
const anyAdmins = () => ADMINS.size > 0;

module.exports = { isAdmin, anyAdmins };
