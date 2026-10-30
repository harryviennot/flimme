// One Quick Match game played by bots, under the rules in docs/product/game-modes.md.
// Bot tastes, paces and voting times are made up: see docs/product/simulations.md#the-model.
// Everything is seeded, so the same key always plays the same game.

// ---------- Random numbers ----------

// A 32-bit hash of two integers (murmur3's finalizer), used to seed one stream per game part.
export function hash(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

// mulberry32: small, fast and good enough for a simulation.
function stream(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = next() || 1e-12;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal };
}

// The inverse of the standard normal distribution (Acklam's approximation).
function probit(p) {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269];
  const a2 = [-30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197];
  const b2 = -13.2806815528857;
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373];
  const c2 = [4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const tail = (q) =>
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c2[0]) * q + c2[1]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - 0.02425) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  const top = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a2[0]) * r + a2[1]) * q;
  const bottom = ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b2) * r + 1;
  return top / bottom;
}

// ---------- The rules ----------

// Likes needed for an instant match: everyone up to 4 players, at least 70% from 5
// (game-modes.md#when-its-a-match). Integer arithmetic, so 7 of 10 stays 7.
export const likesNeeded = (players) => (players <= 4 ? players : Math.ceil((7 * players) / 10));

// The finale's format (game-modes.md#the-modes and #the-finalists).
export const finaleFormat = (players) => ({
  finalists: players === 2 ? 3 : 4,
  veto: players <= 4, // Final Cut for 2 to 4; a ranked vote without vetoes for 5 to 10
});

// ---------- The world: what is made up ----------

export const WORLD = {
  pool: 200, // eligible films the deck draws from (the weighted shuffle rarely goes deep)
  agreement: 0.25, // correlation between two players' tastes for a film
  likeRate: 0.15, // chance a player would pick a random eligible film tonight
  speedSpread: 0.3, // spread of players' own speeds (log scale): some read every synopsis
  pause: { share: 0.04, min: 5, max: 20 }, // short pauses per swipe, in seconds
  longPause: { share: 0.15, min: 30, max: 80 }, // one long pause per game for some players
  deckSkill: 0.5, // correlation between the deck's score and what this group shares
  scoreSpread: 0.5, // spread of group scores on the engine's 0 to 5 scale
  temperature: 0.3, // weighted shuffle (deck-engine.md#weighted-shuffle)
  warmup: 10, // shared opening cards (deck-engine.md#how-a-game-unfolds)
  mounted: 3, // a propagated like lands after the 3 mounted cards (data-model.md)
  closeShare: 0.6, // the close phase starts after 60% of the card count
  superLikes: 2,
  afterCount: 'keep', // a player past the card count keeps swiping ('keep') or waits ('wait')
};

// Average seconds per swipe by group size (game-modes.md#time-to-a-pick placeholders).
const swipeMean = (players) => (players === 2 ? 3 : players <= 4 ? 3.5 : 4);

// ---------- One game ----------

