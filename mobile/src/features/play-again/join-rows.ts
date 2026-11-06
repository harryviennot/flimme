import type { JoinRoomAnswer } from '@flimme/contract';

import type { JoinMessage } from '@/features/join/rows';

// One row per answer of `api.join_room` for the Join offer
// (docs/design/screens/winner.md#the-join-offer). A test walks JOIN_ROOM_ANSWERS.

export type OfferRow =
  /** The player is in: leave the old seat, enter the new room. */
  | { kind: 'go' }
  /** Asks for a name first, through the join sheet. */
  | { kind: 'name' }
  /** The game is starting: retry every second. */
  | { kind: 'wait' }
  /** A calm line in the card; the button is Retry or gone. */
  | { kind: 'line'; message: JoinMessage; button: 'retry' | 'hidden' };

export const OFFER_ROWS: Record<JoinRoomAnswer, OfferRow> = {
  ok: { kind: 'go' },
  name_required: { kind: 'name' },
  starting: { kind: 'wait' },
  full: { kind: 'line', message: 'errors.full', button: 'retry' },
  locked: { kind: 'line', message: 'errors.locked', button: 'retry' },
  in_finale: { kind: 'line', message: 'errors.inFinale', button: 'hidden' },
  closed: { kind: 'line', message: 'errors.closed', button: 'hidden' },
  not_found: { kind: 'line', message: 'errors.closed', button: 'hidden' },
  removed: { kind: 'line', message: 'errors.removed', button: 'hidden' },
  rate_limited: { kind: 'line', message: 'errors.rateLimited', button: 'retry' },
};
