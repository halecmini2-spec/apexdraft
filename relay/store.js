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
  let db = { users: [], sessions: [], tracks: [], laps: [] };
  let writing = null, again = false;

  try {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
    db.users = db.users || [];
    db.sessions = db.sessions || [];
    db.tracks = db.tracks || [];
    db.laps = db.laps || [];
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

    /* Newest first, which is the order they are wanted in. */
    async tracks(userId) {
      return db.tracks.filter((t) => t.user_id === userId)
                      .sort((a, b) => b.created - a.created);
    },
    async trackNamed(userId, lower) {
      return db.tracks.find((t) => t.user_id === userId && t.name.toLowerCase() === lower) || null;
    },
    async putTrack(t) {
      const i = db.tracks.findIndex((x) => x.id === t.id);
      if (i >= 0) db.tracks[i] = t; else db.tracks.push(t);
      await save();
      return t;
    },
    async dropTrack(userId, id) {
      const before = db.tracks.length;
      db.tracks = db.tracks.filter((t) => !(t.id === id && t.user_id === userId));
      if (db.tracks.length !== before) await save();
      return db.tracks.length !== before;
    },

    /* One row per person per circuit: their best, not every lap they drove.
       Returns the time that ended up standing, which is the only answer that
       does not depend on how a driver counts a row it decided not to
       change. */
    async putLap(l) {
      const i = db.laps.findIndex((x) => x.circuit === l.circuit && x.user_id === l.user_id);
      if (i >= 0) {
        if (l.ms < db.laps[i].ms) db.laps[i] = l;
      } else db.laps.push(l);
      await save();
      const now = db.laps.find((x) => x.circuit === l.circuit && x.user_id === l.user_id);
      return now ? now.ms : null;
    },
    async board(circuit, limit) {
      return db.laps.filter((l) => l.circuit === circuit)
                    .sort((a, b) => a.ms - b.ms)
                    .slice(0, limit);
    },
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
      /* Circuits somebody wants to keep. The data is the same shape that goes
         down the wire to a party, held as text: the server has no reason to
         look inside a circuit, only to hand it back. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tracks (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          name_lower TEXT NOT NULL,
          data       TEXT NOT NULL,
          created    BIGINT NOT NULL
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS tracks_user ON tracks(user_id)`);
      /* One name, one circuit: saving over a name you have used replaces it
         rather than leaving you two of them to tell apart. */
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tracks_user_name ON tracks(user_id,name_lower)`);
      /* Fastest laps, one row per person per circuit. The name is copied in
         rather than joined for: a board is read far more often than it is
         written, and a username never changes. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS laps (
          circuit TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name    TEXT NOT NULL,
          ms      BIGINT NOT NULL,
          car     TEXT NOT NULL,
          at      BIGINT NOT NULL,
          PRIMARY KEY (circuit, user_id)
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS laps_board ON laps(circuit,ms)`);
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

    async tracks(userId) {
      return (await pool.query(
        `SELECT * FROM tracks WHERE user_id=$1 ORDER BY created DESC`, [userId]
      )).rows;
    },
    trackNamed: (userId, lower) =>
      one(`SELECT * FROM tracks WHERE user_id=$1 AND name_lower=$2`, [userId, lower]),
    async putTrack(t) {
      await pool.query(
        `INSERT INTO tracks (id,user_id,name,name_lower,data,created)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (user_id,name_lower)
         DO UPDATE SET data=EXCLUDED.data, name=EXCLUDED.name, created=EXCLUDED.created`,
        [t.id, t.user_id, t.name, t.name_lower, t.data, t.created]
      );
      return t;
    },
    async dropTrack(userId, id) {
      const r = await pool.query(`DELETE FROM tracks WHERE user_id=$1 AND id=$2`, [userId, id]);
      return r.rowCount > 0;
    },

    async putLap(l) {
      /* Only if it beats what is already there. The condition is in the
         statement rather than in a read-then-write, so two laps finishing at
         once cannot leave the slower one standing. */
      await pool.query(
        `INSERT INTO laps (circuit,user_id,name,ms,car,at) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (circuit,user_id)
         DO UPDATE SET ms=EXCLUDED.ms, car=EXCLUDED.car, at=EXCLUDED.at, name=EXCLUDED.name
         WHERE laps.ms > EXCLUDED.ms`,
        [l.circuit, l.user_id, l.name, l.ms, l.car, l.at]
      );
      /* Reading back what stands beats counting rows: a DO UPDATE that
         declined to fire is not reported the same way everywhere. */
      const r = await one(`SELECT ms FROM laps WHERE circuit=$1 AND user_id=$2`, [l.circuit, l.user_id]);
      return r ? Number(r.ms) : null;
    },
    async board(circuit, limit) {
      return (await pool.query(
        `SELECT name,ms,car,at FROM laps WHERE circuit=$1 ORDER BY ms ASC LIMIT $2`,
        [circuit, limit]
      )).rows;
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
