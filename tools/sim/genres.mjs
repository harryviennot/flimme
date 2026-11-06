#!/usr/bin/env node
// Bot games for roadmap task M6.52: each player picks up to 3 TMDB genres in the lobby and the
// first release's SQL deck leans toward them. Does the median time to a pick stay under 5 minutes,
// split picks included? Results and method: docs/product/simulations.md#per-player-genres.
// Bot tastes, the catalog's shape, paces and voting times are made up. These games test the
// mechanics (time to a pick, matches, Final Cuts), never the fun.
//   node tools/sim/genres.mjs                 every table (1,000 games per cell, about 8 minutes)
//   node tools/sim/genres.mjs --games 300     fewer games, noisier
//   node tools/sim/genres.mjs --seed 7        another seed (default 1)
//   node tools/sim/genres.mjs --only main     one section: catalog, main, cap, share, guard, sensitivity
import { pathToFileURL } from 'node:url';
import { hash, probit, stream } from './game.mjs';
import { playDeal } from './shortlist.mjs';

// ---------- The catalog: a synthetic French night ----------

// TMDB's movie genres, with the share of films carrying each. Made up, shaped like TMDB's popular
// films (a film has 2 to 3 genres on average); not measured on production, whose titles.genre_ids
// this sim never reads. The family only makes genres of the same kind turn up together
// (Action with Adventure, Crime with Thriller), as they do on TMDB.
export const GENRES = [
  { id: 18, name: 'Drama', share: 0.42, family: 'real' },
  { id: 35, name: 'Comedy', share: 0.32, family: 'light' },
  { id: 53, name: 'Thriller', share: 0.24, family: 'dark' },
  { id: 28, name: 'Action', share: 0.22, family: 'spectacle' },
  { id: 10749, name: 'Romance', share: 0.15, family: 'light' },
  { id: 12, name: 'Adventure', share: 0.15, family: 'spectacle' },
  { id: 80, name: 'Crime', share: 0.14, family: 'dark' },
  { id: 27, name: 'Horror', share: 0.12, family: 'dark' },
  { id: 878, name: 'Science Fiction', share: 0.1, family: 'spectacle' },
  { id: 10751, name: 'Family', share: 0.1, family: 'light' },
  { id: 14, name: 'Fantasy', share: 0.1, family: 'spectacle' },
  { id: 16, name: 'Animation', share: 0.09, family: 'light' },
  { id: 9648, name: 'Mystery', share: 0.08, family: 'dark' },
  { id: 99, name: 'Documentary', share: 0.06, family: 'real' },
  { id: 36, name: 'History', share: 0.05, family: 'real' },
  { id: 10402, name: 'Music', share: 0.04, family: 'light' },
  { id: 10752, name: 'War', share: 0.03, family: 'spectacle' },
  { id: 10770, name: 'TV Movie', share: 0.03, family: 'real' },
  { id: 37, name: 'Western', share: 0.015, family: 'spectacle' },
];
const FAMILIES = ['real', 'light', 'dark', 'spectacle'];
const TV_MOVIE = GENRES.findIndex((g) => g.id === 10770);
const FAMILY_OF = GENRES.map((g) => FAMILIES.indexOf(g.family));
const SHARE_SUM = GENRES.reduce((a, g) => a + g.share, 0);

// ---------- What is made up ----------

export const WORLD = {
  eligible: 1500, // films that pass tonight's filters (services, age cap, time budget, quality)
  genreWeight: 0.3, // share of a player's taste for a film that its genres explain
  agreement: 0.25, // correlation between two players' tastes for the rest (simulations.md: medium)
  likeRate: 0.15, // chance a player would pick a random eligible film tonight
  barSpread: 0.25, // pickier and easier players
  superLikes: 2,
  deckSkill: 0.5, // correlation between the crowd score and what the group shares
  pickNoise: 0.5, // how far a player's picks stray from their strongest genres
  sameTaste: 0.8, // genre tastes in common, for shared picks and within a camp
};

// The deck's starting values (the proposal, docs/architecture/deck-engine.md#the-sql-fallback).
export const DECK = {
  cap: 3, // genres per player
  share: 0.75, // pick slots: about 3 cards in 4
  guard: 100, // a pick pool under this many films gets a smaller share
  minGenre: 30, // a genre with fewer films tonight isn't offered
  weight: 'share', // 'share': odds times the film's weight; 'bonus': +1 point times it; 'flat': none
  temperature: 0.3, // the weighted shuffle
  candidates: 300, // internal.deck_candidates' cut, per pool
  miseryLine: 1, // deal_baseline's first try: group score of at least 1
  opening: 10, // the shared opening
  depth: 500, // films kept in the room's order (no seat answers that many in 6 minutes)
  byPickers: false, // a variant: the pick share times the share of players who picked
};