// rule, for this group size: { cards, limit (seconds, or null for none), stages, needed? }
//   stages: the finale's rounds, [{ seconds, does: 'both' | 'veto' | 'rank' }]
// Returns what happened, for the report.
export function playGame(rule, players, world, key) {
  const w = { ...WORLD, ...world };
  const taste = stream(hash(key, 1));
  const deck = stream(hash(key, 2));
  const pace = stream(hash(key, 3));
  const vote = stream(hash(key, 4));
  const P = w.pool;

  // Films: a shared appeal for this group, and the deck's imperfect estimate of it.
  const shared = new Float64Array(P);
  const score = new Float64Array(P);
  for (let f = 0; f < P; f++) {
    shared[f] = taste.normal();
    const estimate = w.deckSkill * shared[f] + Math.sqrt(1 - w.deckSkill ** 2) * taste.normal();
    score[f] = 3 + w.scoreSpread * estimate;
  }
  // Players: taste = shared part + own part; a like when taste clears the player's bar.
  const baseBar = probit(1 - w.likeRate);
  const util = [];
  const bar = [];
  for (let s = 0; s < players; s++) {
    const u = new Float64Array(P);
    for (let f = 0; f < P; f++) {
      u[f] = Math.sqrt(w.agreement) * shared[f] + Math.sqrt(1 - w.agreement) * taste.normal();
    }
    util.push(u);
    bar.push(baseBar + 0.25 * taste.normal()); // some players are pickier than others
  }

  // The deck: a shared opening, then a personal weighted shuffle per seat (Gumbel keys).
  // Sorting by score / temperature plus Gumbel noise draws without replacement with odds
  // proportional to e^(score / temperature), as the deck engine's shuffle does.
  const draw = (exclude) => {
    const keys = new Float64Array(P);
    const ids = [];
    for (let f = 0; f < P; f++) {
      keys[f] = score[f] / w.temperature - Math.log(-Math.log(deck.next() || 1e-12));
      if (!exclude.has(f)) ids.push(f);
    }
    return ids.sort((x, y) => keys[y] - keys[x]);
  };
  const opening = draw(new Set()).slice(0, w.warmup);
  const openingSet = new Set(opening);
  const seats = [];
  for (let s = 0; s < players; s++) {
    const order = draw(openingSet);
    const status = new Uint8Array(P); // 0 not dealt, 1 in the upcoming cards, 2 answered
    for (const f of opening) status[f] = 1;
    seats.push({ order, ptr: 0, front: [...opening], status, answered: 0, supers: w.superLikes });
  }

  // Pace: a per-game chattiness, a per-player speed, a per-swipe spread, the odd short pause
  // (reading a synopsis, a remark) and, for some players, one long one (a text, a snack).
  // Each seat has its own stream, so a rule change doesn't change anyone's pace.
  const chat = Math.exp(0.15 * pace.normal());
  const shortPauses = w.pause.share * ((w.pause.min + w.pause.max) / 2);
  const median = ((swipeMean(players) - shortPauses) / Math.exp(0.45 ** 2 / 2)) * chat;
  const paces = Array.from({ length: players }, (_, s) => stream(hash(key, 10 + s)));
  const speed = paces.map((r) => Math.exp(w.speedSpread * r.normal()));
  const long = paces.map((r) =>
    r.next() < w.longPause.share
      ? {
          at: 1 + Math.floor(r.next() * 40),
          seconds: w.longPause.min + (w.longPause.max - w.longPause.min) * r.next(),
        }
      : null,
  );
  const swipeTime = (s) => {
    const r = paces[s];
    let t = median * speed[s] * Math.exp(0.45 * r.normal());
    if (r.next() < w.pause.share) t += w.pause.min + (w.pause.max - w.pause.min) * r.next();
    if (long[s] && long[s].at === seats[s].answered + 1) t += long[s].seconds;
    return t;
  };
  const voteChat = Math.exp(0.3 * vote.normal());

  // Room counters.
  const likes = new Int16Array(P);
  const supers = new Int16Array(P);
  const nopes = new Int16Array(P);
  const needed = rule.needed ?? likesNeeded(players);
  const limit = rule.limit ?? null;
  const closeFrom = Math.round(w.closeShare * rule.cards);

  const fill = (seat, n) => {
    while (seat.front.length < n && seat.ptr < seat.order.length) {
      const f = seat.order[seat.ptr++];
      if (seat.status[f] === 0) {
        seat.status[f] = 1;
        seat.front.push(f);
      }
    }
  };
  // Move a film just behind the mounted cards, unless it's already closer or answered.
  const moveUp = (seat, f) => {
    if (seat.status[f] === 2) return;
    fill(seat, w.mounted);
    const at = seat.front.indexOf(f);
    if (at >= 0 && at < w.mounted) return;
    if (at >= 0) seat.front.splice(at, 1);
    seat.status[f] = 1;
    seat.front.splice(w.mounted, 0, f);
  };

  const next = seats.map((_, s) => swipeTime(s));
  let swipes = 0;
  let liked = 0;
  let end = null;

  let last = 0;
  while (!end) {
    let s = 0;
    for (let i = 1; i < players; i++) if (next[i] < next[s]) s = i;
    const t = next[s];
    if (t === Infinity) {
      end = { how: 'empty', at: last }; // every deck ran dry before the card count
      break;
    }
    if (limit !== null && t >= limit) {
      end = { how: 'time', at: limit };
      break;
    }
    const seat = seats[s];
    fill(seat, 1);
    if (seat.front.length === 0) {
      next[s] = Infinity; // out of cards
      continue;
    }
    last = t;
    const f = seat.front.shift();
    seat.status[f] = 2;
    seat.answered++;
    swipes++;
    const u = util[s][f];
    if (u > bar[s]) {
      liked++;
      const first = likes[f] + supers[f] === 0;
      if (seat.supers > 0 && u > bar[s] + 1.2) {
        seat.supers--;
        supers[f]++;
      } else likes[f]++;
      const total = likes[f] + supers[f];
      if (total >= needed) {
        end = { how: 'match', at: t, film: f };
        break;
      }
      for (let j = 0; j < players; j++) {
        if (j === s) continue;
        // Propagation on the first like; the near-miss push in the close phase.
        if (first || (total === needed - 1 && seats[j].answered >= closeFrom)) moveUp(seats[j], f);
      }
    } else nopes[f]++;

    if (seats.every((x) => x.answered >= rule.cards)) {
      end = { how: 'cards', at: t };
      break;
    }
    next[s] = w.afterCount === 'wait' && seat.answered >= rule.cards ? Infinity : t + swipeTime(s);
  }

  const base = { players, swipes, liked, cardsPerSeat: swipes / players };
  const likedBy = (f) => seats.filter((_, s) => util[s][f] > bar[s]).length;
  if (end.how === 'match') {
    return { ...base, outcome: 'match', at: end.at, pickLikedBy: likedBy(end.film) / players };
  }

  // ---------- The finale (game-modes.md#the-finale) ----------
  const format = finaleFormat(players);
  const k = format.finalists;
  const rank = (f) => likes[f] + 2 * supers[f] - nopes[f];
  const all = Array.from({ length: P }, (_, f) => f);
  let finalists = all
    .filter((f) => likes[f] + supers[f] > 0)
    .sort((a, b) => rank(b) - rank(a) || score[b] - score[a])
    .slice(0, k);
  if (finalists.length < 2) {
    const more = all
      .filter((f) => nopes[f] === 0 && !finalists.includes(f))
      .sort((a, b) => score[b] - score[a]);
    finalists = [...finalists, ...more].slice(0, k);
  }
  const trigger = end.how;
  if (finalists.length === 0) return { ...base, outcome: 'no_pick', at: end.at, trigger };
  if (finalists.length === 1) {
    return {
      ...base,
      outcome: 'finale',
      at: end.at,
      trigger,
      pickLikedBy: likedBy(finalists[0]) / players,
      missed: 0,
    };
  }

  // Seconds a bot takes to order n posters (and long-press a veto): made up.
  const orderTime = (n) =>
    (4 + 3 * n) * Math.exp(0.4 * vote.normal()) * voteChat * (1 + 0.04 * (players - 2));
  const vetoTime = () => 6 * Math.exp(0.4 * vote.normal()) * voteChat;
  // A bot's order: its own taste plus a little noise. It vetoes its last film if it wouldn't like it.
  const ballotOrder = (s, films) =>
    films
      .map((f) => [util[s][f] + 0.3 * vote.normal(), f])
      .sort((a, b) => b[0] - a[0])
      .map((x) => x[1]);
  const seed = new Map(finalists.map((f, i) => [f, i]));
  const tieBreak = (a, b) =>
    supers[b] - supers[a] ||
    likes[b] + supers[b] - (likes[a] + supers[a]) ||
    score[b] - score[a] ||
    seed.get(a) - seed.get(b);

  let clock = end.at;
  let missed = 0;
  let ballots = 0;
  let inPlay = [...finalists];
  let winner = null;

  for (const stage of rule.stages) {
    const doesVeto = format.veto && (stage.does === 'both' || stage.does === 'veto');
    const doesRank = stage.does === 'both' || stage.does === 'rank';
    if (stage.does === 'veto' && !format.veto) continue;
    const entries = seats.map((_, s) => {
      const order = ballotOrder(s, inPlay);
      const last = order[order.length - 1];
      const veto = doesVeto && util[s][last] <= bar[s] ? last : null;
      const time =
        (doesRank ? orderTime(inPlay.length) : 0) +
        (stage.does === 'veto' ? vetoTime() : veto !== null ? 2 : 0);
      return { order: veto === null ? order : order.slice(0, -1), veto, time };
    });
    const inTime = entries.filter((e) => e.time <= stage.seconds);
    missed += players - inTime.length;
    ballots += players;
    clock += inTime.length === players ? Math.max(...inTime.map((e) => e.time)) : stage.seconds;

    if (doesVeto) {
      const vetoes = new Map(inPlay.map((f) => [f, 0]));
      if (stage.does === 'veto') {
        // Today's veto stage: vetoes land in order, and can't remove the last two films.
        for (const e of [...inTime].sort((a, b) => a.time - b.time)) {
          if (e.veto !== null && inPlay.length > 2 && inPlay.includes(e.veto)) {
            inPlay = inPlay.filter((f) => f !== e.veto);
          }
        }
      } else {
        for (const e of inTime) if (e.veto !== null) vetoes.set(e.veto, vetoes.get(e.veto) + 1);
        const clean = inPlay.filter((f) => vetoes.get(f) === 0);
        if (clean.length === 1) {
          winner = clean[0]; // "The only film nobody vetoed"
          break;
        }
        inPlay =
          clean.length >= 2
            ? clean
            : [...inPlay]
                .sort((a, b) => vetoes.get(a) - vetoes.get(b) || seed.get(a) - seed.get(b))
                .slice(0, 2);
      }
    }
    if (doesRank) {
      const points = new Map(inPlay.map((f) => [f, 0]));
      for (const e of inTime) {
        const order = e.order.filter((f) => points.has(f));
        // A ballot that vetoed a film still in play ranks it last (it can't be in the order).
        for (const f of inPlay) if (!order.includes(f)) order.push(f);
        order.forEach((f, i) => points.set(f, points.get(f) + inPlay.length - i));
      }
      if (inTime.length === 0) winner = [...inPlay].sort((a, b) => seed.get(a) - seed.get(b))[0];
      else winner = [...inPlay].sort((a, b) => points.get(b) - points.get(a) || tieBreak(a, b))[0];
    }
  }
  return {
    ...base,
    outcome: 'finale',
    at: clock,
    trigger,
    pickLikedBy: likedBy(winner) / players,
    missed: ballots ? missed / ballots : 0,
  };
}
