#!/usr/bin/env node
// Plays Quick Match bot games under several rule sets and prints the tables in
// docs/product/simulations.md. Bot tastes are made up: read that doc before quoting a number.
//   node tools/sim/run.mjs                  every table (2,000 games per cell, about 5 minutes)
//   node tools/sim/run.mjs --games 300      fewer games per cell, faster and noisier
//   node tools/sim/run.mjs --seed 7         another seed (the default is 1)
//   node tools/sim/run.mjs --only finale    one section: headline, cards, limits, finale,
//                                           majority, suggested, sensitivity
import { hash, playGame } from './game.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const GAMES = Number(option('games', 2000));
const SEED = Number(option('seed', 1));
const ONLY = option('only', null);
const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];

// ---------- Rule sets ----------

const oneRound = (seconds) => [{ seconds, does: 'both' }];
const proposedLimit = (n) => (n >= 5 ? 420 : 360);

// Each rule set returns the rule for a group size: cards, time limit (s) and the finale.
const RULES = {
  today: (n) => ({
    // The seeded match_rules in schema.sql, with the data model's two-stage finale.
    cards: n === 2 ? 40 : 50,
    limit: n === 2 ? null : n <= 4 ? 480 : 600,
    stages: [
      { seconds: 45, does: 'veto' },
      { seconds: 60, does: 'rank' },
    ],
  }),
  proposed: (n) => ({ cards: 40, limit: proposedLimit(n), stages: oneRound(45) }),
  cards30: (n) => ({ cards: 30, limit: proposedLimit(n), stages: oneRound(45) }),
  cards50: (n) => ({ cards: 50, limit: proposedLimit(n), stages: oneRound(45) }),
  limit5: () => ({ cards: 40, limit: 300, stages: oneRound(45) }),
  limit6: () => ({ cards: 40, limit: 360, stages: oneRound(45) }),
  limit7: () => ({ cards: 40, limit: 420, stages: oneRound(45) }),
  finale30: (n) => ({ cards: 40, limit: proposedLimit(n), stages: oneRound(30) }),
  finale60: (n) => ({ cards: 40, limit: proposedLimit(n), stages: oneRound(60) }),
  // Not part of M0.7: two thirds instead of 70% for 5 to 10 players (4 of 6, 6 of 9).
  twoThirds: (n) => ({
    cards: 40,
    limit: proposedLimit(n),
    stages: oneRound(45),
    needed: n <= 4 ? n : Math.ceil((2 * n) / 3),
  }),
  // The set simulations.md suggests: 30 cards from 5 players, one 6-minute limit, 60 s.
  suggested: (n) => ({ cards: n <= 4 ? 40 : 30, limit: 360, stages: oneRound(60) }),
};
const LABELS = {
  today: 'Today (schema.sql)',
  proposed: '**Proposed**: 40 cards, 6 or 7 min, 45 s',
  cards30: '30 cards',
  cards50: '50 cards',
  limit5: '5 min for every size',
  limit6: '6 min for every size',
  limit7: '7 min for every size',
  finale30: 'Finale of 30 s',
  finale60: 'Finale of 60 s',
  twoThirds: 'Two thirds',
  suggested: 'Suggested: 40 or 30 cards, 6 min, 60 s',
};

const AGREEMENT = { low: 0.1, medium: 0.25, high: 0.4 };

// ---------- Playing and summing up ----------

const cache = new Map();
function cell(ruleName, n, world) {
  const id = `${ruleName}|${n}|${JSON.stringify(world)}`;
  if (cache.has(id)) return cache.get(id);
  const rule = RULES[ruleName](n);
  const games = [];
  // The game key ignores the rule, so every rule set plays the same groups and decks.
  for (let g = 0; g < GAMES; g++) games.push(playGame(rule, n, world, hash(hash(SEED, n), g)));
  const picks = games.filter((r) => r.outcome !== 'no_pick');
  const finales = games.filter((r) => r.outcome === 'finale');
  const times = picks.map((r) => r.at).sort((a, b) => a - b);
  const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
  const share = (list, test) => (list.length ? list.filter(test).length / list.length : NaN);
  const mean = (list, get) =>
    list.length ? list.reduce((a, r) => a + get(r), 0) / list.length : NaN;
  const out = {
    match: share(games, (r) => r.outcome === 'match'),
    finale: share(games, (r) => r.outcome === 'finale'),
    noPick: share(games, (r) => r.outcome === 'no_pick'),
    median: at(0.5),
    p90: at(0.9),
    within5: share(games, (r) => r.outcome !== 'no_pick' && r.at <= 300),
    byTime: share(games, (r) => r.trigger === 'time'),
    likedBy: mean(picks, (r) => r.pickLikedBy),
    finaleLikedBy: mean(finales, (r) => r.pickLikedBy),
    missed: mean(finales, (r) => r.missed),
    likeRate: games.reduce((a, r) => a + r.liked, 0) / games.reduce((a, r) => a + r.swipes, 0),
  };
  cache.set(id, out);
  return out;
}

// ---------- Printing ----------