// The current launch rules (game-modes.md): the third match ends swiping, a single match is the
// pick, 2 or 3 go to a vote between them, otherwise finalists from the swipes, one seat each.
const RULE = { goal: 3, oneMatch: 'pick', finalists: 'seats' };

// ---------- Small helpers ----------

// A standard normal and a uniform in (0, 1) fixed by a seed, so a film or a seat keeps the same
// draw whatever the deck: today's deck and the genre deck meet the same players.
const normalAt = (seed) => {
  const u = (hash(seed, 5) + 0.5) / 4294967296;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos((2 * Math.PI * (hash(seed, 6) + 0.5)) / 4294967296);
};
const uniformAt = (seed) => (hash(seed, 7) + 0.5) / 4294967296;

// ---------- The night's films ----------

// Each film: its genres (indexes into GENRES), the group's shared appeal and the crowd score.
// score is the SQL deal's group score: 5 x the crowd's percentile among tonight's films.
export function makeCatalog(eligible, key, world = WORLD) {
  const r = stream(hash(key, 21));
  const films = [];
  for (let f = 0; f < eligible; f++) {
    const lean = FAMILIES.map(() => Math.exp(0.8 * r.normal() - 0.32)); // mean 1
    let genres = [];
    for (let g = 0; g < GENRES.length; g++) {
      if (r.next() < Math.min(0.95, GENRES[g].share * lean[FAMILY_OF[g]])) genres.push(g);
    }
    if (genres.length === 0) {
      let x = r.next() * SHARE_SUM;
      let g = 0;
      while (x > GENRES[g].share) x -= GENRES[g++].share;
      genres = [g];
    }
    const shared = r.normal();
    const estimate = world.deckSkill * shared + Math.sqrt(1 - world.deckSkill ** 2) * r.normal();
    films.push({ id: f, genres, shared, estimate, score: 0 });
  }
  const byEstimate = [...films].sort((a, b) => a.estimate - b.estimate || a.id - b.id);
  byEstimate.forEach((film, i) => (film.score = (5 * i) / Math.max(1, eligible - 1)));
  return films;
}

// Genres the sheet offers tonight: every one but TV Movie with at least minGenre films.
export function offeredGenres(films, minGenre = DECK.minGenre) {
  const counts = new Array(GENRES.length).fill(0);
  for (const film of films) for (const g of film.genres) counts[g]++;
  return GENRES.map((_, g) => g).filter((g) => g !== TV_MOVIE && counts[g] >= minGenre);
}

// ---------- The players ----------

// Taste for each genre, by scenario:
//   shared: everyone leans the same way (sameTaste in common);
//   mixed: everyone on their own (no genre taste in common);
//   split: two camps with opposite tastes (what one camp picks, the other likes least);
//   none and one: tastes as in mixed; nobody picks, or only seat 0 does.
export const SCENARIOS = {
  none: 'No picks',
  one: "One player picks, the others don't",
  shared: 'Shared picks',
  mixed: 'Everyone different',
  split: 'Split picks (two opposite camps)',
};

export function genreTastes(players, scenario, key, world = WORLD) {
  const r = stream(hash(key, 22));
  const common = GENRES.map(() => r.normal());
  const a = Math.sqrt(world.sameTaste);
  const b = Math.sqrt(1 - world.sameTaste);
  return Array.from({ length: players }, (_, s) =>
    GENRES.map((_, g) => {
      const own = r.normal();
      if (scenario === 'shared') return a * common[g] + b * own;
      if (scenario === 'split')
        return (s < Math.ceil(players / 2) ? 1 : -1) * a * common[g] + b * own;
      return own;
    }),
  );
}

// Who picks in each scenario.
export const pickers = (players, scenario) =>
  Array.from({ length: players }, (_, s) =>
    scenario === 'none' ? false : scenario === 'one' ? s === 0 : true,
  );

// A player's picks: their strongest offered genres, with a little noise, at most cap.
export function pickGenres(taste, offered, cap, key, world = WORLD) {
  const r = stream(key);
  return offered
    .map((g) => [taste[g] + world.pickNoise * r.normal(), g])
    .sort((x, y) => y[0] - x[0])
    .slice(0, cap)
    .map((x) => x[1]);
}

