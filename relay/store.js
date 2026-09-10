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
  let db = { users: [], sessions: [], tracks: [], laps: [], visits: {}, days: {}, log: [], ghosts: [], who: {}, wins: {} };
  let writing = null, again = false;

  try {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
    db.users = db.users || [];
    db.sessions = db.sessions || [];
    db.tracks = db.tracks || [];
    db.laps = db.laps || [];
    db.visits = db.visits || {};
    db.days = db.days || {};
    db.log = db.log || [];
    db.ghosts = db.ghosts || [];
    db.who = db.who || {};
    db.wins = db.wins || {};
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
    /* A word left on an account by an admin, which its owner sees the next
       time they are signed in. Empty clears it. */
    async setNotice(id, text) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return false;
      u.notice = text || null;
      await save();
      return true;
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
    async count(circuit) {
      return db.laps.filter((l) => l.circuit === circuit).length;
    },
    /* Where one driver stands on a board: their time, their place, and how
       many are on it. */
    async rank(circuit, userId) {
      const all = db.laps.filter((l) => l.circuit === circuit).sort((a, b) => a.ms - b.ms);
      const i = all.findIndex((l) => l.user_id === userId);
      return { count: all.length, ms: i >= 0 ? all[i].ms : null, rank: i >= 0 ? i + 1 : null };
    },
    /* The lap itself, as a run of positions, so it can be driven against. */
    async putGhost(circuit, userId, data) {
      const i = db.ghosts.findIndex((g) => g.circuit === circuit && g.user_id === userId);
      if (i >= 0) db.ghosts[i].data = data; else db.ghosts.push({ circuit, user_id: userId, data });
      await save();
    },
    async ghost(circuit) {
      const laps = db.laps.filter((l) => l.circuit === circuit).sort((a, b) => a.ms - b.ms);
      for (const l of laps) {
        const g = db.ghosts.find((x) => x.circuit === circuit && x.user_id === l.user_id);
        if (g) return { name: l.name, ms: l.ms, car: l.car, data: g.data };
      }
      return null;
    },
    async pruneGhosts(before) {
      const n = db.ghosts.length;
      db.ghosts = db.ghosts.filter((g) => !(g.circuit.startsWith("daily_") && g.circuit < before));
      if (db.ghosts.length !== n) await save();
    },

    /* ---- what an admin can see and undo ---- */
    async users() {
      return db.users.slice().sort((a, b) => b.created - a.created).map((u) => ({
        id: u.id, name: u.name, email: u.email, created: u.created, notice: u.notice || null,
        tracks: db.tracks.filter((t) => t.user_id === u.id).length,
        laps: db.laps.filter((l) => l.user_id === u.id).length,
      }));
    },
    async deleteUser(id) {
      const n = db.users.length;
      db.users = db.users.filter((u) => u.id !== id);
      if (db.users.length === n) return false;
      /* everything that hung off the account goes with it */
      db.sessions = db.sessions.filter((s) => s.user_id !== id);
      db.tracks = db.tracks.filter((t) => t.user_id !== id);
      db.laps = db.laps.filter((l) => l.user_id !== id);
      await save();
      return true;
    },
    async deleteLap(circuit, userId) {
      const n = db.laps.length;
      db.laps = db.laps.filter((l) => !(l.circuit === circuit && l.user_id === userId));
      if (db.laps.length !== n) await save();
      return db.laps.length !== n;
    },
    async wipeBoard(circuit) {
      const n = db.laps.length;
      db.laps = db.laps.filter((l) => l.circuit !== circuit);
      if (db.laps.length !== n) await save();
      return n - db.laps.length;
    },

    /* ---- how many came, and how many played ---- */
    async hit(day, vid, at, name) {
      const d = db.visits[day] || (db.visits[day] = {});
      d[vid] = (d[vid] || 0) + 1;
      /* when, as well as how many: the last month of them */
      db.log.push({ at: at || Date.now(), vid, name: name || null });
      /* Once a browser has been seen signed in, it is that person's — and
         so were its earlier visits, which can be named after the fact. */
      if (name) db.who[vid] = name;
      const cut = Date.now() - 31 * 86_400_000;
      if (db.log.length > 5000 || (db.log[0] && db.log[0].at < cut)) db.log = db.log.filter((l) => l.at >= cut).slice(-5000);
      await save();
    },
    /* The most recent visits, newest first, each marked as a first visit
       or a return — judged by whether the id had been seen on an earlier
       day. */
    async bind(vid, name) { db.who[vid] = name; await save(); },
    /* ---- what a driver has won ---- */
    async winsAdd(userId, kind) { const w = db.wins[userId] || (db.wins[userId] = { race: 0 }); w[kind] = (w[kind] | 0) + 1; await save(); return w; },
    async wins(userId) { return db.wins[userId] || { race: 0 }; },
    /* the fastest lap on every daily board: that day's winner */
    async dailyWinners() {
      const best = {};
      for (const l of db.laps) { if (!/^daily_\d{8}$/.test(l.circuit)) continue; if (!best[l.circuit] || l.ms < best[l.circuit].ms) best[l.circuit] = l; }
      return Object.values(best).map((l) => ({ circuit: l.circuit, user_id: l.user_id, name: l.name }));
    },
    /* ---- how long each page stayed ---- */
    async stay(vid, name, since, until) {
      db.stays = db.stays || [];
      db.stays.push({ vid, name: name || null, since, until });
      if (name) db.who[vid] = name;
      const cut = Date.now() - 31 * 86_400_000;
      if (db.stays.length > 3000 || (db.stays[0] && db.stays[0].since < cut)) db.stays = db.stays.filter((x) => x.since >= cut).slice(-3000);
      await save();
    },
    async stays(limit) {
      return (db.stays || []).slice(-limit).reverse().map((x) => ({ vid: x.vid, name: x.name || db.who[x.vid] || null, since: x.since, until: x.until }));
    },
    async recent(limit) {
      const out = db.log.slice(-limit).reverse();
      const first = {};
      for (const [day, m] of Object.entries(db.visits)) for (const v of Object.keys(m)) if (!first[v] || day < first[v]) first[v] = day;
      return out.map((l) => ({ at: l.at, vid: l.vid, name: l.name || db.who[l.vid] || null, known: !!l.name, first: first[l.vid] || null }));
    },
    async playing(day, players) {
      const d = db.days[day] || (db.days[day] = { plays: 0, peak: 0 });
      d.plays++; d.peak = Math.max(d.peak, players | 0);
      await save();
    },
    async stats(since) {
      const days = {};
      for (const [day, m] of Object.entries(db.visits)) {
        if (day < since) continue;
        const d = days[day] || (days[day] = { day, hits: 0, uniques: 0, plays: 0, peak: 0 });
        for (const n of Object.values(m)) { d.hits += n; d.uniques++; }
      }
      for (const [day, x] of Object.entries(db.days)) {
        if (day < since) continue;
        const d = days[day] || (days[day] = { day, hits: 0, uniques: 0, plays: 0, peak: 0 });
        d.plays = x.plays; d.peak = x.peak;
      }
      const all = new Set(); let hits = 0, plays = 0;
      for (const m of Object.values(db.visits)) for (const [v, n] of Object.entries(m)) { all.add(v); hits += n; }
      for (const x of Object.values(db.days)) plays += x.plays;
      return { days: Object.values(days).sort((a, b) => a.day < b.day ? -1 : 1),
               totals: { hits, uniques: all.size, plays, accounts: db.users.length } };
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
      /* Accounts made before the email was dropped have one; new ones do
         not, so the columns may be empty now. */
      await pool.query(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
      await pool.query(`ALTER TABLE users ALTER COLUMN email_lower DROP NOT NULL`);
      /* uniqueness of an email, where one is given, is checked before the
         insert; the index cannot hold the empty ones */
      await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lower_key`);
      /* a word from an admin to the person whose account it is */
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notice TEXT`);
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
      /* A lap as a run of positions, kept beside the time so the fastest
         one can be driven against. Only the daily circuits keep these. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ghosts (
          circuit TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          data    TEXT NOT NULL,
          PRIMARY KEY (circuit, user_id)
        )`);
      /* Visits: one row per browser per day, with how many times it came.
         Nothing about who — the id is a random one the browser made up. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visits (
          day TEXT NOT NULL,
          vid TEXT NOT NULL,
          n   INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (day, vid)
        )`);
      /* When each visit happened, for the desk's list of recent ones. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visit_log (
          at   BIGINT NOT NULL,
          vid  TEXT NOT NULL,
          name TEXT
        )`);
      await pool.query(`ALTER TABLE visit_log ADD COLUMN IF NOT EXISTS name TEXT`);
      /* Which browser is whose: the last account seen signed in on it, so
         the visits it made before signing in can be named too. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS visitors (
          vid  TEXT PRIMARY KEY,
          name TEXT NOT NULL
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS visit_log_at ON visit_log(at)`);
      /* How long each page stayed: from its first ping to its last. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stays (
          since BIGINT NOT NULL,
          until BIGINT NOT NULL,
          vid   TEXT NOT NULL,
          name  TEXT
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS stays_since ON stays(since)`);
      /* race wins, as the pages report them */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wins (
          user_id TEXT PRIMARY KEY,
          race    INTEGER NOT NULL DEFAULT 0
        )`);
      /* Parties started per day, and the most people connected at once. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS days (
          day   TEXT PRIMARY KEY,
          plays INTEGER NOT NULL DEFAULT 0,
          peak  INTEGER NOT NULL DEFAULT 0
        )`);
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
    async count(circuit) {
      return (await one(`SELECT COUNT(*)::int AS n FROM laps WHERE circuit=$1`, [circuit])).n;
    },
    async rank(circuit, userId) {
      const mine = await one(`SELECT ms FROM laps WHERE circuit=$1 AND user_id=$2`, [circuit, userId]);
      const n = await one(`SELECT COUNT(*)::int AS n FROM laps WHERE circuit=$1`, [circuit]);
      if (!mine) return { count: n ? n.n : 0, ms: null, rank: null };
      const ahead = await one(`SELECT COUNT(*)::int AS n FROM laps WHERE circuit=$1 AND ms<$2`, [circuit, mine.ms]);
      return { count: n ? n.n : 0, ms: Number(mine.ms), rank: (ahead ? ahead.n : 0) + 1 };
    },
    async putGhost(circuit, userId, data) {
      await pool.query(
        `INSERT INTO ghosts (circuit,user_id,data) VALUES ($1,$2,$3)
         ON CONFLICT (circuit,user_id) DO UPDATE SET data=EXCLUDED.data`, [circuit, userId, data]);
    },
    async ghost(circuit) {
      const r = await one(
        `SELECT l.name, l.ms, l.car, g.data FROM laps l JOIN ghosts g ON g.circuit=l.circuit AND g.user_id=l.user_id
         WHERE l.circuit=$1 ORDER BY l.ms ASC LIMIT 1`, [circuit]);
      return r ? { name: r.name, ms: Number(r.ms), car: r.car, data: r.data } : null;
    },
    async pruneGhosts(before) {
      await pool.query(`DELETE FROM ghosts WHERE circuit LIKE 'daily_%' AND circuit < $1`, [before]);
    },

    /* ---- what an admin can see and undo ---- */
    async setNotice(id, text) {
      const r = await pool.query(`UPDATE users SET notice=$2 WHERE id=$1`, [id, text || null]);
      return r.rowCount > 0;
    },
    async users() {
      return (await pool.query(`
        SELECT u.id, u.name, u.email, u.created, u.notice,
               (SELECT COUNT(*)::int FROM tracks t WHERE t.user_id=u.id) AS tracks,
               (SELECT COUNT(*)::int FROM laps   l WHERE l.user_id=u.id) AS laps
        FROM users u ORDER BY u.created DESC`)).rows;
    },
    /* Sessions, circuits and laps all reference users ON DELETE CASCADE, so
       one statement takes the account and everything that hung off it. */
    async deleteUser(id) {
      const r = await pool.query(`DELETE FROM users WHERE id=$1`, [id]);
      return r.rowCount > 0;
    },
    async deleteLap(circuit, userId) {
      const r = await pool.query(`DELETE FROM laps WHERE circuit=$1 AND user_id=$2`, [circuit, userId]);
      return r.rowCount > 0;
    },
    async wipeBoard(circuit) {
      const r = await pool.query(`DELETE FROM laps WHERE circuit=$1`, [circuit]);
      return r.rowCount;
    },

    /* ---- how many came, and how many played ---- */
    async hit(day, vid, at, name) {
      await pool.query(
        `INSERT INTO visits (day,vid,n) VALUES ($1,$2,1)
         ON CONFLICT (day,vid) DO UPDATE SET n=visits.n+1`, [day, vid]);
      await pool.query(`INSERT INTO visit_log (at,vid,name) VALUES ($1,$2,$3)`, [at || Date.now(), vid, name || null]);
      if (name) await pool.query(`INSERT INTO visitors (vid,name) VALUES ($1,$2) ON CONFLICT (vid) DO UPDATE SET name=EXCLUDED.name`, [vid, name]);
      /* a month of moments is plenty; the day counts keep the rest */
      if (Math.random() < 0.02) await pool.query(`DELETE FROM visit_log WHERE at < $1`, [Date.now() - 31 * 86_400_000]);
    },
    async bind(vid, name) {
      await pool.query(`INSERT INTO visitors (vid,name) VALUES ($1,$2) ON CONFLICT (vid) DO UPDATE SET name=EXCLUDED.name`, [vid, name]);
    },
    async winsAdd(userId, kind) {
      if (kind !== "race") return { race: 0 };
      const r = await one(`INSERT INTO wins (user_id,race) VALUES ($1,1) ON CONFLICT (user_id) DO UPDATE SET race=wins.race+1 RETURNING race`, [userId]);
      return { race: r ? Number(r.race) : 1 };
    },
    async wins(userId) { const r = await one(`SELECT race FROM wins WHERE user_id=$1`, [userId]); return { race: r ? Number(r.race) : 0 }; },
    async dailyWinners() {
      const rows = (await pool.query(`SELECT circuit, user_id, name, ms FROM laps WHERE circuit LIKE 'daily%'`)).rows;
      const best = {}; for (const r of rows) { if (!/^daily_\d{8}$/.test(r.circuit)) continue; if (!best[r.circuit] || Number(r.ms) < Number(best[r.circuit].ms)) best[r.circuit] = r; }
      return Object.values(best).map((r) => ({ circuit: r.circuit, user_id: r.user_id, name: r.name }));
    },
    async stay(vid, name, since, until) {
      await pool.query(`INSERT INTO stays (since,until,vid,name) VALUES ($1,$2,$3,$4)`, [since, until, vid, name || null]);
      if (name) await pool.query(`INSERT INTO visitors (vid,name) VALUES ($1,$2) ON CONFLICT (vid) DO UPDATE SET name=EXCLUDED.name`, [vid, name]);
      if (Math.random() < 0.02) await pool.query(`DELETE FROM stays WHERE since < $1`, [Date.now() - 31 * 86_400_000]);
    },
    async stays(limit) {
      const rows = (await pool.query(
        `SELECT s.since, s.until, s.vid, s.name, v.name AS who FROM stays s LEFT JOIN visitors v ON v.vid=s.vid ORDER BY s.since DESC LIMIT $1`, [limit])).rows;
      return rows.map((r) => ({ vid: r.vid, name: r.name || r.who || null, since: Number(r.since), until: Number(r.until) }));
    },
    async recent(limit) {
      const rows = (await pool.query(
        `SELECT l.at, l.vid, l.name, v.name AS who FROM visit_log l LEFT JOIN visitors v ON v.vid=l.vid ORDER BY l.at DESC LIMIT $1`, [limit])).rows;
      if (!rows.length) return [];
      const vids = [...new Set(rows.map((r) => r.vid))];
      const f = (await pool.query(`SELECT vid, MIN(day) AS first FROM visits WHERE vid = ANY($1) GROUP BY vid`, [vids])).rows;
      const first = {}; for (const r of f) first[r.vid] = r.first;
      return rows.map((r) => ({ at: Number(r.at), vid: r.vid, name: r.name || r.who || null, known: !!r.name, first: first[r.vid] || null }));
    },
    async playing(day, players) {
      await pool.query(
        `INSERT INTO days (day,plays,peak) VALUES ($1,1,$2)
         ON CONFLICT (day) DO UPDATE SET plays=days.plays+1, peak=GREATEST(days.peak,EXCLUDED.peak)`,
        [day, players | 0]);
    },
    async stats(since) {
      const v = (await pool.query(
        `SELECT day, SUM(n)::int AS hits, COUNT(*)::int AS uniques FROM visits WHERE day>=$1 GROUP BY day`, [since])).rows;
      const p = (await pool.query(`SELECT day, plays, peak FROM days WHERE day>=$1`, [since])).rows;
      const days = {};
      for (const r of v) days[r.day] = { day: r.day, hits: r.hits, uniques: r.uniques, plays: 0, peak: 0 };
      for (const r of p) { const d = days[r.day] || (days[r.day] = { day: r.day, hits: 0, uniques: 0, plays: 0, peak: 0 }); d.plays = r.plays; d.peak = r.peak; }
      const t = await one(`SELECT COALESCE(SUM(n),0)::int AS hits, COUNT(DISTINCT vid)::int AS uniques FROM visits`);
      const q = await one(`SELECT COALESCE(SUM(plays),0)::int AS plays FROM days`);
      const a = await one(`SELECT COUNT(*)::int AS n FROM users`);
      return { days: Object.values(days).sort((x, y) => x.day < y.day ? -1 : 1),
               totals: { hits: t ? t.hits : 0, uniques: t ? t.uniques : 0, plays: q ? q.plays : 0, accounts: a ? a.n : 0 } };
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
