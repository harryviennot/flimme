// The genre simulation's rules (roadmap M6.52, docs/product/simulations.md#per-player-genres):
// the cap, the genres offered, each film's weight, the 3-in-4 share, the starvation guard, and
// that a room where nobody picks plays today's deck. Run with `node --test tools/sim/*.test.mjs`.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DECK,
  GENRES,
  buildDeck,
  filmWeight,
  makeCatalog,
  offeredGenres,
  pickGenres,
  pickShare,
  playRoom,
  slotPattern,
} from './genres.mjs';

const g = (name) => GENRES.findIndex((x) => x.name === name);
const film = (id, names, score = 3) => ({
  id,
  genres: names.map(g),
  shared: 0,
  estimate: 0,
  score,
});

test('a player picks at most the cap, only among the genres offered', () => {
  const taste = GENRES.map((_, i) => i); // a growing taste: the last genres are the strongest
  const offered = [g('Drama'), g('Comedy'), g('Horror'), g('Western'), g('War')];
  for (const cap of [1, 2, 3, 5]) {
    const picks = pickGenres(taste, offered, cap, 1, { pickNoise: 0 });
    assert.equal(picks.length, Math.min(cap, offered.length));
    for (const p of picks) assert.ok(offered.includes(p));
  }
  assert.equal(DECK.cap, 3);
  // With no noise, the strongest offered genres are picked.
  assert.deepEqual(pickGenres(taste, offered, 2, 1, { pickNoise: 0 }), [g('Western'), g('War')]);
});

test('TV Movie and genres with fewer than 30 films tonight are not offered', () => {
  const films = [
    ...Array.from({ length: 30 }, (_, i) => film(i, ['Drama', 'TV Movie'])),
    ...Array.from({ length: 29 }, (_, i) => film(100 + i, ['Western'])),
  ];
  const offered = offeredGenres(films);
  assert.deepEqual(offered, [g('Drama')]);
  assert.deepEqual(offeredGenres(films, 29), [g('Drama'), g('Western')]);
});

test("a film weighs the share of players with picks whose picks it hits; others don't count", () => {
  const comedy = film(1, ['Comedy', 'Romance']);
  const horror = [g('Horror'), g('Thriller')];
  const romcom = [g('Romance'), g('Comedy')];
  assert.equal(filmWeight(comedy, [romcom, romcom, horror, horror]), 0.5);
  assert.equal(filmWeight(comedy, [romcom, romcom, romcom, horror]), 0.75);
  assert.equal(filmWeight(film(2, ['Horror', 'Comedy']), [romcom, horror]), 1);
  // A player with no picks is left out of the share.
  assert.equal(filmWeight(comedy, [romcom, [], [], []]), 1);
  assert.equal(filmWeight(comedy, [horror, [], []]), 0);
  // Nobody picks: every weight is 0.
  assert.equal(filmWeight(comedy, [[], [], []]), 0);
});

test('about 3 cards in 4 come from the pick pool, the first card among them', () => {
  const slots = slotPattern(100, 0.75);
  assert.equal(slots.filter(Boolean).length, 75);
  assert.equal(slots[0], true);
  // The shared opening of 10 follows the same mix.
  assert.equal(slotPattern(10, 0.75).filter(Boolean).length, 8);
  assert.equal(slotPattern(10, 0).filter(Boolean).length, 0);
});

test('a pick pool under 100 films gets a smaller share, in proportion', () => {
  assert.equal(pickShare(100), 0.75);
  assert.equal(pickShare(5000), 0.75);
  assert.equal(pickShare(50), 0.375);
  assert.equal(pickShare(0), 0);
  assert.equal(pickShare(50, { ...DECK, guard: 200 }), 0.1875);
});

test('the deck: one order for the room, 3 in 4 from the picks, no picks means today', () => {
  const films = makeCatalog(1500, 7);
  const none = films.map(() => 0);
  const today = buildDeck(films, none, 'today', 3);
  assert.deepEqual(
    buildDeck(films, none, 'genres', 3).order.map((f) => f.id),
    today.order.map((f) => f.id),
  );

  const horror = [g('Horror'), g('Thriller'), g('Mystery')];
  const weights = films.map((f) => filmWeight(f, [horror]));
  const leaned = buildDeck(films, weights, 'genres', 3);
  const ids = leaned.order.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'no film twice');
  const fromPool = leaned.order.slice(0, 100).filter((f) => weights[f.id] > 0).length;
  // 75 pick slots, plus the open slots that happen to land in the pool.
  assert.ok(fromPool >= 75, `${fromPool} of 100 from the pick pool`);
  const naturally = today.order.slice(0, 100).filter((f) => weights[f.id] > 0).length;
  assert.ok(naturally < fromPool);
  assert.equal(leaned.guard, false);
});

test('a starved pick pool shrinks its share and the guard says so', () => {
  const films = makeCatalog(400, 11);
  // A pool of 40 films (say, narrow picks on a narrow night).
  const weights = films.map((f) => (f.id < 40 ? 1 : 0));
  const deck = buildDeck(films, weights, 'genres', 5);
  assert.equal(deck.guard, true);
  assert.equal(deck.share, 0.75 * 0.4);
  assert.equal(deck.poolSize, 40);
  const fromPool = deck.order.slice(0, 40).filter((f) => weights[f.id] > 0).length;
  assert.ok(fromPool >= 10 && fromPool <= 20, `${fromPool} of 40 from a small pool`);
});

test('a room where nobody picks plays exactly the same game as today', () => {
  for (let key = 1; key <= 8; key++) {
    for (const players of [2, 4, 8]) {
      const a = playRoom({ players, scenario: 'none', variant: 'today' }, key);
      const b = playRoom({ players, scenario: 'none', variant: 'genres' }, key);
      assert.deepEqual(b, a);
    }
  }
});

test('games follow the launch rules: up to 3 matches, one match is the pick, 2 or 3 a vote', () => {
  for (let key = 1; key <= 60; key++) {
    for (const players of [2, 4, 8]) {
      const r = playRoom({ players, scenario: 'split', variant: 'genres' }, key);
      assert.ok(r.matches <= 3);
      if (r.matches === 1) assert.equal(r.ending, 'match');
      if (r.matches >= 2) assert.equal(r.voted, true);
      // The 6-minute limit, then at most a 60-second vote, the 4-second reveal and the
      // 3-second shortlist beats.
      assert.ok(r.at <= 360 + 60 + 4 + 3 * 3, `${r.at} s`);
    }
  }
});

test('the same key plays the same game', () => {
  const opts = { players: 4, scenario: 'mixed', variant: 'genres' };
  assert.deepEqual(playRoom(opts, 42), playRoom(opts, 42));
});
