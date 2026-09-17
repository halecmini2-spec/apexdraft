/* The Apex Pass: Apex Coins, XP, the fifty-level Season 1 free track, and
 * the packs it hands out along the way.
 *
 * Live for every signed-in account now. One thing stays behind cosmo38
 * specifically, checked on its own further down rather than at the top of
 * route(): /api/pass/grant-all, the test-only shortcut that hands over the
 * whole item pool at once. Nobody else gets that button to press — see
 * isPassTester below, now used only there.
 *
 * A pack has real Apex Coins riding on it the moment a duplicate can turn
 * into some, so it is rolled here, on the trusted side, the same way a lap
 * time is checked here rather than trusted from the page. The item pool
 * below is a deliberate, small duplicate of index.html's own KITS — kept in
 * sync by hand, the same way verify.js's PERF table already mirrors
 * CAR_PERF there, for the same reason: the relay cannot load the page's own
 * script to ask it, so it keeps just enough of the answer to check a claim
 * against.
 */
const { json, readBody, cors, overRate, passLevel } = require("./auth");

/* The one account grant-all still answers to — see the header above. */
const PASS_ACCOUNT = "cosmo38";
const isPassTester = (u) => !!u && u.name_lower === PASS_ACCOUNT;

const SEASON = "s1";

/* What a rarity is worth, in Apex Coins — a shop price and a duplicate
   payout, the same number either way. */
const RARITY_COINS = { rare: 100, epic: 200, legendary: 500, mythic: 1000 };

/* Every cosmetic and test car a pack or a pass level can hand over, with
   just enough about each to roll one and check whether it is already
   owned — id, which shelf it goes on, and what it is worth. Not the paint
   recipe or the wheel geometry: index.html is where those live. */
const ITEM_POOL = [
  // titles
  ["title", "trackday", "rare"], ["title", "backmarker", "rare"],
  ["title", "apex", "epic"], ["title", "unbeaten", "legendary"], ["title", "king", "mythic"],
  ["title", "rookie", "rare"], ["title", "speedster", "rare"],
  ["title", "roadwarrior", "epic"], ["title", "drifter", "epic"], ["title", "elitedriver", "epic"],
  ["title", "racinglegend", "legendary"], ["title", "destroyer", "legendary"],
  // paint — the six plain swatch colours (c-red etc.) are free and never in this pool
  ["paint", "candy", "rare"], ["paint", "matte", "rare"],
  ["paint", "flake", "epic"], ["paint", "gold", "legendary"], ["paint", "holo", "legendary"], ["paint", "prism", "mythic"],
  ["paint", "carbon-fibre", "epic"], ["paint", "carbon-chrome", "legendary"],
  ["paint", "pearlescent", "epic"],
  ["paint", "liquid-metal", "legendary"], ["paint", "black-chrome", "legendary"],
  ["paint", "galaxy", "mythic"], ["paint", "nebula", "legendary"],
  // rims
  ["rims", "bronze", "rare"], ["rims", "carbon", "epic"], ["rims", "chrome", "epic"],
  ["rims", "gold", "legendary"], ["rims", "neon", "mythic"],
  ["rims", "racing", "rare"],
  ["rims", "elite-racing", "legendary"], ["rims", "diamond-racing", "legendary"],
  // underglow
  ["glow", "ice", "rare"], ["glow", "violet", "epic"], ["glow", "toxic", "epic"],
  ["glow", "ember", "legendary"], ["glow", "rain", "mythic"],
  ["glow", "neon", "rare"], ["glow", "purple", "mythic"], ["glow", "gold-glow", "epic"], ["glow", "platinum", "legendary"],
  // horn
  ["horn", "classic", "rare"], ["horn", "air", "epic"], ["horn", "truck", "epic"],
  ["horn", "cuca", "legendary"], ["horn", "train", "mythic"], ["horn", "sport", "rare"],
  // badge
  ["badge", "champion", "legendary"],
  // the cars being tried out — the only ones a pack is ever allowed to give
  ["car", "bike", "epic"], ["car", "trike", "epic"], ["car", "v12", "mythic"],
  ["car", "lmp1", "legendary"], ["car", "golfkart", "epic"], ["car", "monster", "legendary"],
];
const poolOf = (rarity) => ITEM_POOL.filter((x) => x[2] === rarity);

