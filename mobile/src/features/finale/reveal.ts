import { tokens } from '@/theme/generated/tokens';
import { duration } from '@/theme/motion';

// The Final Cut's reveal without JSX (final-cut.md#the-reveal, moments.md#the-reveal): what the
// result says, which steps play and when, the points and the line. Never a ballot, never a seat.

/** A network limit on the reads of a missed reveal, not a motion token. */
export const REVEAL_READ_LIMIT_MS = 3000;

export type RevealReason = 'points' | 'only_unvetoed' | 'no_ballots';

export type RevealFinalist = {
  titleId: number;
  seed: number;
  points: number;
  /** Knocked out. Never by whom. */
  vetoed: boolean;
};

export type RevealData = {
  winnerId: number;
  /** Null when the event carried none we know. */
  reason: RevealReason | null;
  /** In seed order. */
  finalists: RevealFinalist[];
};

export type RevealStage = 'clear' | 'knockouts' | 'points' | 'winner';

const STAGE_ORDER: RevealStage[] = ['clear', 'knockouts', 'points', 'winner'];

/** Whether `stage` is `at` or later in the sequence. */
export const reached = (stage: RevealStage, at: RevealStage) =>
  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(at);

const REASONS: readonly string[] = ['points', 'only_unvetoed', 'no_ballots'];

const bySeed = (a: RevealFinalist, b: RevealFinalist) => a.seed - b.seed;

/** The finale's `match` event, or null when it isn't a Final Cut result with finalists. */
export function readRevealEvent(payload: unknown): RevealData | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || p.kind !== 'finale' || p.decided !== true || typeof p.title_id !== 'number') {
    return null;
  }
  if (p.reason === 'only_film' || !Array.isArray(p.finalists) || p.finalists.length === 0) {
    return null;
  }
  const finalists: RevealFinalist[] = [];
  for (const raw of p.finalists as unknown[]) {
    const row = raw as Record<string, unknown> | null;
    if (!row || typeof row.title_id !== 'number' || typeof row.seed !== 'number') return null;
    finalists.push({
      titleId: row.title_id,
      seed: row.seed,
      points: typeof row.points === 'number' ? row.points : 0,
      vetoed: row.vetoed === true,
    });
  }
  return {
    winnerId: p.title_id,
    reason:
      typeof p.reason === 'string' && REASONS.includes(p.reason)
        ? (p.reason as RevealReason)
        : null,
    finalists: finalists.sort(bySeed),
  };
}

/** A missed reveal: the closed round and its candidates. The views carry no reason: work it out. */
export function revealFromViews(
  round: { winner_title_id: number | null },
  candidates: readonly {
    title_id: number;
    seed: number;
    points: number;
    vetoed: boolean | null;
  }[],
): RevealData | null {
  if (round.winner_title_id === null || candidates.length === 0) return null;
  const finalists = candidates
    .map((c) => ({
      titleId: c.title_id,
      seed: c.seed,
      points: c.points,
      vetoed: c.vetoed === true,
    }))
    .sort(bySeed);
  const stillIn = finalists.filter((x) => !x.vetoed);
  const anyOut = stillIn.length < finalists.length;
  const reason: RevealReason =
    stillIn.length === 1 && anyOut
      ? 'only_unvetoed'
      : !anyOut && finalists.every((x) => x.points === 0)
        ? 'no_ballots'
        : 'points';
  return { winnerId: round.winner_title_id, reason, finalists };
}

/**
 * How many ballots were counted, without a read: with n films still in, every ballot gives them
 * n, n - 1, down to 1 points, so the total over n (n + 1) / 2 is the number of ballots.
 */
export function ballotCount(finalists: readonly RevealFinalist[]): number {
  const stillIn = finalists.filter((x) => !x.vetoed);
  const n = stillIn.length;
  if (n === 0) return 0;
  const total = stillIn.reduce((sum, x) => sum + x.points, 0);
  return Math.round(total / ((n * (n + 1)) / 2));
}

/** Points show for reason `points` (or none known), with 2 films or more still in and 3 ballots or more. */
export function pointsShow(data: RevealData): boolean {
  return (
    (data.reason === 'points' || data.reason === null) &&
    data.finalists.filter((x) => !x.vetoed).length >= 2 &&
    ballotCount(data.finalists) >= 3
  );
}

export type LineKey = 'points' | 'tie' | 'onlyUnvetoed' | 'noBallots';

/** The line under the winner's heading, or null for none. */
export function lineKey(data: RevealData): LineKey | null {
  if (data.reason === 'only_unvetoed') return 'onlyUnvetoed';
  if (data.reason === 'no_ballots') return 'noBallots';
  const shows = pointsShow(data);
  if (shows) {
    const top = data.finalists
      .filter((x) => !x.vetoed)
      .map((x) => x.points)
      .sort((a, b) => b - a);
    return top[0] === top[1] ? 'tie' : 'points';
  }
  return data.reason === 'points' ? 'points' : null;
}

export type RevealPlan = {
  /** When each step starts, in ms from time 0. Null for a step with nothing to show. */
  knockouts: number | null;
  points: number | null;
  winner: number;
  handOver: number;
};

/** The steps and their times (final-cut.md#the-sequence). A step with nothing to show moves up. */
export function revealPlan(data: RevealData): RevealPlan {
  let t: number = duration['reveal-lead'];
  let knockouts: number | null = null;
  let points: number | null = null;
  if (data.finalists.some((x) => x.vetoed)) {
    knockouts = t;
    t += duration['reveal-vetoes'];
  }
  if (pointsShow(data)) {
    points = t;
    t += duration['reveal-points'];
  }
  return { knockouts, points, winner: t, handOver: t + duration['reveal-hold'] };
}

/** The knocked-out films' ids, in seed order. */
export const knockedOut = (data: RevealData): number[] =>
  data.finalists.filter((x) => x.vetoed).map((x) => x.titleId);

/**
 * The number shown while the points count up: progress 0 to 1 through `easing.standard`,
 * landing on the total and never above it.
 */
export function countUpValue(progress: number, total: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return total;
  return Math.min(total, Math.floor(standardEase(progress) * total));
}

/** `easing.standard` as plain JS (the count runs on the JS thread, where worklet easings may not). */
function standardEase(x: number): number {
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = tokens.easing.standard;
  const at = (a: number, b: number, t: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

/** How often the count-up steps. */
export const COUNT_STEP_MS = duration.instant;
/** How long the count-up lasts. */
export const COUNT_MS = duration.celebrate;
