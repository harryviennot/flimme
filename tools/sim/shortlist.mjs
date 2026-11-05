#!/usr/bin/env node
// Bot games for docs/product/proposals/three-matches-and-fair-finalists.md: a shortlist of up to
// 3 matches instead of "the first match ends the game", and finalists that give every player a seat.
// Bot tastes, paces and voting times are made up (docs/product/simulations.md#the-model). The
// "random 50%" world copies the staging bots (tools/bots): each likes any card half the time.
//   node tools/sim/shortlist.mjs                 every table (1,000 games per cell, about a minute)
//   node tools/sim/shortlist.mjs --games 300     fewer games, noisier
//   node tools/sim/shortlist.mjs --seed 7        another seed (default 1)
//   node tools/sim/shortlist.mjs --only matches  one section: matches, finalists
import { hash, likesNeeded, probit, stream } from './game.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const GAMES = Number(option('games', 1000));
const SEED = Number(option('seed', 1));
const ONLY = option('only', null);
const SIZES = [2, 3, 4, 5, 6];

// ---------- Worlds: what is made up ----------

// agreement and likeRate as in game.mjs; random50 is the staging bots (no shared taste, no super likes).
const WORLDS = {
  random50: { agreement: 0, likeRate: 0.5, barSpread: 0, superLikes: 0 },
  low: { agreement: 0.1, likeRate: 0.15, barSpread: 0.25, superLikes: 2 },
  medium: { agreement: 0.25, likeRate: 0.15, barSpread: 0.25, superLikes: 2 },
  high: { agreement: 0.4, likeRate: 0.15, barSpread: 0.25, superLikes: 2 },
};
const WORLD_LABELS = {
  random50: 'Random 50% (the staging bots)',
  low: 'Low agreement (0.1)',
  medium: 'Medium agreement (0.25)',
  high: 'High agreement (0.4)',
};
const POOL = 200;
const WARMUP = 10;
const MOUNTED = 3;
const DECK_SKILL = 0.5;
const SCORE_SPREAD = 0.5;
const TEMPERATURE = 0.3;
const SHORTLIST_PAUSE = 3; // seconds every phone stops for the "shortlisted" beat (made up)
const REVEAL = 4; // seconds for the reveal after a vote (moments.md#the-reveal)
const swipeMean = (players) => (players === 2 ? 3 : players <= 4 ? 3.5 : 4);

// ---------- One game ----------