/* A pack guarantees its own floor and nothing below it — a Mythic Pack
   simply has nowhere else in its table to land. Higher packs are rarer
   inside their own table too, not just higher-floored. */
const PACK_ODDS = {
  rare:      [["rare", 0.80], ["epic", 0.15], ["legendary", 0.04], ["mythic", 0.01]],
  epic:      [["epic", 0.75], ["legendary", 0.20], ["mythic", 0.05]],
  legendary: [["legendary", 0.90], ["mythic", 0.10]],
  mythic:    [["mythic", 1.00]],
};

function rollRarity(packType) {
  const table = PACK_ODDS[packType] || PACK_ODDS.rare;
  let r = Math.random(), acc = 0;
  for (const [rarity, chance] of table) { acc += chance; if (r < acc) return rarity; }
  return table[table.length - 1][0];
}
function rollItem(rarity) {
  const pool = poolOf(rarity);
  if (!pool.length) return null;
  const [slot, id] = pool[Math.floor(Math.random() * pool.length)];
  return { slot, id, rarity };
}

/* ---- the Season 1 Free track ----
   Level -> what it gives. Coins and packs are self-contained; every
   cosmetic reward names a slot+id out of ITEM_POOL above, checked against
   it at claim time so a bad level number can never hand out junk. Level 46
   is 1,600 rather than the 650 first sketched out for it — the eighteen
   coin levels as first written summed to 6,550 against a 7,500 target, and
   this is the one number that closes that gap without touching the other
   seventeen. */
