import { serverNow } from '@/lib/server-time';

// The Final Cut's clock (final-cut.md#the-countdown), without JSX.

/** The round lasts 60 seconds; a slow phone clock can't promise more. */
export const ROUND_MS = 60_000;
/** The server takes ballots until 2 seconds past the deadline; the phone closes then. */
export const CLOSE_GRACE_MS = 2_000;
/** How long Counting the votes shows before it admits it is still counting. */
export const SLOW_COUNT_MS = 10_000;
/** Closing and sending are tried again this often. */
export const RETRY_MS = 1_000;

/**
 * The deadline to show (ISO): the server's `stage_closes_at`, but never more than 60 seconds
 * after the moment this phone first read the round.
 */
export function shownDeadline(stageClosesAt: string, firstReadAt: number): string {
  const closes = Date.parse(stageClosesAt);
  const cap = serverNow(firstReadAt) + ROUND_MS;
  if (Number.isNaN(closes)) return new Date(cap).toISOString();
  return new Date(Math.min(closes, cap)).toISOString();
}

/** Milliseconds until the close call goes out: the deadline plus the grace, never negative. */
export function closeDelay(deadline: string, now: number = Date.now()): number {
  const end = Date.parse(deadline);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - serverNow(now) + CLOSE_GRACE_MS);
}

/** The seconds to announce to a screen reader: 30 and 10 left, once each. */
export function announceSeconds(ms: number): 30 | 10 | null {
  const seconds = Math.ceil(ms / 1000);
  return seconds === 30 || seconds === 10 ? seconds : null;
}
