import { duration } from '@/theme/motion';

// A card that has just come on top ignores a tap on its bookmark for this long, so a finger still
// coming down from the last throw never saves the next film (the rewatch chip's lesson). The
// screen reader's `save` action is not a tap and skips it.
export const LANDING_GUARD_MS = duration.base;

/** True while a card that landed on top at `landedAt` still ignores taps on its bookmark. */
export function isLanding(landedAt: number, now: number = Date.now()): boolean {
  return now - landedAt < LANDING_GUARD_MS;
}