// A film's weight: the share of players with picks whose picks include one of its genres.
// Players with no picks don't count; with no picks at all, every weight is 0.
export function filmWeight(film, picks) {
  const counted = picks.filter((p) => p.length > 0);
  if (counted.length === 0) return 0;
  const hits = counted.filter((p) => p.some((g) => film.genres.includes(g))).length;
  return hits / counted.length;
}

// The pick slots' share: about 3 in 4, shrunk in proportion when the pick pool is under the guard.
export const pickShare = (poolSize, deck = DECK) =>
  poolSize === 0 ? 0 : deck.share * Math.min(1, poolSize / deck.guard);

// Which slots draw from the pick pool: spread evenly, the first slot a pick slot.
export function slotPattern(n, share) {
  const out = [];
  let acc = 0.5;
  for (let i = 0; i < n; i++) {
    acc += share;
    if (acc >= 1) {
      out.push(true);
      acc -= 1;
    } else out.push(false);
  }
  return out;
}

// ---------- The deck ----------

// One order for the whole room, as the SQL deal has today: internal.shuffle_key hashes the room's
// seed and the film, not the seat, so every seat walks the same list (refills give a seat the
// films others were dealt first). Candidates come in windows of 300 by score, as a refill would
// call internal.deck_candidates again; inside a window, the weighted shuffle.
function shuffled(films, keyOf, scoreOf, deck) {
  const score = new Map(films.map((f) => [f, scoreOf(f)]));
  const ranked = [...films].sort((a, b) => score.get(b) - score.get(a) || a.id - b.id);
  const above = ranked.filter((f) => score.get(f) >= deck.miseryLine);
  const list = above.length >= 50 ? above : ranked; // deal_baseline's second try drops the line
  const out = [];
  for (let at = 0; at < list.length && out.length < deck.depth; at += deck.candidates) {
    const window = list.slice(at, at + deck.candidates).map((f) => [keyOf(f), f]);
    window.sort((a, b) => b[0] - a[0]);
    for (const [, f] of window) out.push(f);
  }
  return out;
}

// variant 'today': the first release's deck. 'genres': the pick pool fills its share of slots,
// drawn by the weight; the open slots follow today's order; a pool that runs dry hands its slots
// to the open order, and the other way round.
export function buildDeck(films, weights, variant, key, deck = DECK) {
  const gumbel = new Map(
    films.map((f) => [f.id, -Math.log(-Math.log(uniformAt(hash(key, f.id))))]),
  );
  const T = deck.temperature;
  const today = shuffled(
    films,
    (f) => f.score / T + gumbel.get(f.id),
    (f) => f.score,
    deck,
  );
  const pool = films.filter((f) => weights[f.id] > 0);
  const share = variant === 'genres' ? pickShare(pool.length, deck) : 0;
  if (share === 0) {
    return { order: today.slice(0, deck.depth), poolSize: pool.length, share, guard: false };
  }
  const pickScore = (f) =>
    deck.weight === 'bonus'
      ? f.score + weights[f.id]
      : deck.weight === 'share'
        ? f.score + T * Math.log(weights[f.id])
        : f.score;
  const picks = shuffled(pool, (f) => pickScore(f) / T + gumbel.get(f.id), pickScore, deck);
  const used = new Set();
  const order = [];
  const take = (list, at) => {
    while (at.i < list.length && used.has(list[at.i].id)) at.i++;
    return at.i < list.length ? list[at.i] : null;
  };
  const pi = { i: 0 };
  const oi = { i: 0 };
  for (const isPick of slotPattern(Math.min(deck.depth, films.length), share)) {
    const film = (isPick ? take(picks, pi) : take(today, oi)) ?? take(picks, pi) ?? take(today, oi);
    if (!film) break;
    used.add(film.id);
    order.push(film);
  }
  return { order, poolSize: pool.length, share, guard: pool.length < deck.guard };
}

// ---------- One room ----------

// The last night built, kept so the variants of one room (runCells) share its catalog.
let lastNight = null;
function catalogFor(eligible, key, world) {
  const id = `${eligible}:${key}:${world.deckSkill}`;
  if (lastNight?.id !== id) lastNight = { id, films: makeCatalog(eligible, key, world) };
  return lastNight.films;
}

