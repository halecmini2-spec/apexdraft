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
const crypto = require("crypto");

/* Playtime XP has been retired — see takePlaytimeXp below on both stores.
 * This is only what is needed to work out how much a still-open tab
 * already banked under the old "playtime:<session>:<mins>" key shape,
 * so it can be taken back out once, the first time each account's pass
 * state is next asked for. */
function playtimeAmount(mins) {
  if (mins === 10) return 500;
  if (mins === 20) return 750;
  if (mins === 30) return 900;
  if (mins >= 60) return 1000;
  return 0;
}

/* ---------- file ---------- */

function fileStore(file) {
  let db = { users: [], sessions: [], tracks: [], laps: [], visits: {}, days: {}, log: [], ghosts: [], who: {}, wins: {},
             inventory: [], passClaims: [], packs: [], xpGrants: [], questProgress: [], purchases: [], loginTokens: [] };
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
    db.inventory = db.inventory || [];
    db.passClaims = db.passClaims || [];
    db.packs = db.packs || [];
    db.xpGrants = db.xpGrants || [];
    db.questProgress = db.questProgress || [];
    db.purchases = db.purchases || [];
    db.loginTokens = db.loginTokens || [];
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
    /* Already hashed by the caller — this never sees the plain password,
       the same as createUser never has. */
    async setPassword(id, passHash) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return false;
      u.pass = passHash;
      await save();
      return true;
    },
    /* Only ever adds. A car bought twice — a webhook and a browser tab both
       settling the same purchase — costs nothing the second time. */
    async addCar(id, carId) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return false;
      const set = new Set(String(u.cars || "").split(",").map((s) => s.trim()).filter(Boolean));
      set.add(carId);
      u.cars = [...set].join(",");
      await save();
      return true;
    },
    /* ---- Apex Coins ----
       Never below zero, whichever way a delta pushes it: a grant is a
       positive delta, a spend is a negative one, and this is the one
       place either of them is allowed to touch the number. */
    async addCoins(id, delta) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return null;
      u.coins = Math.max(0, (u.coins | 0) + (delta | 0));
      await save();
      return u.coins;
    },
    /* Paying for something, which is not the same as a negative grant: a
       negative delta through addCoins clamps at zero and reports success,
       and for a price that is exactly backwards — short of the money,
       nothing should be taken and nothing should be sold. Null means the
       balance would not cover it and nothing was touched. */
    async spendCoins(id, amount) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return null;
      const n = Math.max(0, amount | 0);
      if ((u.coins | 0) < n) return null;
      u.coins = (u.coins | 0) - n;
      await save();
      return u.coins;
    },
    /* The title worn on the account itself — see the equipped_title
       migration above for why this exists apart from a lap's own title. */
    async setEquippedTitle(id, title) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return null;
      u.equipped_title = title || null;
      await save();
      return u.equipped_title;
    },
    /* Only ever fills an empty one in — an account backfilling the email
       it was made without, back when one wasn't asked for. Uniqueness is
       checked by the route, against userByEmail, before this is called. */
    async setEmail(id, email) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return false;
      u.email = email;
      u.email_lower = email.toLowerCase();
      await save();
      return true;
    },
    /* ---- password reset, by magic link ---- */
    /* Returns the RAW token — it goes into the emailed link and nowhere
       else. Only the hash is ever kept. */
    async createLoginToken(userId) {
      const raw = crypto.randomBytes(24).toString("base64url");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      db.loginTokens = db.loginTokens.filter((t) => t.expires > Date.now());
      db.loginTokens.push({ token_hash: hash, user_id: userId, expires: Date.now() + 30 * 60_000, used: null });
      await save();
      return raw;
    },
    /* Single-use: the row is marked used in the same lookup that reads it,
       so two racing requests for the same link cannot both sign in. */
    async consumeLoginToken(raw) {
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const row = db.loginTokens.find((t) => t.token_hash === hash && !t.used && t.expires > Date.now());
      if (!row) return null;
      row.used = Date.now();
      await save();
      return db.users.find((u) => u.id === row.user_id) || null;
    },
    /* ---- Apex Pass XP ----
       Only ever climbs; level is worked out from it rather than stored
       beside it, so the two can never drift apart. */
    async addXp(id, delta) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return null;
      u.pass_xp = Math.max(0, (u.pass_xp | 0) + (delta | 0));
      await save();
      return u.pass_xp;
    },
    /* Adds to the account's total verified drive time and hands back the
       new total, so the caller (relay/laps.js) can check it against the
       drive-time XP tiers in the same round trip a lap is already making. */
    async addDriveMs(id, deltaMs) {
      const u = db.users.find((x) => x.id === id);
      if (!u) return null;
      u.drive_ms = Math.max(0, (Number(u.drive_ms) || 0) + (deltaMs | 0));
      await save();
      return u.drive_ms;
    },
    /* A one-off grant — playtime crossing a threshold, a daily result the
       day after, an account just made — filed under a key that can only
       ever be claimed once. Two heartbeats racing each other, or a retry
       after a dropped reply, cost nothing the second time. */
    async grantXpOnce(id, key, amount) {
      if (db.xpGrants.find((g) => g.user_id === id && g.key === key)) return { granted: false, xp: null };
      db.xpGrants.push({ user_id: id, key, at: Date.now() });
      const xp = await this.addXp(id, amount);
      return { granted: true, xp };
    },
    /* A read-only check against the same shelf grantXpOnce writes to — so
       a caller (the quests screen, checking whether today's quest is
       already claimed) can ask without the side effect of granting
       anything. */
    async hasGrant(id, key) {
      return !!db.xpGrants.find((g) => g.user_id === id && g.key === key);
    },
    /* ---- quests: daily/weekly/seasonal progress ----
       One counter per (account, period, quest) that only ever climbs
       within its period — a fresh period is just a key nothing has
       written under yet, not a row that gets reset or deleted. */
    async addQuestProgress(id, periodKey, questId, delta) {
      let row = db.questProgress.find((r) => r.user_id === id && r.period_key === periodKey && r.quest_id === questId);
      if (!row) { row = { user_id: id, period_key: periodKey, quest_id: questId, count: 0 }; db.questProgress.push(row); }
      row.count += delta;
      await save();
      return row.count;
    },
    async questProgress(id, periodKeys) {
      return db.questProgress.filter((r) => r.user_id === id && periodKeys.includes(r.period_key));
    },
    /* Retiring playtime XP: finds every grant this account still has under
       the old "playtime:<session>:<mins>" key, removes them, and hands
       back what they added up to so it can be taken back off pass_xp. Once
       run for an account there is nothing left for a second call to find. */
    async takePlaytimeXp(id) {
      const mine = db.xpGrants.filter((g) => g.user_id === id && g.key.startsWith("playtime:"));
      if (!mine.length) return { removed: 0, xp: null };
      db.xpGrants = db.xpGrants.filter((g) => !(g.user_id === id && g.key.startsWith("playtime:")));
      let total = 0;
      for (const g of mine) total += playtimeAmount(Number(g.key.split(":")[2]));
      const xp = await this.addXp(id, -total);
      return { removed: total, xp };
    },
    /* ---- owned cosmetics ----
       Whether a car or a kit item, one shelf: item_key is "<slot>:<id>".
       A pack or a pass level asks this before handing anything over. */
    async grantItem(id, itemKey) {
      if (db.inventory.find((x) => x.user_id === id && x.item_key === itemKey)) return { duplicate: true };
      db.inventory.push({ user_id: id, item_key: itemKey, acquired: Date.now() });
      await save();
      return { duplicate: false };
    },
    async ownedItems(id) {
      return db.inventory.filter((x) => x.user_id === id).map((x) => x.item_key);
    },
    /* Every account's shelf at once, named rather than by id — for the
       admin desk, checking who actually has what. */
    async allInventory() {
      const byId = new Map(db.users.map((u) => [u.id, u.name]));
      return db.inventory
        .map((x) => ({ name: byId.get(x.user_id), item: x.item_key, acquired: x.acquired }))
        .filter((x) => x.name);
    },
    async revokeItem(id, itemKey) {
      const before = db.inventory.length;
      db.inventory = db.inventory.filter((x) => !(x.user_id === id && x.item_key === itemKey));
      if (db.inventory.length !== before) await save();
      return before !== db.inventory.length;
    },
    /* ---- the Apex Pass itself ---- */
    async claimedLevels(id, season) {
      return db.passClaims.filter((c) => c.user_id === id && c.season === season).map((c) => c.level);
    },
    async claimLevel(id, season, level) {
      if (db.passClaims.find((c) => c.user_id === id && c.season === season && c.level === level)) return { claimed: false };
      db.passClaims.push({ user_id: id, season, level, claimed: Date.now() });
      await save();
      return { claimed: true };
    },
    /* ---- packs: won, not yet opened ---- */
    /* packId is how a purchase makes itself safe to settle twice: a pack
       is not a car, there is no "already owned" to fall back on, and both
       of Stripe's settlement paths can land on the same payment. Filed
       under an id derived from the payment, the second one finds the
       first already there. fresh says which of those two happened. */
    async addPack(id, packType, source, packId) {
      if (packId) {
        const had = db.packs.find((p) => p.id === packId);
        if (had) return Object.assign({}, had, { fresh: false });
      }
      const p = { id: packId || crypto.randomUUID(), user_id: id, pack_type: packType, source: source || null, created: Date.now() };
      db.packs.push(p);
      await save();
      return Object.assign({}, p, { fresh: true });
    },
    async packsFor(id) {
      return db.packs.filter((p) => p.user_id === id).sort((a, b) => a.created - b.created);
    },
    /* Fetches and removes in one step: two requests to open the same pack
       at once can only ever find it the once. */
    async takePack(id, packId) {
      const i = db.packs.findIndex((p) => p.id === packId && p.user_id === id);
      if (i < 0) return null;
      const [p] = db.packs.splice(i, 1);
      await save();
      return p;
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
        coins: u.coins, pass_xp: u.pass_xp,
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
    /* ---- real money, actually spent ---- */
    async logPurchase(userId, name, carId, pence) {
      db.purchases.push({ at: Date.now(), user_id: userId, name, car_id: carId, pence });
      if (db.purchases.length > 1000) db.purchases = db.purchases.slice(-1000);
      await save();
    },
    async recentPurchases(limit) {
      return db.purchases.slice(-limit).reverse();
    },
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
      /* cars bought from the shop, comma-separated — the same shape the
         admin desk's own car list already uses */
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cars TEXT`);
      /* the Apex Pass: a balance that only ever moves by a delta, and an
         XP total that a level is worked out from rather than stored beside
         — one number, so the two can never disagree with each other */
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 0`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_xp BIGINT NOT NULL DEFAULT 0`);
      /* Total milliseconds of server-verified lap time this account has
         ever driven, across every accepted lap — not a session clock, and
         nothing a client reports. Drive-time XP milestones (relay/laps.js)
         are paid out against this instead of wall-clock playtime, which is
         what the retired playtime system paid against and could not tell
         apart from an idle tab or an autoclicker. */
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_ms BIGINT NOT NULL DEFAULT 0`);
      /* The title worn on the account itself, not just in one browser's
         storage — so it is the same title on a phone as on a desktop,
         and the one a new lap's own title (see laps.title) is sent as by
         default. Checked against the inventory shelf at the point it is
         set, the same as everywhere else a title is claimed. */
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_title TEXT`);
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
      /* The title worn at the moment the lap was put on the board — a
         claim checked against the inventory shelf the same way the car
         already is, so a board only ever shows one actually owned. */
      await pool.query(`ALTER TABLE laps ADD COLUMN IF NOT EXISTS title TEXT`);
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
      /* Real money, actually spent — one row per car a purchase actually
         fulfilled, for the admin desk's own record of it. checkout.js
         writes this once, the first time fulfil() finds the car not
         already owned, so a webhook and its own redirect both settling
         the same purchase never doubles it up. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS purchases (
          id      SERIAL PRIMARY KEY,
          at      BIGINT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name    TEXT NOT NULL,
          car_id  TEXT NOT NULL,
          pence   INTEGER NOT NULL
        )`);
      /* A password reset, as a one-time link rather than a typed-in code —
         the raw value only ever exists in the emailed URL; this table
         holds its hash. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS login_tokens (
          token_hash TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires    BIGINT NOT NULL,
          used       BIGINT
        )`);
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
      /* ---- the Apex Pass: what an account owns, has claimed, and holds
         unopened ---- */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
          user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_key TEXT NOT NULL,
          acquired BIGINT NOT NULL,
          PRIMARY KEY (user_id, item_key)
        )`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pass_claims (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          season  TEXT NOT NULL,
          level   INTEGER NOT NULL,
          claimed BIGINT NOT NULL,
          PRIMARY KEY (user_id, season, level)
        )`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS packs (
          id        TEXT PRIMARY KEY,
          user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          pack_type TEXT NOT NULL,
          source    TEXT,
          created   BIGINT NOT NULL
        )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS packs_user ON packs(user_id)`);
      /* A one-off grant filed under a key that can only ever be claimed
         once — playtime crossing a threshold, yesterday's daily result,
         an account just made. Two requests for the same key cost nothing
         the second time. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS xp_grants (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key     TEXT NOT NULL,
          at      BIGINT NOT NULL,
          PRIMARY KEY (user_id, key)
        )`);
      /* Quest progress: one counter per account/period/quest, climbing
         within its own period key (see relay/quests.js) rather than ever
         being reset in place — a new day/week/season is just a key
         nothing has written under yet. */
      await pool.query(`
        CREATE TABLE IF NOT EXISTS quest_progress (
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          period_key TEXT NOT NULL,
          quest_id   TEXT NOT NULL,
          count      BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, period_key, quest_id)
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
        `INSERT INTO laps (circuit,user_id,name,ms,car,at,title) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (circuit,user_id)
         DO UPDATE SET ms=EXCLUDED.ms, car=EXCLUDED.car, at=EXCLUDED.at, name=EXCLUDED.name, title=EXCLUDED.title
         WHERE laps.ms > EXCLUDED.ms`,
        [l.circuit, l.user_id, l.name, l.ms, l.car, l.at, l.title || null]
      );
      /* Reading back what stands beats counting rows: a DO UPDATE that
         declined to fire is not reported the same way everywhere. */
      const r = await one(`SELECT ms FROM laps WHERE circuit=$1 AND user_id=$2`, [l.circuit, l.user_id]);
      return r ? Number(r.ms) : null;
    },
    async board(circuit, limit) {
      return (await pool.query(
        `SELECT name,ms,car,at,title FROM laps WHERE circuit=$1 ORDER BY ms ASC LIMIT $2`,
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
    /* Already hashed by the caller — this never sees the plain password,
       the same as createUser never has. */
    async setPassword(id, passHash) {
      const r = await pool.query(`UPDATE users SET pass=$2 WHERE id=$1`, [id, passHash]);
      return r.rowCount > 0;
    },
    async addCar(id, carId) {
      const u = await one(`SELECT cars FROM users WHERE id=$1`, [id]);
      if (!u) return false;
      const set = new Set(String(u.cars || "").split(",").map((s) => s.trim()).filter(Boolean));
      set.add(carId);
      await pool.query(`UPDATE users SET cars=$2 WHERE id=$1`, [id, [...set].join(",")]);
      return true;
    },

    /* ---- Apex Coins ----
       Never below zero, whichever way a delta pushes it: the clamp is in
       the statement itself, so a grant and a spend racing each other can
       never leave the balance negative between them. */
    async addCoins(id, delta) {
      const r = await one(`UPDATE users SET coins=GREATEST(0,coins+$2) WHERE id=$1 RETURNING coins`, [id, delta | 0]);
      return r ? Number(r.coins) : null;
    },
    /* Paying for something. The balance check is in the statement rather
       than around it, so two purchases racing each other can never both
       find the same coins there — one of them updates no row and is told
       so, instead of both succeeding and the balance clamping at zero. */
    async spendCoins(id, amount) {
      const n = Math.max(0, amount | 0);
      const r = await one(`UPDATE users SET coins=coins-$2 WHERE id=$1 AND coins>=$2 RETURNING coins`, [id, n]);
      return r ? Number(r.coins) : null;
    },
    /* The title worn on the account itself — see the equipped_title
       migration above for why this exists apart from a lap's own title. */
    async setEquippedTitle(id, title) {
      const r = await one(`UPDATE users SET equipped_title=$2 WHERE id=$1 RETURNING equipped_title`, [id, title || null]);
      return r ? r.equipped_title : null;
    },
    /* Only ever fills an empty one in — an account backfilling the email
       it was made without, back when one wasn't asked for. Uniqueness is
       checked by the route, against userByEmail, before this is called. */
    async setEmail(id, email) {
      const r = await pool.query(`UPDATE users SET email=$2, email_lower=$3 WHERE id=$1`, [id, email, email.toLowerCase()]);
      return r.rowCount > 0;
    },
    /* ---- password reset, by magic link ---- */
    async createLoginToken(userId) {
      const raw = crypto.randomBytes(24).toString("base64url");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      await pool.query(
        `INSERT INTO login_tokens (token_hash,user_id,expires) VALUES ($1,$2,$3)`,
        [hash, userId, Date.now() + 30 * 60_000]
      );
      return raw;
    },
    /* Single-use, atomically: the UPDATE only lands while unused and
       fresh, so two racing requests for the same link cannot both land. */
    async consumeLoginToken(raw) {
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const now = Date.now();
      const r = await one(
        `UPDATE login_tokens SET used=$2 WHERE token_hash=$1 AND used IS NULL AND expires>$2 RETURNING user_id`,
        [hash, now]
      );
      if (!r) return null;
      return one(`SELECT * FROM users WHERE id=$1`, [r.user_id]);
    },
    /* ---- Apex Pass XP ----
       Only ever climbs; level is worked out from it rather than stored
       beside it, so the two can never drift apart. */
    async addXp(id, delta) {
      const r = await one(`UPDATE users SET pass_xp=GREATEST(0,pass_xp+$2) WHERE id=$1 RETURNING pass_xp`, [id, delta | 0]);
      return r ? Number(r.pass_xp) : null;
    },
    /* Adds to the account's total verified drive time and hands back the
       new total, so the caller (relay/laps.js) can check it against the
       drive-time XP tiers in the same round trip a lap is already making. */
    async addDriveMs(id, deltaMs) {
      const r = await one(`UPDATE users SET drive_ms=GREATEST(0,drive_ms+$2) WHERE id=$1 RETURNING drive_ms`, [id, deltaMs | 0]);
      return r ? Number(r.drive_ms) : null;
    },
    async grantXpOnce(id, key, amount) {
      const r = await pool.query(
        `INSERT INTO xp_grants (user_id,key,at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [id, key, Date.now()]
      );
      if (r.rowCount === 0) return { granted: false, xp: null };
      const xp = await this.addXp(id, amount);
      return { granted: true, xp };
    },
    /* A read-only check against the same shelf grantXpOnce writes to — so
       a caller (the quests screen, checking whether today's quest is
       already claimed) can ask without the side effect of granting
       anything. */
    async hasGrant(id, key) {
      const r = await one(`SELECT 1 FROM xp_grants WHERE user_id=$1 AND key=$2`, [id, key]);
      return !!r;
    },
    /* ---- quests: daily/weekly/seasonal progress ----
       One counter per (account, period, quest) that only ever climbs
       within its period — a fresh period is just a key nothing has
       written under yet, not a row that gets reset or deleted. */
    async addQuestProgress(id, periodKey, questId, delta) {
      const r = await one(`
        INSERT INTO quest_progress (user_id,period_key,quest_id,count) VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id,period_key,quest_id) DO UPDATE SET count=quest_progress.count+$4
        RETURNING count`, [id, periodKey, questId, delta]);
      return r ? Number(r.count) : null;
    },
    async questProgress(id, periodKeys) {
      if (!periodKeys.length) return [];
      const r = await pool.query(
        `SELECT period_key, quest_id, count FROM quest_progress WHERE user_id=$1 AND period_key = ANY($2)`,
        [id, periodKeys]
      );
      return r.rows;
    },
    /* Retiring playtime XP: finds every grant this account still has under
       the old "playtime:<session>:<mins>" key, removes them, and hands
       back what they added up to so it can be taken back off pass_xp. Once
       run for an account there is nothing left for a second call to find. */
    async takePlaytimeXp(id) {
      const rows = (await pool.query(
        `DELETE FROM xp_grants WHERE user_id=$1 AND key LIKE 'playtime:%' RETURNING key`, [id]
      )).rows;
      if (!rows.length) return { removed: 0, xp: null };
      let total = 0;
      for (const row of rows) total += playtimeAmount(Number(String(row.key).split(":")[2]));
      const xp = await this.addXp(id, -total);
      return { removed: total, xp };
    },
    /* ---- owned cosmetics ----
       Whether a car or a kit item, one shelf: item_key is "<slot>:<id>".
       A pack or a pass level asks this before handing anything over. */
    async grantItem(id, itemKey) {
      const r = await pool.query(
        `INSERT INTO inventory (user_id,item_key,acquired) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [id, itemKey, Date.now()]
      );
      return { duplicate: r.rowCount === 0 };
    },
    async ownedItems(id) {
      return (await pool.query(`SELECT item_key FROM inventory WHERE user_id=$1`, [id])).rows.map((r) => r.item_key);
    },
    /* Every account's shelf at once, named rather than by id — for the
       admin desk, checking who actually has what. */
    async allInventory() {
      return (await pool.query(
        `SELECT u.name, i.item_key AS item, i.acquired FROM inventory i JOIN users u ON u.id=i.user_id ORDER BY u.name, i.item_key`
      )).rows;
    },
    async revokeItem(id, itemKey) {
      const r = await pool.query(`DELETE FROM inventory WHERE user_id=$1 AND item_key=$2`, [id, itemKey]);
      return r.rowCount > 0;
    },
    /* ---- the Apex Pass itself ---- */
    async claimedLevels(id, season) {
      return (await pool.query(`SELECT level FROM pass_claims WHERE user_id=$1 AND season=$2`, [id, season])).rows.map((r) => r.level);
    },
    async claimLevel(id, season, level) {
      const r = await pool.query(
        `INSERT INTO pass_claims (user_id,season,level,claimed) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [id, season, level, Date.now()]
      );
      return { claimed: r.rowCount > 0 };
    },
    /* ---- packs: won, not yet opened ---- */
    /* See the json store's copy for what packId is for. The primary key
       on the table is what actually makes the second settlement a no-op;
       ON CONFLICT is only how it is asked politely. */
    async addPack(id, packType, source, packId) {
      const pid = packId || crypto.randomUUID();
      const r = await pool.query(
        `INSERT INTO packs (id,user_id,pack_type,source,created) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [pid, id, packType, source || null, Date.now()]
      );
      return { id: pid, user_id: id, pack_type: packType, source: source || null,
               created: Date.now(), fresh: r.rowCount > 0 };
    },
    async packsFor(id) {
      return (await pool.query(`SELECT * FROM packs WHERE user_id=$1 ORDER BY created ASC`, [id])).rows;
    },
    /* Fetches and removes in one statement: two requests to open the same
       pack at once can only ever find it the once. */
    async takePack(id, packId) {
      const r = await pool.query(`DELETE FROM packs WHERE id=$1 AND user_id=$2 RETURNING *`, [packId, id]);
      return r.rows[0] || null;
    },
    async users() {
      return (await pool.query(`
        SELECT u.id, u.name, u.email, u.created, u.notice, u.coins, u.pass_xp,
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
    /* ---- real money, actually spent ---- */
    async logPurchase(userId, name, carId, pence) {
      await pool.query(
        `INSERT INTO purchases (at,user_id,name,car_id,pence) VALUES ($1,$2,$3,$4,$5)`,
        [Date.now(), userId, name, carId, pence]
      );
    },
    async recentPurchases(limit) {
      return (await pool.query(
        `SELECT at,user_id,name,car_id,pence FROM purchases ORDER BY id DESC LIMIT $1`, [limit]
      )).rows.map((r) => ({ at: Number(r.at), user_id: r.user_id, name: r.name, car_id: r.car_id, pence: Number(r.pence) }));
    },
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