// rule: {
//   goal: matches that end the game (1 is today),
//   lastCall: null | { seconds } | { cards }: after the first match, the shortlist closes then,
//   oneMatch: 'pick' (a single match at the finale trigger is the pick) | 'finale' (seeded first, filled),
//   finalists: 'today' | 'seats' (one seat per player, see coverFinalists),
//   humanSlow: seat 0 swipes at the usual pace, the bots twice as fast (Harry's game),
//   noMatch: no film can match, so every game reaches a finale built from swipes,
// }
export function play(rule, players, worldName, key) {
  const w = WORLDS[worldName];
  const taste = stream(hash(key, 1));
  const deck = stream(hash(key, 2));
  const pace = stream(hash(key, 3));
  const vote = stream(hash(key, 4));

  const shared = new Float64Array(POOL);
  const score = new Float64Array(POOL);
  for (let f = 0; f < POOL; f++) {
    shared[f] = taste.normal();
    const estimate = DECK_SKILL * shared[f] + Math.sqrt(1 - DECK_SKILL ** 2) * taste.normal();
    score[f] = 3 + SCORE_SPREAD * estimate;
  }
  const baseBar = probit(1 - w.likeRate);
  const util = [];
  const bar = [];
  for (let s = 0; s < players; s++) {
    const u = new Float64Array(POOL);
    for (let f = 0; f < POOL; f++) {
      u[f] = Math.sqrt(w.agreement) * shared[f] + Math.sqrt(1 - w.agreement) * taste.normal();
    }
    util.push(u);
    bar.push(baseBar + w.barSpread * taste.normal());
  }
  const wouldLike = (s, f) => util[s][f] > bar[s];

  const draw = (exclude) => {
    const keys = new Float64Array(POOL);
    const ids = [];
    for (let f = 0; f < POOL; f++) {
      keys[f] = score[f] / TEMPERATURE - Math.log(-Math.log(deck.next() || 1e-12));
      if (!exclude.has(f)) ids.push(f);
    }
    return ids.sort((x, y) => keys[y] - keys[x]);
  };
  const opening = draw(new Set()).slice(0, WARMUP);
  const openingSet = new Set(opening);
  const seats = [];
  for (let s = 0; s < players; s++) {
    const status = new Uint8Array(POOL); // 0 not dealt, 1 upcoming, 2 answered or gone
    for (const f of opening) status[f] = 1;
    seats.push({
      order: draw(openingSet),
      ptr: 0,
      front: [...opening],
      status,
      answered: 0,
      supers: w.superLikes,
    });
  }

  const chat = Math.exp(0.15 * pace.normal());
  const median = ((swipeMean(players) - 0.04 * 12.5) / Math.exp(0.45 ** 2 / 2)) * chat;
  const paces = Array.from({ length: players }, (_, s) => stream(hash(key, 10 + s)));
  const speed = paces.map(
    (r, s) => Math.exp(0.3 * r.normal()) * (rule.humanSlow && s > 0 ? 0.5 : 1),
  );
  const swipeTime = (s) => {
    const r = paces[s];
    let t = median * speed[s] * Math.exp(0.45 * r.normal());
    if (r.next() < 0.04) t += 5 + 15 * r.next();
    return t;
  };

  // Per-seat answers: 1 like, 2 super like, -1 nope, 0 none.
  const answers = Array.from({ length: players }, () => new Int8Array(POOL));
  const likes = new Int16Array(POOL);
  const supers = new Int16Array(POOL);
  const nopes = new Int16Array(POOL);
  const matched = [];
  const isMatched = new Uint8Array(POOL);
  const needed = rule.noMatch ? Infinity : likesNeeded(players);
  const cards = players <= 4 ? 40 : 30;
  const limit = 360;
  const closeFrom = Math.round(0.6 * cards);

  const fill = (seat, n) => {
    while (seat.front.length < n && seat.ptr < seat.order.length) {
      const f = seat.order[seat.ptr++];
      if (seat.status[f] === 0) {
        seat.status[f] = 1;
        seat.front.push(f);
      }
    }
  };
  const moveUp = (seat, f) => {
    if (seat.status[f] === 2) return;
    fill(seat, MOUNTED);
    const at = seat.front.indexOf(f);
    if (at >= 0 && at < MOUNTED) return;
    if (at >= 0) seat.front.splice(at, 1);
    seat.status[f] = 1;
    seat.front.splice(MOUNTED, 0, f);
  };

  const next = seats.map((_, s) => swipeTime(s));
  let end = null;
  let firstMatchAt = null;
  let answeredAtFirst = null;
  let last = 0;

  while (!end) {
    let s = 0;
    for (let i = 1; i < players; i++) if (next[i] < next[s]) s = i;
    const t = next[s];
    if (t === Infinity) {
      end = { how: 'empty', at: last };
      break;
    }
    if (t >= limit) {
      end = { how: 'time', at: limit };
      break;
    }
    if (
      rule.lastCall?.seconds &&
      firstMatchAt !== null &&
      t >= firstMatchAt + rule.lastCall.seconds
    ) {
      end = { how: 'lastcall', at: firstMatchAt + rule.lastCall.seconds };
      break;
    }
    const seat = seats[s];
    fill(seat, 1);
    if (seat.front.length === 0) {
      next[s] = Infinity;
      continue;
    }
    last = t;
    const f = seat.front.shift();
    seat.status[f] = 2;
    seat.answered++;
    let pause = 0;
    if (wouldLike(s, f)) {
      const first = likes[f] + supers[f] === 0;
      if (seat.supers > 0 && util[s][f] > bar[s] + 1.2) {
        seat.supers--;
        supers[f]++;
        answers[s][f] = 2;
      } else {
        likes[f]++;
        answers[s][f] = 1;
      }
      const total = likes[f] + supers[f];
      if (total >= needed) {
        matched.push(f);
        isMatched[f] = 1;
        if (firstMatchAt === null) {
          firstMatchAt = t;
          answeredAtFirst = seats.map((x) => x.answered);
        }
        if (matched.length >= rule.goal) {
          end = { how: 'goal', at: t };
          break;
        }
        // Shortlisted: the film leaves every deck, and every phone pauses for the beat.
        for (const x of seats) {
          const at = x.front.indexOf(f);
          if (at >= 0) x.front.splice(at, 1);
          x.status[f] = 2;
        }
        pause = SHORTLIST_PAUSE;
      } else {
        for (let j = 0; j < players; j++) {
          if (j === s) continue;
          if (first || (total === needed - 1 && seats[j].answered >= closeFrom))
            moveUp(seats[j], f);
        }
      }
    } else {
      nopes[f]++;
      answers[s][f] = -1;
    }

    if (seats.every((x) => x.answered >= cards)) {
      end = { how: 'cards', at: t };
      break;
    }
    if (
      rule.lastCall?.cards &&
      answeredAtFirst &&
      seats.every((x, i) => x.answered >= answeredAtFirst[i] + rule.lastCall.cards)
    ) {
      end = { how: 'lastcall', at: t };
      break;
    }
    if (pause) for (let j = 0; j < players; j++) next[j] = Math.max(next[j], t) + pause;
    next[s] = Math.max(next[s], t + pause) + swipeTime(s);
  }

  const m = matched.length;
  const base = { players, matches: m, how: end.how, firstMatchAt, endAt: end.at };
  const pickLikedBy = (f) => seats.filter((_, s) => wouldLike(s, f)).length / players;

  // A single match at the trigger is the pick.
  if (m === 1 && (rule.goal === 1 || rule.oneMatch === 'pick')) {
    return { ...base, ending: 'match', at: end.at, pickLikedBy: pickLikedBy(matched[0]) };
  }

  // ---------- Finalists ----------
  const k = players === 2 ? 3 : 4;
  const rank = (f) => likes[f] + 2 * supers[f] - nopes[f];
  const byRank = (a, b) => rank(b) - rank(a) || score[b] - score[a] || a - b;
  const liked = [];
  const unnoped = [];
  for (let f = 0; f < POOL; f++) {
    if (isMatched[f]) continue;
    if (likes[f] + supers[f] > 0) liked.push(f);
    else if (nopes[f] === 0) unnoped.push(f);
  }
  liked.sort(byRank);
  unnoped.sort((a, b) => score[b] - score[a] || a - b);
  const likedBySeat = (f) => {
    const out = [];
    for (let s = 0; s < players; s++) if (answers[s][f] > 0) out.push(s);
    return out;
  };

  let finalists;
  let source;
  if (m >= 2 && rule.goal > 1) {
    finalists = [...matched]; // a Final Cut among the matches only
    source = 'matches';
  } else {
    const seeded = [...matched];
    let pickedLiked;
    if (rule.finalists === 'seats')
      pickedLiked = coverFinalists(liked, k - seeded.length, seeded, likedBySeat, players);
    else pickedLiked = liked.slice(0, k - seeded.length);
    finalists = [...seeded, ...pickedLiked];
    if (finalists.length > 0) finalists = [...finalists, ...unnoped].slice(0, k);
    source = 'swipes';
  }
  if (finalists.length === 0) return { ...base, ending: 'no_pick', at: end.at };

  // Representation, for finales built from swipes: a seat with a like is represented when a
  // finalist is a film it liked or super liked.
  let fairness = null;
  if (source === 'swipes') {
    const likers = [];
    for (let s = 0; s < players; s++) if (answers[s].some((a) => a > 0)) likers.push(s);
    const repped = likers.filter((s) => finalists.some((f) => answers[s][f] > 0));
    const nopedFinalist = (s) => finalists.some((f) => answers[s][f] === -1);
    fairness = {
      likedPerLiker:
        likers.reduce((a, s) => a + finalists.filter((f) => answers[s][f] > 0).length, 0) /
        Math.max(1, likers.length),
      likers: likers.length,
      represented: repped.length,
      allRepresented: repped.length === likers.length,
      human: answers[0].some((a) => a > 0)
        ? finalists.some((f) => answers[0][f] > 0)
          ? 1
          : 0
        : null,
      humanNopedOneAndLeftOut:
        likers.includes(0) && !repped.includes(0) && nopedFinalist(0) ? 1 : 0,
    };
  }

  if (finalists.length === 1) {
    return {
      ...base,
      ending: 'finale',
      at: end.at,
      pickLikedBy: pickLikedBy(finalists[0]),
      fairness,
    };
  }

  // ---------- The vote (one 60-second round; a ranked vote without vetoes from 5 players) ----------
  const n = finalists.length;
  const voteChat = Math.exp(0.3 * vote.normal());
  const orderTime = () =>
    (4 + 3 * n) * Math.exp(0.4 * vote.normal()) * voteChat * (1 + 0.04 * (players - 2));
  const canVeto = players <= 4 && n >= 3;
  const seed = new Map(finalists.map((f, i) => [f, i]));
  const ballots = seats.map((_, s) => {
    const order = finalists
      .map((f) => [util[s][f] + 0.3 * vote.normal(), f])
      .sort((a, b) => b[0] - a[0])
      .map((x) => x[1]);
    const lastFilm = order[order.length - 1];
    const veto = canVeto && !wouldLike(s, lastFilm) ? lastFilm : null;
    return { order, veto, time: orderTime() + (veto !== null ? 2 : 0) };
  });
  const inTime = ballots.filter((b) => b.time <= 60);
  const clock =
    end.at + (inTime.length === players ? Math.max(...inTime.map((b) => b.time)) : 60) + REVEAL;
  let inPlay = [...finalists];
  let winner = null;
  if (canVeto) {
    const vetoes = new Map(inPlay.map((f) => [f, 0]));
    for (const b of inTime) if (b.veto !== null) vetoes.set(b.veto, vetoes.get(b.veto) + 1);
    const clean = inPlay.filter((f) => vetoes.get(f) === 0);
    if (clean.length === 1) winner = clean[0];
    else
      inPlay =
        clean.length >= 2
          ? clean
          : [...inPlay]
              .sort((a, b) => vetoes.get(a) - vetoes.get(b) || seed.get(a) - seed.get(b))
              .slice(0, 2);
  }
  if (winner === null) {
    const points = new Map(inPlay.map((f) => [f, 0]));
    for (const b of inTime) {
      const order = b.order.filter((f) => points.has(f));
      order.forEach((f, i) => points.set(f, points.get(f) + inPlay.length - i));
    }
    winner = [...inPlay].sort(
      (a, b) =>
        points.get(b) - points.get(a) ||
        supers[b] - supers[a] ||
        likes[b] + supers[b] - (likes[a] + supers[a]) ||
        score[b] - score[a] ||
        seed.get(a) - seed.get(b),
    )[0];
  }
  return { ...base, ending: 'finale', at: clock, pickLikedBy: pickLikedBy(winner), fairness };
}