const FREE_PASS = {
  1: { kind: "coins", amount: 250 },
  2: { kind: "item", slot: "title", id: "rookie" },
  3: { kind: "coins", amount: 150 },
  4: { kind: "item", slot: "horn", id: "sport" },
  5: { kind: "item", slot: "paint", id: "carbon-fibre" },
  6: { kind: "coins", amount: 200 },
  7: { kind: "item", slot: "rims", id: "racing" },
  8: { kind: "item", slot: "glow", id: "neon" },
  9: { kind: "coins", amount: 250 },
  /* Its own major reward, and the one place this table's rarity does not
     match your spec's — LMP1 is legendary everywhere else it already
     exists (CAR_MODELS, the shop), and retiering just this one reward to
     Epic would leave the same car reading two different rarities in two
     screens of the same game. Kept Legendary; flagged in the summary. */
  10: { kind: "item", slot: "car", id: "lmp1" },
  11: { kind: "coins", amount: 200 },
  12: { kind: "item", slot: "paint", id: "pearlescent" },
  13: { kind: "coins", amount: 250 },
  14: { kind: "item", slot: "title", id: "speedster" },
  15: { kind: "item", slot: "rims", id: "chrome" },
  16: { kind: "coins", amount: 300 },
  17: { kind: "item", slot: "paint", id: "holo" },
  18: { kind: "item", slot: "glow", id: "purple" },
  19: { kind: "coins", amount: 300 },
  20: { kind: "pack", packType: "rare" },
  21: { kind: "item", slot: "title", id: "roadwarrior" },
  22: { kind: "coins", amount: 300 },
  23: { kind: "item", slot: "paint", id: "flake" },
  24: { kind: "coins", amount: 350 },
  25: { kind: "item", slot: "title", id: "drifter" },
  26: { kind: "item", slot: "rims", id: "carbon" },
  27: { kind: "coins", amount: 400 },
  28: { kind: "item", slot: "paint", id: "liquid-metal" },
  29: { kind: "coins", amount: 450 },
  30: { kind: "item", slot: "car", id: "golfkart" },
  31: { kind: "coins", amount: 400 },
  32: { kind: "item", slot: "title", id: "elitedriver" },
  33: { kind: "item", slot: "paint", id: "black-chrome" },
  34: { kind: "coins", amount: 450 },
  35: { kind: "item", slot: "glow", id: "gold-glow" },
  36: { kind: "item", slot: "rims", id: "elite-racing" },
  37: { kind: "coins", amount: 500 },
  38: { kind: "item", slot: "title", id: "racinglegend" },
  39: { kind: "item", slot: "paint", id: "prism" },
  40: { kind: "pack", packType: "epic" },
  41: { kind: "coins", amount: 550 },
  42: { kind: "item", slot: "title", id: "destroyer" },
  43: { kind: "item", slot: "paint", id: "carbon-chrome" },
  44: { kind: "coins", amount: 600 },
  45: { kind: "item", slot: "rims", id: "diamond-racing" },
  46: { kind: "coins", amount: 1600 },
  47: { kind: "item", slot: "title", id: "king" },
  48: { kind: "item", slot: "glow", id: "platinum" },
  49: { kind: "item", slot: "badge", id: "champion" },
  50: { kind: "mystery-car" },
};

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function makePass(store, userFor, dailyMod, quests) {
  /* Grants one reward, applying the duplicate rule wherever it applies:
     coins just add, a car or kit item checks ownership first and turns
     into coins instead of a second copy, a pack goes into the unopened
     shelf rather than being rolled here and now. Returns what actually
     happened, for the claim/open response to describe. */
  async function grant(userId, reward) {
    if (reward.kind === "coins") {
      const coins = await store.addCoins(userId, reward.amount);
      return { kind: "coins", amount: reward.amount, coins };
    }
    if (reward.kind === "pack") {
      const pack = await store.addPack(userId, reward.packType, "pass:" + SEASON);
      return { kind: "pack", pack };
    }
    if (reward.kind === "mystery-car") {
      return { kind: "mystery-car" };
    }
    if (reward.kind === "item") {
      return grantItem(userId, reward.slot, reward.id);
    }
    return { kind: "none" };
  }

  /* The one place an item is actually handed over, pack or pass level
     alike: check the shelf, and if it is already there, the rarity's own
     coin value stands in for a second copy that will never exist. */
  async function grantItem(userId, slot, id) {
    const entry = ITEM_POOL.find((x) => x[0] === slot && x[1] === id);
    const rarity = entry ? entry[2] : "rare";
    const key = slot + ":" + id;
    const { duplicate } = await store.grantItem(userId, key);
    /* A car is two things at once here: an entry on this shelf, which is
       what the duplicate check above just asked about, and a row in the
       older, separate place carAllowed()/myCars() actually reads —
       store.addCar, the same one the shop's own purchases already write
       to. Recording it here without also writing there would grant a car
       nobody could actually get into the garage and drive. addCar is its
       own idempotent add, so calling it again on a duplicate costs
       nothing either. */
    if (slot === "car") await store.addCar(userId, id);
    if (duplicate) {
      const amount = RARITY_COINS[rarity] || RARITY_COINS.rare;
      const coins = await store.addCoins(userId, amount);
      return { kind: "duplicate", slot, id, rarity, amount, coins };
    }
    return { kind: "item", slot, id, rarity };
  }

  /* Yesterday's daily, the day after — once it can no longer change. Safe
     to call as often as liked: grantXpOnce only ever pays a given circuit
     out the once, whoever asks. */
  async function rolloverDaily() {
    if (!dailyMod) return;
    try {
      const day = dailyMod.dayIndex() - 1;
      const circuit = dailyMod.circuitKey(day);
      const board = await store.board(circuit, 3);
      const XP = [2500, 1250, 750];
      for (let i = 0; i < board.length; i++) {
        const row = board[i];
        const u = await store.userByName(String(row.name || "").toLowerCase());
        if (!u) continue;
        await store.grantXpOnce(u.id, "daily:" + circuit + ":" + (i + 1), XP[i]);
      }
    } catch (e) { console.error("pass rollover:", e && e.message); }
  }

  async function route(req, res, url) {
    if (req.method === "OPTIONS") { cors(res); res.writeHead(204).end(); return true; }
    if (!url.pathname.startsWith("/api/pass/")) return false;

    const user = await userFor(bearer(req));
    if (!user) return json(res, 401, { error: "Sign in for the Apex Pass." }), true;

    if (url.pathname === "/api/pass/state" && req.method === "GET") {
      /* Playtime XP is retired. This is where it is actually taken back
         off an account — the first time its pass is opened after the
         change, and a no-op every time after that, since by then nothing
         is left for it to find. */
      const undone = await store.takePlaytimeXp(user.id);
      if (undone.removed) user.pass_xp = undone.xp;
      const [claimed, owned, packs] = await Promise.all([
        store.claimedLevels(user.id, SEASON), store.ownedItems(user.id), store.packsFor(user.id),
      ]);
      return json(res, 200, {
        coins: Number(user.coins) || 0,
        xp: Number(user.pass_xp) || 0,
        level: passLevel(user.pass_xp),
        season: SEASON,
        claimed, owned, packs,
        packOdds: PACK_ODDS,
      }), true;
    }

    if (req.method !== "POST") return json(res, 405, { error: "Not allowed." }), true;
    let body;
    try { body = await readBody(req); }
    catch (e) { return json(res, 400, { error: "That request didn't make sense." }), true; }

    if (url.pathname === "/api/pass/claim") {
      if (overRate("pc:" + user.id, 60, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      const level = Number(body.level);
      if (!Number.isInteger(level) || level < 1 || level > 50)
        return json(res, 400, { error: "That isn't a level." }), true;
      /* The level a client asks for is never trusted on its own — only
         levels the account's own XP has actually reached can be claimed,
         worked out here from pass_xp exactly as the account desk does. */
      if (level > passLevel(user.pass_xp))
        return json(res, 403, { error: "Not there yet." }), true;
      const reward = FREE_PASS[level];
      if (!reward) return json(res, 400, { error: "That level has nothing on it." }), true;
      const { claimed } = await store.claimLevel(user.id, SEASON, level);
      if (!claimed) return json(res, 409, { error: "Already claimed." }), true;
      const result = await grant(user.id, reward);
      return json(res, 200, { level, result }), true;
    }

    /* Which title is worn, on the account itself rather than in one
       browser's storage — the same title on a phone as on a desktop, and
       the default a new lap's own title (relay/laps.js) is sent as. Empty
       or missing clears it. */
    if (url.pathname === "/api/pass/title") {
      if (overRate("pt:" + user.id, 30, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      let title = body.title ? String(body.title).slice(0, 24) : null;
      if (title) {
        const owned = await store.ownedItems(user.id);
        if (!owned.includes("title:" + title)) return json(res, 403, { error: "Not owned." }), true;
      }
      title = await store.setEquippedTitle(user.id, title);
      return json(res, 200, { title }), true;
    }

    if (url.pathname === "/api/pass/packs/open") {
      if (overRate("po:" + user.id, 30, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      const packId = String(body.packId || "");
      const pack = await store.takePack(user.id, packId);
      if (!pack) return json(res, 404, { error: "No such pack." }), true;
      const rarity = rollRarity(pack.pack_type);
      const picked = rollItem(rarity);
      if (!picked) return json(res, 500, { error: "Nothing to give from that pack just now." }), true;
      const result = picked.slot === "car"
        ? await grantItem(user.id, "car", picked.id)
        : await grantItem(user.id, picked.slot, picked.id);
      return json(res, 200, { packType: pack.pack_type, rolledRarity: rarity, result }), true;
    }

    /* The events the relay has no other way to see for itself: a
       race/overtake a driver reports having just done. There is no
       server-side race to check this against — multiplayer rooms are
       ephemeral and keep no history — so a key was only ever dedup, never
       proof the event happened. That made the true limit whatever overRate
       allowed, and one shared 40-per-10-minutes bucket across all four
       events let race10's 1,500 XP be called at that same rate: a level 50
       account in minutes, no driving involved. Each event now keeps its own
       bucket, sized to how often a real one plausibly happens, and a race
       key's claimed finish time has to fall in the range a real lap time
       already has to (relay/laps.js's own MIN_MS/MAX_MS) — still a claim,
       not a record, but no longer one a script can cash in unbounded. */
    if (url.pathname === "/api/pass/xp") {
      const event = String(body.event || "");
      const XP_TABLE = {
        overtake: { amount: () => 10, max: 10, per10min: 20 },
        race1: { amount: () => 150, max: 150, per10min: 6 },
        race3: { amount: () => 400, max: 400, per10min: 3 },
        race10: { amount: () => 1500, max: 1500, per10min: 1 },
      };
      const spec = XP_TABLE[event];
      if (!spec) return json(res, 400, { error: "No such event." }), true;
      if (overRate("px:" + event + ":" + user.id, spec.per10min, 10 * 60_000))
        return json(res, 429, { error: "Slow down a moment." }), true;
      const amount = Math.min(spec.max, Math.max(0, spec.amount(body) | 0));
      if (!amount) return json(res, 400, { error: "Nothing to grant." }), true;
      const key = String(body.key || "");
      if (!key || key.length > 200) return json(res, 400, { error: "That needs a key." }), true;
      if (event === "race1" || event === "race3" || event === "race10") {
        const claimedMs = Number(key.slice(key.lastIndexOf(":") + 1));
        if (!Number.isFinite(claimedMs) || claimedMs < 5000 || claimedMs > 30 * 60_000)
          return json(res, 400, { error: "That doesn't look like a finish." }), true;
      }
      /* Nothing here pays out on a circuit built short enough to lap in
         seconds — same floor relay/laps.js holds a verified lap to,
         applied to the length the page itself reports, since a
         multiplayer circuit is never saved here to measure independently. */
      if (!(Number(body.circuitLen) >= 1000))
        return json(res, 400, { error: "Too short a circuit for that." }), true;
      /* An overtake only pays out against a field actually worth passing —
         weak AI is not a race. No such thing to check for a human-only
         field, so this only ever fires with AI actually in it. */
      if (event === "overtake" && body.aiOn && !(Number(body.aiStrength) >= 75))
        return json(res, 400, { error: "That AI wasn't strong enough." }), true;
      const { granted, xp } = await store.grantXpOnce(user.id, event + ":" + key, amount);
      /* Quest progress: a finished race, at the same once-only, rate
         limited trust level its own XP already carries. Not overtakes —
         "races" means a finish, the same thing the weekly/seasonal
         quests below ask for. */
      if (granted && quests && (event === "race1" || event === "race3" || event === "race10")) {
        try { await quests.addMetricProgress(user.id, "races", 1); } catch (e) {}
      }
      return json(res, 200, { granted, xp: granted ? xp : Number(user.pass_xp) || 0 }), true;
    }

    /* A test-only shortcut: everything in the pool, on the shelf, at once —
       so every reward can be eyeballed without playing to it. Runs through
       the same grantItem as a real claim, so anything already owned just
       pays out its coin value instead of a second copy, and a level claimed
       afterwards behaves exactly as it would have before this ran: the
       reward is still rolled, it is just already a duplicate. Touches
       nothing about xp, claimed levels or coins beyond that.

       Kept behind cosmo38 specifically, even now the rest of the pass is
       open to everyone — this is the one door that has to stay shut, or
       every player could hand themselves the entire item pool for free. */
    if (url.pathname === "/api/pass/grant-all") {
      if (!isPassTester(user)) return json(res, 404, { error: "No such endpoint." }), true;
      if (overRate("gaa:" + user.id, 5, 60 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      const results = [];
      for (const [slot, id] of ITEM_POOL) {
        try { results.push(await grantItem(user.id, slot, id)); }
        catch (e) { console.error("grant-all:", slot, id, e && e.message); }
      }
      return json(res, 200, { granted: results.length }), true;
    }

    /* A test-only shortcut of a different shape: not a whole pool at once,
       but one unopened pack of a chosen rarity, dropped straight onto the
       real pack shelf — so the actual rarity-based odds (PACK_ODDS above)
       can be tried through the real /api/pass/packs/open flow, duplicate
       handling and all, rather than only ever being seen through Level 20
       and Level 40. Same cosmo38-only gate as grant-all, for the same
       reason: a free pack of any rarity on demand is not something every
       player gets to press a button for. */
    if (url.pathname === "/api/pass/test/pack") {
      if (!isPassTester(user)) return json(res, 404, { error: "No such endpoint." }), true;
      if (overRate("tp:" + user.id, 30, 10 * 60_000)) return json(res, 429, { error: "Slow down a moment." }), true;
      const rarity = String(body.rarity || "");
      if (!PACK_ODDS[rarity]) return json(res, 400, { error: "No such pack rarity." }), true;
      const pack = await store.addPack(user.id, rarity, "test");
      return json(res, 200, { pack }), true;
    }

    return json(res, 404, { error: "No such endpoint." }), true;
  }

  return { route, rolloverDaily, isPassTester, RARITY_COINS, PACK_ODDS, FREE_PASS };
}

module.exports = { makePass, isPassTester, PASS_ACCOUNT };
