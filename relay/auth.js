/* Accounts: signing up, signing in, and saying who a token belongs to.
 *
 * Deliberately small. A username, an email and a password is the whole of
 * it — there is no password reset, no email verification and no profile, so
 * nothing here should imply otherwise to the person filling the form in.
 *
 * What it does take seriously is the password. It is hashed with scrypt and
 * never stored, logged or echoed back, and sessions are held as a hash of
 * the token rather than the token itself, so a copy of the database is not
 * a set of keys to everyone's account.
 */
const crypto = require("crypto");

const SESSION_MS = 90 * 24 * 60 * 60 * 1000;   // ninety days
const MAX_BODY = 4096;

/* ---------- passwords ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hash(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, SCRYPT.keylen, SCRYPT, (err, key) => {
      if (err) return reject(err);
      resolve(["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p,
               salt.toString("base64"), key.toString("base64")].join("$"));
    });
  });
}

function verify(password, stored) {
  return new Promise((resolve) => {
    const p = String(stored || "").split("$");
    if (p.length !== 6 || p[0] !== "scrypt") return resolve(false);
    const opts = { N: +p[1], r: +p[2], p: +p[3] };
    const salt = Buffer.from(p[4], "base64");
    const want = Buffer.from(p[5], "base64");
    if (!(opts.N > 0 && opts.r > 0 && opts.p > 0) || !want.length) return resolve(false);
    crypto.scrypt(password, salt, want.length, opts, (err, key) => {
      /* Constant time: a comparison that returns early on the first wrong
         byte tells an attacker how much of the hash they have right. */
      resolve(!err && key.length === want.length && crypto.timingSafeEqual(key, want));
    });
  });
}

/* A username nobody holds has to cost what a real one costs. Answering
   "no such account" without doing the work answers measurably sooner, and
   that difference is a list of who has an account here. Checking against a
   real hash of a value nobody knows spends the same scrypt either way.
   Computed once at startup, where blocking for a moment costs nothing. */
const DUMMY_HASH = (() => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(crypto.randomBytes(24), salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p,
          salt.toString("base64"), key.toString("base64")].join("$");
})();

const tokenHash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

/* ---------- what a name, an email and a password are allowed to be ---------- */

/* Names people type at each other across a lobby. Letters, digits and an
   underscore only: no spaces to pad a name out with, and no lookalike
   punctuation to wear somebody else's name with. */
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const RESERVED = new Set([
  "host", "admin", "administrator", "you", "driver", "apexdraft", "apex",
  "system", "root", "moderator", "mod", "null", "undefined", "anonymous",
]);

function nameProblem(name) {
  if (!name) return "Pick a username.";
  if (name.length < 3) return "Usernames are at least 3 characters.";
  if (name.length > 16) return "Usernames are at most 16 characters.";
  if (!NAME_RE.test(name)) return "Letters, numbers and underscores only.";
  if (RESERVED.has(name.toLowerCase())) return "That username is reserved.";
  return null;
}

/* Not a validator so much as a typo catch: there is no verification mail, so
   the only thing this can honestly check is that it looks like an address. */
function emailProblem(email) {
  if (!email) return "Enter an email address.";
  if (email.length > 120) return "That email address is too long.";
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return "That doesn't look like an email address.";
  return null;
}

function passProblem(pass) {
  if (!pass) return "Pick a password.";
  if (pass.length < 8) return "Passwords are at least 8 characters.";
  if (pass.length > 200) return "That password is too long.";
  return null;
}

/* ---------- keeping the guessing down ---------- */

/* In memory on purpose: it protects against someone hammering the service
   now, and a restart clearing it costs nothing. */
const buckets = new Map();
function overRate(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.until) { buckets.set(key, { n: 1, until: now + windowMs }); return false; }
  b.n++;
  return b.n > limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.until) buckets.delete(k);
}, 60_000).unref();

/* ---------- http ---------- */

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const parts = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error("too big")); req.destroy(); return; }
      parts.push(c);
    });
    req.on("end", () => {
      if (!parts.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(parts).toString("utf8")) || {}); }
      catch (e) { reject(new Error("bad json")); }
    });
    req.on("error", reject);
  });
}

/* Behind Render's proxy the socket address is the proxy, so the client is
   whatever the proxy says it is — first hop only, since the rest of the
   header is whatever the client felt like sending. */
function clientIp(req) {
  const f = req.headers["x-forwarded-for"];
  if (typeof f === "string" && f) return f.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "?";
}