// opts: { players, scenario, variant: 'today' | 'genres', world?, deck? }
// Returns the game's result plus what the deck did.
export function playRoom(opts, key) {
  const world = { ...WORLD, ...opts.world };
  const deck = { ...DECK, ...opts.deck };
  const { players, scenario, variant } = opts;
  const films = catalogFor(opts.eligible ?? world.eligible, key, world);
  const offered = offeredGenres(films, deck.minGenre);
  const tastes = genreTastes(players, scenario, key, world);
  const who = pickers(players, scenario);
  const picks = tastes.map((t, s) =>
    who[s] ? pickGenres(t, offered, deck.cap, hash(key, 50 + s), world) : [],
  );
  const weights = films.map((f) => filmWeight(f, picks));
  // byPickers (a tuning variant): the pick share shrinks with the share of players who picked.
  const picked = picks.filter((p) => p.length > 0).length / players;
  const dealt = deck.byPickers ? { ...deck, share: deck.share * picked } : deck;
  const built = buildDeck(films, weights, variant, hash(key, 23), dealt);

  // Taste for a film: its genres' share (the average of the player's genre tastes, scaled back
  // to a spread of 1) plus the rest, shared in part with the group. A like clears the player's bar.
  const r = stream(hash(key, 24));
  const baseBar = probit(1 - world.likeRate);
  const bar = Array.from({ length: players }, () => baseBar + world.barSpread * r.normal());
  const gw = Math.sqrt(world.genreWeight);
  const rest = Math.sqrt(1 - world.genreWeight);
  const util = tastes.map((t, s) =>
    Float64Array.from(built.order, (film) => {
      const genre = film.genres.reduce((a, g) => a + t[g], 0) / Math.sqrt(film.genres.length);
      const own = normalAt(hash(hash(key, 30 + s), film.id));
      const other = Math.sqrt(world.agreement) * film.shared + Math.sqrt(1 - world.agreement) * own;
      return gw * genre + rest * other;
    }),
  );
  const local = built.order.map((_, i) => i);
  const result = playDeal(
    RULE,
    {
      films: built.order.length,
      score: Float64Array.from(built.order, (f) => f.score),
      util,
      bar,
      opening: local.slice(0, deck.opening),
      orders: Array.from({ length: players }, () => local.slice(deck.opening)),
      superLikes: world.superLikes,
    },
    key,
  );

  // What the cards were: from the pick pool, and in each picker's own genres.
  let answered = 0;
  let liked = 0;
  let fromPool = 0;
  let own = 0;
  let ownOf = 0;
  for (let s = 0; s < players; s++) {
    for (let i = 0; i < built.order.length; i++) {
      if (result.answers[s][i] === 0) continue;
      const film = built.order[i];
      answered++;
      if (result.answers[s][i] > 0) liked++;
      if (weights[film.id] > 0) fromPool++;
      if (picks[s].length > 0) {
        ownOf++;
        if (picks[s].some((g) => film.genres.includes(g))) own++;
      }
    }
  }
  const overlap =
    picks.filter((p) => p.length).length >= 2
      ? GENRES.filter((_, g) => picks.filter((p) => p.includes(g)).length >= 2).length
      : null;
  return {
    ...result,
    answers: undefined,
    poolSize: built.poolSize,
    share: built.share,
    guard: built.guard,
    offered: offered.length,
    likeRate: answered ? liked / answered : 0,
    fromPool: answered ? fromPool / answered : 0,
    ownGenres: ownOf ? own / ownOf : null,
    sharedGenres: overlap,
  };
}

// ---------- Reports ----------

const pct = (x) => `${Math.round(100 * x)}%`;
const clock = (s) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const quantile = (xs, q) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

// Every cell plays the same rooms (same keys), so a difference between cells comes from the deck.
// runCells plays every variant of a room before the next room, so they share its catalog.
export function runCells(list, games, seed) {
  const outs = list.map(() => []);
  for (let g = 0; g < games; g++) {
    list.forEach((opts, i) => outs[i].push(playRoom(opts, hash(seed * 1000003 + opts.players, g))));
  }
  return outs.map((out) => summarize(out, games));
}
export const runCell = (opts, games, seed) => runCells([opts], games, seed)[0];