// One seat per player when it can: after the matches, take the liked film that gives a seat to
// the most players who have none yet (ties: today's rank), until everyone with a like has one or
// the seats run out; then today's rank fills the rest.
export function coverFinalists(liked, seatsLeft, seeded, likedBySeat, players) {
  const covered = new Uint8Array(players);
  for (const f of seeded) for (const s of likedBySeat(f)) covered[s] = 1;
  const pool = [...liked]; // already in today's rank order
  const out = [];
  while (out.length < seatsLeft) {
    let best = -1;
    let bestGain = 0;
    for (let i = 0; i < pool.length; i++) {
      const gain = likedBySeat(pool[i]).filter((s) => !covered[s]).length;
      if (gain > bestGain) {
        best = i;
        bestGain = gain;
      }
    }
    if (best < 0) break;
    const [f] = pool.splice(best, 1);
    out.push(f);
    for (const s of likedBySeat(f)) covered[s] = 1;
  }
  return [...out, ...pool].slice(0, seatsLeft);
}

// ---------- Reports ----------

const RULES = {
  today: { goal: 1, finalists: 'today' },
  three: { goal: 3, oneMatch: 'pick', finalists: 'today' },
  threeFill: { goal: 3, oneMatch: 'finale', finalists: 'today' },
  two: { goal: 2, oneMatch: 'pick', finalists: 'today' },
  three90: { goal: 3, oneMatch: 'pick', finalists: 'today', lastCall: { seconds: 90 } },
  three15: { goal: 3, oneMatch: 'pick', finalists: 'today', lastCall: { cards: 15 } },
};
const RULE_LABELS = {
  today: 'Today: the first match ends it',
  three: 'Up to 3 matches',
  threeFill: 'Up to 3, one match goes to a Final Cut',
  two: 'Up to 2 matches',
  three90: 'Up to 3, last call 90 s after the first',
  three15: 'Up to 3, last call 15 cards after the first',
};

