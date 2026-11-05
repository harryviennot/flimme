// What makes a bot feel like a person: a personality drawn at start, a taste it shares with the
// rest of the room (so the group sometimes agrees for real) plus one of its own, and the choices
// it makes at each card and in the Final Cut. Pure and seeded, so a game can be replayed with
// `--seed` and tested without a network.
import type { Card, FinaleKind, VoteAnswer } from '@flimme/contract';

export type Random = () => number;
export type PersonalityMode = 'mixed' | 'agreeable' | 'picky';
export const PERSONALITY_MODES: readonly PersonalityMode[] = ['mixed', 'agreeable', 'picky'];
export type Pace = 'fast' | 'medium' | 'slow';

/** What a card exposes that a taste can score. */
export type Scorable = Pick<Card, 'genre_ids' | 'year' | 'tmdb_score'>;

/** Small seeded generator (mulberry32). */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: Random, low: number, high: number) => low + random() * (high - low);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A stable pseudo-random number in [-1, 1] for a key, so a genre weighs the same every time. */
function hashed(seed: number, key: number): number {
  return seededRandom(Math.imul(seed ^ 0x9e3779b9, 31) + Math.imul(key, 2654435761))() * 2 - 1;
}

/** A taste scores a film from what the card exposes: genres, year and score. */
export type Taste = {
  seed: number;
  /** The year this taste is centred on, and how fast it fades (years). */
  yearCenter: number;
  yearSpread: number;
  /** How much a higher TMDB score matters, from -0.2 to 1. */
  scoreWeight: number;
};

export function makeTaste(seed: number): Taste {
  const random = seededRandom(seed);
  return {
    seed,
    yearCenter: between(random, 1975, 2022),
    yearSpread: between(random, 15, 40),
    scoreWeight: between(random, -0.2, 1),
  };
}

/** How much this taste likes a card, from -1 to 1. Missing data is neutral. */
export function affinity(taste: Taste, card: Scorable): number {
  const genres = card.genre_ids.length
    ? card.genre_ids.reduce((sum, id) => sum + hashed(taste.seed, id), 0) / card.genre_ids.length
    : 0;
  const year =
    card.year === null
      ? 0
      : 1 - 2 * Math.min(1, Math.abs(card.year - taste.yearCenter) / taste.yearSpread);
  const score = card.tmdb_score === null ? 0 : clamp((card.tmdb_score - 6.5) / 2, -1, 1);
  return clamp(0.6 * genres + 0.15 * year + 0.25 * taste.scoreWeight * score, -1, 1);
}

/** The room's hidden taste comes from the seed alone, so every bot of a game shares it. */
export const roomTaste = (seed: number): Taste => makeTaste((seed ^ 0x51ed270b) >>> 0);

export type Personality = {
  /** Base share of cards liked, 0.25 to 0.75. */
  likeRate: number;
  pace: Pace;
  /** Milliseconds per card, before jitter. */
  paceMs: number;
  /** Chance after a swipe of stopping a few seconds, as if talking. */
  pauseChance: number;
  superLikeChance: number;
  seenChance: number;
  undoChance: number;
  /** How much the room's taste weighs against the bot's own (0 to 1). */
  conformity: number;
  /** Chance of using the veto when the round has one. */
  vetoChance: number;
  /** Chance of never locking in. */
  neverLocksChance: number;
  own: Taste;
  room: Taste;
};

const PACES: Record<Pace, [number, number]> = {
  fast: [500, 1000],
  medium: [1200, 2400],
  slow: [2800, 4500],
};