function summarize(out, games) {
  const times = out.map((g) => g.at);
  return {
    median: quantile(times, 0.5),
    p90: quantile(times, 0.9),
    within5: out.filter((g) => g.at <= 300).length / games,
    matches: mean(out.map((g) => g.matches)),
    noMatch: out.filter((g) => g.matches === 0).length / games,
    voted: out.filter((g) => g.voted).length / games,
    liked: mean(out.filter((g) => g.pickLikedBy !== undefined).map((g) => g.pickLikedBy)),
    likeRate: mean(out.map((g) => g.likeRate)),
    fromPool: mean(out.map((g) => g.fromPool)),
    ownGenres: mean(out.filter((g) => g.ownGenres !== null).map((g) => g.ownGenres)),
    guard: out.filter((g) => g.guard).length / games,
    poolSize: quantile(
      out.map((g) => g.poolSize),
      0.5,
    ),
    sharedGenres: mean(out.filter((g) => g.sharedGenres !== null).map((g) => g.sharedGenres)),
  };
}

function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
  };
  const GAMES = Number(option('games', 1000));
  const SEED = Number(option('seed', 1));
  const ONLY = option('only', null);
  const SIZES = [2, 3, 4, 6, 8];
  const cells = (list) => runCells(list, GAMES, SEED);
  const pair = (a, b) => `${a} / ${b}`;
  const times = (c) => `${clock(c.median)} / ${clock(c.p90)}`;
  const show = (name) => !ONLY || ONLY === name;

  console.log(
    `Seed ${SEED}, ${GAMES} games per cell. Bot tastes, the catalog's shape, paces and voting times are made up.`,
  );

  if (show('catalog')) {
    console.log('\n**The synthetic catalog, one night of 1,500 eligible films**\n');
    const films = makeCatalog(WORLD.eligible, hash(SEED, 99));
    const n = films.length;
    const offered = new Set(offeredGenres(films));
    console.log(`${mean(films.map((f) => f.genres.length)).toFixed(1)} genres a film.\n`);
    console.log('| Genre | Share of films | Films tonight | Offered |');
    console.log('| --- | --- | --- | --- |');
    GENRES.forEach((g, i) => {
      const count = films.filter((f) => f.genres.includes(i)).length;
      console.log(
        `| ${g.name} | ${pct(count / n)} | ${count} | ${offered.has(i) ? 'yes' : 'no'} |`,
      );
    });
  }

  if (show('main')) {
    for (const scenario of ['split', 'mixed', 'shared', 'one']) {
      console.log(`\n**${SCENARIOS[scenario]}: today's deck / with genres**\n`);
      console.log(
        '| Players | Median / 90th pct | Within 5 min | Matches a game | No match (vote from the swipes) | Players who like the pick | Like rate | Cards from the pick pool | Cards in your own genres | Pick pool, median films |',
      );
      console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const players of SIZES) {
        const [a, b] = cells([
          { players, scenario, variant: 'today' },
          { players, scenario, variant: 'genres' },
        ]);
        console.log(
          `| ${players} | ${pair(times(a), times(b))} | ${pair(pct(a.within5), pct(b.within5))} | ${pair(a.matches.toFixed(1), b.matches.toFixed(1))} | ${pair(pct(a.noMatch), pct(b.noMatch))} | ${pair(pct(a.liked), pct(b.liked))} | ${pair(pct(a.likeRate), pct(b.likeRate))} | ${pair(pct(a.fromPool), pct(b.fromPool))} | ${pair(pct(a.ownGenres), pct(b.ownGenres))} | ${b.poolSize} |`,
        );
      }
    }
    console.log("\n**No picks: the genre deck against today's**\n");
    console.log('| Players | Median / 90th pct, today | Median / 90th pct, genres | Same games |');
    console.log('| --- | --- | --- | --- |');
    for (const players of SIZES) {
      const [a, b] = cells([
        { players, scenario: 'none', variant: 'today' },
        { players, scenario: 'none', variant: 'genres' },
      ]);
      const same = JSON.stringify(a) === JSON.stringify(b) ? 'yes' : 'no';
      console.log(`| ${players} | ${times(a)} | ${times(b)} | ${same} |`);
    }
  }

  const tuning = (title, variants, scenarios = ['split', 'mixed', 'shared']) => {
    console.log(`\n**${title}**\n`);
    console.log(
      '| Picks | Players | Variant | Median / 90th pct | Matches a game | No match | Players who like the pick | Cards in your own genres |',
    );
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const scenario of scenarios) {
      for (const players of [4, 8]) {
        const out = cells(variants.map(([, opts]) => ({ players, scenario, ...opts })));
        variants.forEach(([label], i) => {
          const c = out[i];
          console.log(
            `| ${SCENARIOS[scenario]} | ${players} | ${label} | ${times(c)} | ${c.matches.toFixed(1)} | ${pct(c.noMatch)} | ${pct(c.liked)} | ${pct(c.ownGenres)} |`,
          );
        });
      }
    }
  };

  if (show('cap')) {
    tuning('Cap: genres per player', [
      ["Today's deck", { variant: 'today' }],
      ...[1, 2, 3, 5].map((cap) => [`Cap ${cap}`, { variant: 'genres', deck: { cap } }]),
    ]);
  }
  if (show('share')) {
    tuning('Pick share and weighting', [
      ["Today's deck", { variant: 'today' }],
      ['1 in 2, weight as odds', { variant: 'genres', deck: { share: 0.5 } }],
      ['3 in 4, weight as odds (proposed)', { variant: 'genres' }],
      ['Every card, weight as odds', { variant: 'genres', deck: { share: 1 } }],
      ['3 in 4, no weight (pool only)', { variant: 'genres', deck: { weight: 'flat' } }],
      ['3 in 4, weight as +1 point', { variant: 'genres', deck: { weight: 'bonus' } }],
    ]);
    tuning(
      'When only one player picks: the share as proposed, or scaled by the players who picked',
      [
        ["Today's deck", { variant: 'today' }],
        ['3 in 4 (proposed)', { variant: 'genres' }],
        ['3 in 4 x share of players who picked', { variant: 'genres', deck: { byPickers: true } }],
      ],
      ['one'],
    );
  }
  if (show('guard')) {
    console.log('\n**A narrow night: 400 eligible films (one service and an age cap, say)**\n');
    console.log(
      '| Picks | Players | Variant | Genres offered | Pick pool, median | Guard fired | Median / 90th pct | No match | Cards in your own genres |',
    );
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    const variants = [
      ["Today's deck", { variant: 'today' }],
      ['Guard 50', { variant: 'genres', deck: { guard: 50 } }],
      ['Guard 100 (proposed)', { variant: 'genres' }],
      ['Guard 200', { variant: 'genres', deck: { guard: 200 } }],
      ['Guard 100, genres from 15 films', { variant: 'genres', deck: { minGenre: 15 } }],
      ['Guard 100, genres from 50 films', { variant: 'genres', deck: { minGenre: 50 } }],
    ];
    for (const scenario of ['one', 'split']) {
      for (const players of [2, 4]) {
        const out = cells(
          variants.map(([, opts]) => ({ players, scenario, eligible: 400, ...opts })),
        );
        variants.forEach(([label, opts], i) => {
          const c = out[i];
          const offered = mean(
            Array.from(
              { length: 100 },
              (_, g) => offeredGenres(makeCatalog(400, hash(SEED, g)), opts.deck?.minGenre).length,
            ),
          );
          console.log(
            `| ${SCENARIOS[scenario]} | ${players} | ${label} | ${offered.toFixed(1)} | ${c.poolSize} | ${pct(c.guard)} | ${times(c)} | ${pct(c.noMatch)} | ${pct(c.ownGenres)} |`,
          );
        });
      }
    }
  }
  if (show('sensitivity')) {
    console.log("\n**When the made-up numbers move: split picks, today's deck / with genres**\n");
    console.log(
      '| Assumption | Players | Median / 90th pct | Matches a game | No match | Players who like the pick |',
    );
    console.log('| --- | --- | --- | --- | --- | --- |');
    const worlds = [
      ['The reference', {}],
      ['Genres explain less (0.15)', { genreWeight: 0.15 }],
      ['Genres explain more (0.45)', { genreWeight: 0.45 }],
      ['Like rate 10%', { likeRate: 0.1 }],
      ['Low agreement (0.1)', { agreement: 0.1 }],
      ['Noisier picks (1.0)', { pickNoise: 1 }],
    ];
    for (const [label, world] of worlds) {
      for (const players of [2, 4, 8]) {
        const [a, b] = cells([
          { players, scenario: 'split', variant: 'today', world },
          { players, scenario: 'split', variant: 'genres', world },
        ]);
        console.log(
          `| ${label} | ${players} | ${pair(times(a), times(b))} | ${pair(a.matches.toFixed(1), b.matches.toFixed(1))} | ${pair(pct(a.noMatch), pct(b.noMatch))} | ${pair(pct(a.liked), pct(b.liked))} |`,
        );
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
