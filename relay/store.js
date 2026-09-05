/* Where accounts live.
 *
 * Two implementations behind one small interface. Which one you get depends
 * on whether DATABASE_URL is set:
 *
 *   Postgres   the real one. Accounts survive restarts, deploys and the
 *              free plan spinning the service down overnight.
 *   File       a JSON file, for working on this locally without standing a
 *              database up first.
 *
 * The file store is deliberately not the fallback in production. A free
 * Render web service has an ephemeral filesystem and restarts whenever it
 * has been idle, so a file store there does not lose accounts occasionally,
 * it loses them constantly — and an account that quietly disappears is worse
 * than no account at all. The server says so loudly at boot rather than
 * letting you find out from a player.
 */
const fs = require("fs");
const path = require("path");

/* ---------- file ---------- */

function fileStore(file) {
  let db = { users: [], sessions: [] };
  let writing = null, again = false;

  try {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
    db.users = db.users || [];
    db.sessions = db.sessions || [];
  } catch (e) { /* first run */ }

  /* One write at a time, and one more queued at most: a burst of signups
     must not interleave two writers over the same file. */
  function save() {
    if (writing) { again = true; return writing; }
    writing = fs.promises
      .writeFile(file + ".tmp", JSON.stringify(db))
      .then(() => fs.promises.rename(file + ".tmp", file))
      .catch((e) => console.error("store write:", e.message))
      .then(() => {
        writing = null;
        if (again) { again = false; return save(); }
      });
    return writing;
  }

  const now = () => Date.now();

  return {
    kind: "file",
    async init() {
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (e) {}
    },
    async userByName(lower) {
      return db.users.find((u) => u.name_lower === lower) || null;
    },
    async userByEmail(lower) {
      return db.users.find((u) => u.email_lower === lower) || null;
    },
    async userById(id) {
      return db.users.find((u) => u.id === id) || null;
    },
    async createUser(u) {
      db.users.push(u);
      await save();
      return u;
    },
    async putSession(s) {
      db.sessions.push(s);
      await save();
    },
    async session(tokenHash) {
      const s = db.sessions.find((x) => x.token_hash === tokenHash);
      if (!s) return null;
      if (s.expires <= now()) return null;
      return s;
    },
    async dropSession(tokenHash) {
      db.sessions = db.sessions.filter((x) => x.token_hash !== tokenHash);
      await save();
    },
    async sweep() {
      const n = now();
      const before = db.sessions.length;
      db.sessions = db.sessions.filter((x) => x.expires > n);
      if (db.sessions.length !== before) await save();
    },
    async count() { return db.users.length; },
  };
}

/* ---------- postgres ---------- */

function pgStore(url) {
  const { Pool } = require("pg");
  /* Managed Postgres — Render, Neon, Supabase — is TLS only, and presents a
     certificate this process has no root for. The connection is encrypted
     either way; what is given up is proof of who is on the other end, on a
     link that does not leave the provider's network. */
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
  });
  const one = async (sql, args) => (await pool.query(sql, args)).rows[0] || null;

  return {
    kind: "postgres",
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          name_lower  TEXT NOT NULL UNIQUE,
          email       TEXT NOT NULL,
          email_lower TEXT NOT NULL UNIQUE,
          pass        TEXT NOT NULL,
          created     BIGINT NOT NULL
        )`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires    BIGINT NOT NULL
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires)`);
    },
    userByName: (lower) => one(`SELECT * FROM users WHERE name_lower=$1`, [lower]),
    userByEmail: (lower) => one(`SELECT * FROM users WHERE email_lower=$1`, [lower]),
    userById: (id) => one(`SELECT * FROM users WHERE id=$1`, [id]),
    async createUser(u) {
      await pool.query(
        `INSERT INTO users (id,name,name_lower,email,email_lower,pass,created)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [u.id, u.name, u.name_lower, u.email, u.email_lower, u.pass, u.created]
      );
      return u;
    },
    async putSession(s) {
      await pool.query(
        `INSERT INTO sessions (token_hash,user_id,expires) VALUES ($1,$2,$3)
         ON CONFLICT (token_hash) DO UPDATE SET expires=EXCLUDED.expires`,
        [s.token_hash, s.user_id, s.expires]
      );
    },
    session: (h) => one(`SELECT * FROM sessions WHERE token_hash=$1 AND expires>$2`, [h, Date.now()]),
    async dropSession(h) { await pool.query(`DELETE FROM sessions WHERE token_hash=$1`, [h]); },
    async sweep() { await pool.query(`DELETE FROM sessions WHERE expires<=$1`, [Date.now()]); },
    async count() {
      const r = await one(`SELECT COUNT(*)::int AS n FROM users`);
      return r ? r.n : 0;
    },
  };
}

function open() {
  const url = process.env.DATABASE_URL;
  if (url) return pgStore(url);
  const file = process.env.ACCOUNTS_FILE || path.join(__dirname, ".accounts.json");
  console.warn(
    "\n  No DATABASE_URL — accounts are being kept in " + file + ".\n" +
    "  That is fine locally. On a free Render service the filesystem does not\n" +
    "  survive a restart, so every account would be lost: set DATABASE_URL.\n"
  );
  return fileStore(file);
}

module.exports = { open };
