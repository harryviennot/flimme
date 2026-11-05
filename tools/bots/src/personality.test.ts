import { describe, expect, it } from 'vitest';

import {
  decideAnswer,
  lockDelay,
  makePersonality,
  nextDelay,
  planBallot,
  seededRandom,
  type Scorable,
} from './personality';

const cards: (Scorable & { title_id: number })[] = Array.from({ length: 300 }, (_, i) => ({
  title_id: i + 1,
  genre_ids: [1 + (i % 7), 10 + (i % 5)],
  year: 1960 + (i % 62),
  tmdb_score: 4.5 + (i % 50) / 12,
}));

function play(seed: number, mode: 'mixed' | 'agreeable' | 'picky', bots = 3) {
  const people = Array.from({ length: bots }, (_, i) => makePersonality(seed, i + 1, mode));
  const random = seededRandom(seed + 99);
  let everyone = 0;
  let likes = 0;
  for (const card of cards) {
    const answers = people.map((p) =>
      decideAnswer(p, card, { superLikesLeft: 2, likeRateOverride: null }, random),
    );
    const liked = answers.filter((a) => a === 'like' || a === 'super_like').length;
    likes += liked;
    if (liked === bots) everyone += 1;
  }
  return { everyone: everyone / cards.length, likes: likes / (cards.length * bots) };
}

describe('personality', () => {
  it('is the same for the same seed and different for another', () => {
    expect(makePersonality(7, 1, 'mixed')).toEqual(makePersonality(7, 1, 'mixed'));
    expect(makePersonality(7, 1, 'mixed')).not.toEqual(makePersonality(7, 2, 'mixed'));
    expect(makePersonality(7, 1, 'mixed')).not.toEqual(makePersonality(8, 1, 'mixed'));
  });

  it('draws a like rate from 0.25 to 0.75 and a known pace', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const p = makePersonality(seed, 1 + (seed % 5), 'mixed');
      expect(p.likeRate).toBeGreaterThanOrEqual(0.25);
      expect(p.likeRate).toBeLessThanOrEqual(0.75);
      expect(['fast', 'medium', 'slow']).toContain(p.pace);
    }
  });

  it('makes agreeable bots like more than picky ones', () => {
    const agreeable = play(11, 'agreeable').likes;
    const picky = play(11, 'picky').likes;
    expect(agreeable).toBeGreaterThan(picky + 0.15);
  });

  it('lets a group of three agree now and then, not every few cards', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { everyone } = play(seed, 'mixed');
      expect(everyone).toBeGreaterThan(0.02);
      expect(everyone).toBeLessThan(0.35);
    }
  });

  it('gives every bot of a game the same room taste', () => {
    const together = makePersonality(21, 1, 'agreeable');
    expect(together.room).toEqual(makePersonality(21, 2, 'agreeable').room);
  });

  it('super likes only while it has some left, and uses a few at most', () => {
    const p = makePersonality(5, 1, 'agreeable');
    const random = seededRandom(1);
    let supers = 0;
    for (const card of cards)
      if (
        decideAnswer(p, card, { superLikesLeft: 0, likeRateOverride: null }, random) ===
        'super_like'
      )
        supers += 1;
    expect(supers).toBe(0);
    let seen = 0;
    let withSupers = 0;
    for (let i = 0; i < 20; i += 1) {
      for (const card of cards) {
        const answer = decideAnswer(p, card, { superLikesLeft: 2, likeRateOverride: null }, random);
        if (answer === 'super_like') withSupers += 1;
        if (answer === 'seen') seen += 1;
      }
    }
    expect(withSupers).toBeGreaterThan(0);
    expect(seen).toBeGreaterThan(0);
  });

  it('follows --like-rate when given', () => {
    const p = makePersonality(5, 1, 'mixed');
    const random = seededRandom(3);
    const nopes = cards.filter(
      (c) => decideAnswer(p, c, { superLikesLeft: 0, likeRateOverride: 0 }, random) === 'like',
    ).length;
    expect(nopes / cards.length).toBeLessThan(0.15);
  });

  it('paces fast bots under slow bots and sometimes pauses for seconds', () => {
    const fast = {
      ...makePersonality(1, 1, 'mixed'),
      pace: 'fast' as const,
      paceMs: 700,
      pauseChance: 0,
    };
    const slow = { ...fast, pace: 'slow' as const, paceMs: 3500 };
    const random = seededRandom(2);
    expect(nextDelay(fast, random)).toBeLessThan(nextDelay(slow, random));
    expect(nextDelay(fast, random, 1500)).toBeLessThan(nextDelay(slow, random, 1500));
    const talker = { ...fast, pauseChance: 1 };
    expect(nextDelay(talker, random)).toBeGreaterThan(3000);
  });
});

describe('the Final Cut', () => {
  const round = cards.slice(0, 5);

  it('ranks every film once, and a veto leaves the vetoed film out', () => {
    const p = { ...makePersonality(3, 1, 'picky'), vetoChance: 1 };
    const ballot = planBallot(p, 'final_cut', round, seededRandom(4));
    expect(ballot.veto).toBeDefined();
    expect(ballot.ranking).toHaveLength(4);
    expect(ballot.ranking).not.toContain(ballot.veto);
    expect([...ballot.ranking, ballot.veto!].sort()).toEqual(round.map((c) => c.title_id).sort());
  });

  it('never vetoes in a ranked vote', () => {
    const p = { ...makePersonality(3, 1, 'picky'), vetoChance: 1 };
    const ballot = planBallot(p, 'ranked_vote', round, seededRandom(4));
    expect(ballot.veto).toBeUndefined();
    expect([...ballot.ranking].sort()).toEqual(round.map((c) => c.title_id).sort());
  });

  it('ranks by taste: the same bot ranks the same way', () => {
    const p = { ...makePersonality(9, 2, 'mixed'), vetoChance: 0 };
    const a = planBallot(p, 'ranked_vote', round, seededRandom(1));
    const b = planBallot(p, 'ranked_vote', round, seededRandom(1));
    expect(a).toEqual(b);
  });

  it('locks in inside the 60 seconds, some late and some never', () => {
    const delays: (number | null)[] = [];
    for (let seed = 1; seed <= 200; seed += 1)
      delays.push(lockDelay(makePersonality(seed, 1, 'mixed'), 60_000, seededRandom(seed)));
    const real = delays.filter((d): d is number => d !== null);
    expect(delays.some((d) => d === null)).toBe(true);
    expect(real.every((d) => d >= 2000 && d <= 57_000)).toBe(true);
    expect(real.some((d) => d > 40_000)).toBe(true);
    expect(real.some((d) => d < 15_000)).toBe(true);
  });

  it('does not lock in when the window is already almost over', () => {
    const d = lockDelay(
      { ...makePersonality(1, 1, 'mixed'), neverLocksChance: 0 },
      1000,
      seededRandom(1),
    );
    expect(d).toBeLessThanOrEqual(2000);
  });
});
