#!/usr/bin/env node
// Solo sessions played by one bot, for docs/product/solo-and-my-films.md: how many likes a player
// has after N cards, how long it takes to reach a few likes, and what a daily cap of N swipes means
// in minutes and likes. Bot tastes, the seen rate and paces are made up (in the spirit of
// docs/product/simulations.md#the-model). They test mechanics, not fun.
//   node tools/sim/solo.mjs                 every table (2,000 sessions per cell, a few seconds)
//   node tools/sim/solo.mjs --sessions 500  fewer sessions, noisier
//   node tools/sim/solo.mjs --seed 7        another seed (default 1)
import { hash, probit, stream } from './game.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const SESSIONS = Number(option('sessions', 2000));
const SEED = Number(option('seed', 1));

// ---------- What is made up ----------

const POOL = 1500; // films on the player's services in France: a solo deck can go deep
const CARDS = 200; // the longest session simulated
const LIKE_RATE = 0.15; // of a random eligible film, as in simulations.md
const BAR_SPREAD = 0.25; // pickier and easier players
const SEEN_RATE = 0.12; // cards answered "Seen it"
const SHUFFLE_NOISE = 0.6; // how far the weighted shuffle strays from the deck's order
const PACE = 3.5; // seconds per swipe at the median, alone (no talk, but more reading)
const PACE_SPREAD = 0.45; // per swipe, on a log scale
const PAUSE_SHARE = 0.04; // swipes with a 5 to 20 s pause (reading the back)

// How well the deck's order knows this one player's taste. The launch deck is quality and
// popularity only (0.25: half of the 0.5 the group model uses, since one player's own part of
// taste is invisible to it). A taste-aware deck after M19 is taken as 0.5.
const DECKS = {
  launch: { label: 'Launch deck (quality and popularity)', skill: 0.25 },
  taste: { label: 'Taste-aware deck (after M19)', skill: 0.5 },
};

// ---------- One session ----------

function playSession(deck, key) {
  const r = stream(hash(SEED * 7919 + key, deck.skill * 1000));
  const bar = probit(1 - LIKE_RATE) + BAR_SPREAD * r.normal();
  const films = [];
  for (let i = 0; i < POOL; i++) {
    const taste = r.normal();
    const score = deck.skill * taste + Math.sqrt(1 - deck.skill ** 2) * r.normal();
    films.push({ taste, order: score + SHUFFLE_NOISE * r.normal() });
  }
  films.sort((a, b) => b.order - a.order);
  const cards = [];
  let clock = 0;
  for (let i = 0; i < CARDS; i++) {
    const f = films[i];
    clock += PACE * Math.exp(PACE_SPREAD * r.normal() - PACE_SPREAD ** 2 / 2);
    if (r.next() < PAUSE_SHARE) clock += 5 + 15 * r.next();
    const seen = r.next() < SEEN_RATE;
    cards.push({ liked: !seen && f.taste > bar, seen, at: clock });
  }
  return cards;
}

// ---------- Tables ----------

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const share = (xs, test) => `${Math.round((100 * xs.filter(test).length) / xs.length)}%`;
const time = (s) =>
  s === undefined
    ? 'never'
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

for (const [name, deck] of Object.entries(DECKS)) {
  const sessions = Array.from({ length: SESSIONS }, (_, k) => playSession(deck, k));
  console.log(`\n## ${deck.label} (${name})\n`);

  console.log('### Likes after N cards\n');
  console.log(
    '| Cards | Time (median) | Likes (median) | 10th pct | No like | 3 or more | 5 or more | Like rate on dealt cards |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const n of [10, 20, 30, 50]) {
    const likes = sessions.map((c) => c.slice(0, n).filter((x) => x.liked).length);
    const times = sessions.map((c) => c[n - 1].at);
    const rate = likes.reduce((a, b) => a + b, 0) / (n * SESSIONS);
    console.log(
      `| ${n} | ${time(pct(times, 0.5))} | ${pct(likes, 0.5)} | ${pct(likes, 0.1)} | ${share(likes, (x) => x === 0)} | ${share(likes, (x) => x >= 3)} | ${share(likes, (x) => x >= 5)} | ${Math.round(rate * 100)}% |`,
    );
  }

  console.log('\n### Cards and time to the Nth like\n');
  console.log(
    '| Likes | Cards (median) | Cards (90th pct) | Time (median) | Time (90th pct) | Not reached in 200 cards |',
  );
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const n of [1, 3, 5, 10]) {
    const reach = sessions.map((c) => {
      let k = 0;
      for (let i = 0; i < c.length; i++)
        if (c[i].liked && ++k === n) return { cards: i + 1, at: c[i].at };
      return { cards: Infinity, at: Infinity };
    });
    const cards = reach.map((x) => x.cards);
    const ats = reach.map((x) => x.at);
    const fmt = (v) => (v === Infinity ? 'never' : v);
    const fmtT = (v) => (v === Infinity ? 'never' : time(v));
    console.log(
      `| ${n} | ${fmt(pct(cards, 0.5))} | ${fmt(pct(cards, 0.9))} | ${fmtT(pct(ats, 0.5))} | ${fmtT(pct(ats, 0.9))} | ${share(cards, (x) => x === Infinity)} |`,
    );
  }

  console.log('\n### A daily cap of N swipes, in time and likes\n');
  console.log(
    '| Cap | Time to reach it (median) | 90th pct | Likes by then (median) | 10th pct | 90th pct |',
  );
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const n of [50, 100, 150, 200]) {
    const likes = sessions.map((c) => c.slice(0, n).filter((x) => x.liked).length);
    const times = sessions.map((c) => c[n - 1].at);
    console.log(
      `| ${n} | ${time(pct(times, 0.5))} | ${time(pct(times, 0.9))} | ${pct(likes, 0.5)} | ${pct(likes, 0.1)} | ${pct(likes, 0.9)} |`,
    );
  }
}
console.log(
  `\n${SESSIONS} sessions per deck, seed ${SEED}. One bot with made-up tastes; not a measure of fun.`,
);
