import { track, trackWhenRoomKnown, type EventProps } from '@/lib/analytics';

import { joinStatus } from './journey';

// Small helpers so a screen fires its event with one line. Every event still goes through the
// wrapper (`@/lib/analytics`), which applies the modes, the opt-out and the kids' rule.

/**
 * `api.join_room` answered. A seat taken is about a room the phone is entering, so it waits for
 * the room's cap; a refusal is about no room at all and goes at once.
 */
export function trackJoinAttempt(via: EventProps<'join:attempt_finish'>['via'], status: string) {
  const answer = joinStatus(status);
  if (answer === 'ok') trackWhenRoomKnown('join:attempt_finish', { via, status: answer });
  else track('join:attempt_finish', { via, status: answer });
}