const pct = (x) => `${Math.round(100 * x)}%`;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const quantile = (xs, q) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};
const runCell = (rule, players, world, games = GAMES) =>
  Array.from({ length: games }, (_, g) =>
    play(rule, players, world, hash(SEED * 1000003 + players, g)),
  );

function matchesSection() {
  for (const world of ['random50', 'medium', 'low']) {
    console.log(`\n**${WORLD_LABELS[world]}**\n`);
    console.log(
      '| Players | Rule | 3 matches | Ended with 2 | With 1 | With 0 | Median | 90th pct | Within 5 min | Swiping after the first match, median | Players who like the pick |',
    );
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const n of SIZES) {
      for (const name of ['today', 'three', 'three90', 'three15', 'two']) {
        const games = runCell(RULES[name], n, world);
        const share = (pred) => pct(games.filter(pred).length / GAMES);
        const times = games.map((g) => g.at);
        const liked = games.filter((g) => g.pickLikedBy !== undefined);
        const reached3 = name === 'today' || name === 'two' ? '' : share((g) => g.matches >= 3);
        const with2 = name === 'today' ? '' : share((g) => g.matches === 2);
        const after = games
          .filter((g) => g.firstMatchAt !== null)
          .map((g) => g.endAt - g.firstMatchAt);
        const afterCell = name === 'today' || after.length === 0 ? '' : clock(quantile(after, 0.5));
        console.log(
          `| ${n} | ${RULE_LABELS[name]} | ${reached3} | ${with2} | ${share((g) => g.matches === 1)} | ${share((g) => g.matches === 0)} | ${clock(quantile(times, 0.5))} | ${clock(quantile(times, 0.9))} | ${share((g) => g.at <= 300)} | ${afterCell} | ${pct(liked.reduce((a, g) => a + g.pickLikedBy, 0) / liked.length)} |`,
        );
      }
    }
  }
}

