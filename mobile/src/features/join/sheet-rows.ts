import type { JoinRoomAnswer, PLANNED_JOIN_ROOM_ANSWERS } from '@flimme/contract';

import type { IconName } from '@/components/ui/icon';

import type { JoinMessage } from './rows';

// One row per answer the join sheet can get, as in docs/design/screens/join-sheet.md#answers-apijoin_room.
// A test walks JOIN_ROOM_ANSWERS and PLANNED_JOIN_ROOM_ANSWERS, and the types fail on a new
// answer without a row.

export type SheetRow =
  /** The player is in, or must name themselves first. */
  | { kind: 'go'; to: 'room' | 'first-time' }
  /** The game is starting: the joining layout, trying again every second. */
  | { kind: 'wait' }
  /** The sheet shows a message and its buttons. */
  | {
      kind: 'refused';
      message: JoinMessage;
      icon: IconName;
      /** `haptics.error()` once, when the refusal appears. */
      haptic: boolean;
      /** The error look (red icon): not for being offline. */
      error: boolean;
      /** The button under the message. `auto`: none, it joins by itself when back online. */
      next: 'host' | 'retry' | 'auto';
    };

type PlannedAnswer = (typeof PLANNED_JOIN_ROOM_ANSWERS)[number];
/** What the sheet answers that is not an answer of `join_room`. */
export type SheetState = 'malformed' | 'offline' | 'failed' | 'session_failed';

const refused = (
  message: JoinMessage,
  icon: IconName,
  next: 'host' | 'retry' | 'auto' = 'host',
  haptic = true,
): SheetRow => ({ kind: 'refused', message, icon, haptic, error: next !== 'auto', next });

export const JOIN_SHEET_ROWS: Record<JoinRoomAnswer | PlannedAnswer | SheetState, SheetRow> = {
  ok: { kind: 'go', to: 'room' },
  name_required: { kind: 'go', to: 'first-time' },
  starting: { kind: 'wait' },
  // For a link, a missing room has ended.
  not_found: refused('errors.closed', 'ticket'),
  closed: refused('errors.closed', 'ticket'),
  full: refused('errors.full', 'users'),
  in_finale: refused('errors.inFinale', 'clock'),
  removed: refused('errors.removed', 'ban'),
  locked: refused('errors.locked', 'lock'),
  rate_limited: refused('errors.rateLimited', 'clock'),
  offline: refused('errors.offline', 'wifi-off', 'auto', false),
  failed: refused('errors.network', 'alert', 'retry'),
  malformed: refused('errors.closed', 'ticket', 'host', false),
  session_failed: refused('errors.network', 'alert', 'retry'),
};