const publicUser = (u) => ({ name: u.name, email: u.email, created: Number(u.created) });

function makeAuth(store) {
  async function startSession(user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await store.putSession({
      token_hash: tokenHash(token),
      user_id: user.id,
      expires: Date.now() + SESSION_MS,
    });
    return token;
  }

  /* The one function the rest of the server cares about: a token in, an
     account out, or nothing. Used by the websocket side too, so that the
     name on a car is the name of an account and not something typed. */
  async function userFor(token) {
    if (!token || typeof token !== "string" || token.length > 200) return null;
    const s = await store.session(tokenHash(token));
    if (!s) return null;
    return store.userById(s.user_id);
  }

  function bearer(req) {
    const h = req.headers.authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  }

  /* Returns true when it has dealt with the request. */
  async function route(req, res, url) {
    if (!url.pathname.startsWith("/api/")) return false;

    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }

    /* Said once, here, rather than as a 500 on whichever query happened to
       run first. The rest of the game is unaffected, so say that too. */
    if (store.ready === false) {
      return json(res, 503, {
        error: "Accounts are unavailable just now. You can still host and join a party.",
      }), true;
    }

    const ip = clientIp(req);

    /* --- is this username free? --- */
    if (url.pathname === "/api/check" && req.method === "GET") {
      if (overRate("c:" + ip, 240, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      const name = String(url.searchParams.get("name") || "").trim();
      const problem = nameProblem(name);
      if (problem) return json(res, 200, { ok: false, error: problem }), true;
      const taken = !!(await store.userByName(name.toLowerCase()));
      return json(res, 200, { ok: !taken, error: taken ? "That username is taken." : null }), true;
    }

    if (url.pathname === "/api/me" && req.method === "GET") {
      const u = await userFor(bearer(req));
      if (!u) return json(res, 401, { error: "Not signed in." }), true;
      return json(res, 200, { user: publicUser(u) }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;

    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }

    /* --- signing up --- */
    if (url.pathname === "/api/signup") {
      if (overRate("s:" + ip, 12, 10 * 60_000))
        return json(res, 429, { error: "Too many accounts from here just now. Try again shortly." }), true;

      const name = String(body.username || "").trim();
      const email = String(body.email || "").trim();
      const pass = String(body.password || "");

      const problem = nameProblem(name) || emailProblem(email) || passProblem(pass);
      if (problem) return json(res, 400, { error: problem }), true;

      if (await store.userByName(name.toLowerCase()))
        return json(res, 409, { error: "That username is taken." }), true;
      if (await store.userByEmail(email.toLowerCase()))
        return json(res, 409, { error: "That email already has an account." }), true;

      const user = {
        id: crypto.randomUUID(),
        name,
        name_lower: name.toLowerCase(),
        email,
        email_lower: email.toLowerCase(),
        pass: await hash(pass),
        created: Date.now(),
      };
      try { await store.createUser(user); }
      catch (e) {
        /* Two people picking the same name in the same instant land here:
           the unique index caught what the check above could not. */
        return json(res, 409, { error: "That username is taken." }), true;
      }
      const token = await startSession(user);
      return json(res, 200, { token, user: publicUser(user) }), true;
    }

    /* --- signing in --- */
    if (url.pathname === "/api/signin") {
      const name = String(body.username || "").trim();
      const pass = String(body.password || "");
      if (overRate("i:" + ip, 30, 10 * 60_000) || overRate("u:" + name.toLowerCase(), 10, 10 * 60_000))
        return json(res, 429, { error: "Too many attempts. Wait a few minutes." }), true;
      if (!name || !pass) return json(res, 400, { error: "Enter your username and password." }), true;

      const user = await store.userByName(name.toLowerCase());
      /* The same answer either way. Saying "no such user" tells whoever is
         guessing which half of the pair they have already got right. */
      const ok = await verify(pass, user ? user.pass : DUMMY_HASH);
      if (!user || !ok) return json(res, 401, { error: "That username and password don't match." }), true;

      const token = await startSession(user);
      return json(res, 200, { token, user: publicUser(user) }), true;
    }

    /* --- signing out --- */
    if (url.pathname === "/api/signout") {
      const t = bearer(req) || body.token;
      if (t) await store.dropSession(tokenHash(t));
      return json(res, 200, { ok: true }), true;
    }

    return json(res, 404, { error: "No such endpoint." }), true;
  }

  return { route, userFor, cors };
}

module.exports = { makeAuth, hash, verify, nameProblem, emailProblem, passProblem };