const pct = (x) => (Number.isNaN(x) ? 'n/a' : `${Math.round(100 * x)}%`);
const clock = (s) => {
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const times = (c) => `${clock(c.median)} / ${clock(c.p90)}`;
const row = (cells) => `| ${cells.join(' | ')} |`;
const table = (head, rows) =>
  [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n') + '\n';

// One table: a row per [label, rule set, what to show], a column per group size.
function grid(title, level, rows, sizes = SIZES, world = {}) {
  const w = { agreement: AGREEMENT[level], ...world };
  console.log(`#### ${title}, ${level} agreement\n`);
  console.log(
    table(
      ['', ...sizes.map((n) => `${n}`)],
      rows.map(([label, name, show]) => [label, ...sizes.map((n) => show(cell(name, n, w)))]),
    ),
  );
}
const each = (names, show) => names.map((name) => [LABELS[name], name, show]);

function headline(level) {
  const world = { agreement: AGREEMENT[level] };
  console.log(`#### Proposed values, ${level} agreement (${AGREEMENT[level]})\n`);
  const head = ['Players', 'Match', 'Final Cut decides', 'No pick', 'Median', '90th pct'];
  head.push('Within 5 min', 'Time limit hit', 'Players who like the pick', 'Like rate');
  console.log(
    table(
      head,
      SIZES.map((n) => {
        const c = cell('proposed', n, world);
        return [
          n,
          pct(c.match),
          pct(c.finale),
          pct(c.noPick),
          clock(c.median),
          clock(c.p90),
        ].concat([pct(c.within5), pct(c.byTime), pct(c.likedBy), pct(c.likeRate)]);
      }),
    ),
  );
}

const LEVELS = ['low', 'medium'];
const sections = {
  headline: () => Object.keys(AGREEMENT).forEach(headline),
  cards: () => {
    const names = ['today', 'proposed', 'cards30', 'cards50'];
    for (const level of LEVELS) {
      grid('Time to a pick (median / 90th percentile)', level, each(names, times));
      grid(
        'Pick within 5 minutes',
        level,
        each(names, (c) => pct(c.within5)),
      );
      grid(
        'Final Cut decides',
        level,
        each(names, (c) => pct(c.finale)),
      );
      grid(
        'Players who like the pick',
        level,
        each(names, (c) => pct(c.likedBy)),
      );
    }
  },
  limits: () => {
    const names = ['today', 'proposed', 'limit5', 'limit6', 'limit7'];
    for (const level of LEVELS) {
      grid(
        'Time limit hit / 90th percentile',
        level,
        each(names, (c) => `${pct(c.byTime)} / ${clock(c.p90)}`),
      );
    }
  },
  finale: () => {
    const names = ['today', 'finale30', 'proposed', 'finale60'];
    for (const level of LEVELS) {
      grid(
        'Ballots not locked in when the vote closes',
        level,
        each(names, (c) => pct(c.missed)),
      );
      grid('Time to a pick (median / 90th percentile)', level, each(names, times));
    }
    grid(
      'Players who like the pick, games the finale decided',
      'medium',
      each(names, (c) => pct(c.finaleLikedBy)),
    );
  },
  majority: () => {
    const sizes = [5, 6, 7, 8, 9, 10];
    for (const level of LEVELS) {
      grid(
        '70% against two thirds',
        level,
        [
          ['Final Cut decides, 70%', 'proposed', (c) => pct(c.finale)],
          ['Final Cut decides, two thirds', 'twoThirds', (c) => pct(c.finale)],
          ['Median / 90th pct, 70%', 'proposed', times],
          ['Median / 90th pct, two thirds', 'twoThirds', times],
          ['Players who like the pick, 70%', 'proposed', (c) => pct(c.likedBy)],
          ['Players who like the pick, two thirds', 'twoThirds', (c) => pct(c.likedBy)],
        ],
        sizes,
      );
    }
  },
  suggested: () => {
    for (const level of LEVELS) {
      grid('Proposed against suggested', level, [
        ['Median / 90th pct, proposed', 'proposed', times],
        ['Median / 90th pct, suggested', 'suggested', times],
        ['Within 5 min, proposed', 'proposed', (c) => pct(c.within5)],
        ['Within 5 min, suggested', 'suggested', (c) => pct(c.within5)],
        ['Final Cut decides, proposed', 'proposed', (c) => pct(c.finale)],
        ['Final Cut decides, suggested', 'suggested', (c) => pct(c.finale)],
        ['Players who like the pick, proposed', 'proposed', (c) => pct(c.likedBy)],
        ['Players who like the pick, suggested', 'suggested', (c) => pct(c.likedBy)],
      ]);
    }
  },
  sensitivity: () => {
    const worlds = {
      'Medium agreement (the reference)': {},
      'Like rate 10% instead of 15%': { likeRate: 0.1 },
      'Like rate 20% instead of 15%': { likeRate: 0.2 },
      'Deck knows the group less (0.25)': { deckSkill: 0.25 },
      'Deck knows the group better (0.75)': { deckSkill: 0.75 },
      'Players past the card count wait': { afterCount: 'wait' },
      'Slower players (pace spread 0.5)': { speedSpread: 0.5 },
    };
    const sizes = [2, 3, 4, 6, 8, 10];
    console.log('#### Proposed values when the made-up numbers move, medium agreement\n');
    console.log('Each cell: Final Cut decides, then median / 90th percentile.\n');
    console.log(
      table(
        ['Assumption', ...sizes.map((n) => `${n}`)],
        Object.entries(worlds).map(([label, extra]) => [
          label,
          ...sizes.map((n) => {
            const c = cell('proposed', n, { agreement: AGREEMENT.medium, ...extra });
            return `${pct(c.finale)}, ${times(c)}`;
          }),
        ]),
      ),
    );
  },
};

if (ONLY && !sections[ONLY]) {
  console.error(`No section ${ONLY}. Try: ${Object.keys(sections).join(', ')}`);
  process.exit(1);
}
console.log(`<!-- node tools/sim/run.mjs --games ${GAMES} --seed ${SEED} -->\n`);
for (const [name, print] of Object.entries(sections)) if (!ONLY || ONLY === name) print();