function finalistsSection() {
  const cases = [
    // Finales are rare with the staging bots (a match comes first), so those cells play 20 times more games.
    [
      'random50',
      { humanSlow: true },
      20,
      "Random 50%, bots twice as fast as seat 0 (Harry's game)",
    ],
    ['random50', {}, 20, 'Random 50%, everyone at the same pace'],
    ['medium', {}, 1, 'Medium agreement (0.25)'],
    ['low', {}, 1, 'Low agreement (0.1)'],
  ];
  console.log(
    "\nOnly the games that reach a finale with no match (today's rule: the first match ends the game).",
  );
  for (const [world, extra, times, label] of cases) {
    console.log(`\n**${label}**\n`);
    console.log(
      '| Players | Finalists | Finales | Finalists a player liked, average | Players with a like who have a finalist they liked | Games where every such player does | Seat 0 has one | Seat 0 left out but sees a film it noped | Players who like the pick |',
    );
    console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const n of SIZES) {
      for (const finalists of ['today', 'seats']) {
        const all = runCell({ goal: 1, finalists, ...extra }, n, world, GAMES * times);
        const games = all.filter((g) => g.fairness);
        const sum = (fn) => games.reduce((a, g) => a + fn(g), 0);
        const humans = games.filter((g) => g.fairness.human !== null);
        console.log(
          `| ${n} | ${finalists === 'today' ? 'Today' : 'One seat each'} | ${games.length} of ${all.length} | ${(sum((g) => g.fairness.likedPerLiker) / Math.max(1, games.length)).toFixed(1)} | ${pct(
            sum((g) => g.fairness.represented) /
              Math.max(
                1,
                sum((g) => g.fairness.likers),
              ),
          )} | ${pct(sum((g) => (g.fairness.allRepresented ? 1 : 0)) / Math.max(1, games.length))} | ${pct(humans.reduce((a, g) => a + g.fairness.human, 0) / Math.max(1, humans.length))} | ${pct(sum((g) => g.fairness.humanNopedOneAndLeftOut) / Math.max(1, games.length))} | ${pct(sum((g) => g.pickLikedBy) / Math.max(1, games.length))} |`,
        );
      }
    }
  }
}

console.log(
  `Seed ${SEED}, ${GAMES} games per cell. Bot tastes, paces and voting times are made up.`,
);
if (!ONLY || ONLY === 'matches') matchesSection();
if (!ONLY || ONLY === 'finalists') finalistsSection();