export function makePersonality(seed: number, index: number, mode: PersonalityMode): Personality {
  const random = seededRandom((seed * 31 + index * 7919) >>> 0);
  const likeRate =
    mode === 'agreeable'
      ? between(random, 0.55, 0.75)
      : mode === 'picky'
        ? between(random, 0.25, 0.4)
        : between(random, 0.25, 0.75);
  const roll = random();
  const pace: Pace = roll < 0.3 ? 'fast' : roll < 0.75 ? 'medium' : 'slow';
  return {
    likeRate,
    pace,
    paceMs: between(random, ...PACES[pace]),
    pauseChance: between(random, 0.02, 0.08),
    superLikeChance: between(random, 0.1, 0.25),
    seenChance: between(random, 0.02, 0.06),
    undoChance: between(random, 0.01, 0.04),
    conformity: mode === 'agreeable' ? 0.75 : mode === 'picky' ? 0.4 : 0.6,
    vetoChance: mode === 'picky' ? 0.7 : mode === 'agreeable' ? 0.2 : 0.4,
    neverLocksChance: 0.1,
    own: makeTaste((seed + index * 104729) >>> 0),
    room: roomTaste(seed),
  };
}

/** The bot's feeling about a card: the room's taste blended with its own. */
export function cardAffinity(personality: Personality, card: Scorable): number {
  return (
    personality.conformity * affinity(personality.room, card) +
    (1 - personality.conformity) * affinity(personality.own, card)
  );
}

/**
 * Milliseconds before the next swipe: the bot's pace with jitter, plus the odd pause of a few
 * seconds. `baseMs` (from `--swipe-ms`) replaces the pace; fast and slow bots still swipe faster
 * and slower than it.
 */
export function nextDelay(personality: Personality, random: Random, baseMs?: number): number {
  const scale = { fast: 0.5, medium: 1, slow: 2 }[personality.pace];
  const base = baseMs === undefined ? personality.paceMs : baseMs * scale;
  const pause = random() < personality.pauseChance ? between(random, 3000, 8000) : 0;
  return Math.round(base * between(random, 0.6, 1.4) + pause);
}

export type SwipeState = { superLikesLeft: number; likeRateOverride: number | null };

/**
 * One card's answer. The taste moves the like chance up or down by up to 0.4 around the bot's
 * own rate, so bots whose tastes overlap like the same films now and then. A liked card is
 * sometimes a super like (only while the bot has some of its 2 left); now and then the bot says
 * "Seen it".
 */
export function decideAnswer(
  personality: Personality,
  card: Scorable,
  state: SwipeState,
  random: Random,
): VoteAnswer {
  if (random() < personality.seenChance) return 'seen';
  const base = state.likeRateOverride ?? personality.likeRate;
  const feel = cardAffinity(personality, card);
  if (random() >= clamp(base + 0.8 * feel, 0.02, 0.98)) return 'nope';
  if (state.superLikesLeft > 0 && feel > 0.15 && random() < personality.superLikeChance * 0.3)
    return 'super_like';
  return 'like';
}

export type Ballot = { ranking: number[]; veto?: number };

/** Rank the round's films by taste; maybe veto the one it likes least (never in a ranked vote). */
export function planBallot(
  personality: Personality,
  kind: FinaleKind,
  cards: (Scorable & { title_id: number })[],
  random: Random,
): Ballot {
  const scored = cards
    .map((card) => ({ id: card.title_id, feel: cardAffinity(personality, card) + random() * 0.1 }))
    .sort((a, b) => b.feel - a.feel);
  if (kind === 'final_cut' && scored.length > 2 && random() < personality.vetoChance) {
    const worst = scored[scored.length - 1]!;
    return { ranking: scored.slice(0, -1).map((s) => s.id), veto: worst.id };
  }
  return { ranking: scored.map((s) => s.id) };
}

/**
 * When to lock in, in milliseconds from now, inside the window; null means never. Fast bots lock
 * earlier, slow ones later, and the last 3 seconds are left alone.
 */
export function lockDelay(
  personality: Personality,
  windowMs: number,
  random: Random,
): number | null {
  if (random() < personality.neverLocksChance) return null;
  const usable = Math.max(0, windowMs - 3000);
  const lean = { fast: 0.5, medium: 0.8, slow: 1 }[personality.pace];
  return Math.round(Math.min(usable, 2000 + random() * lean * usable));
}
