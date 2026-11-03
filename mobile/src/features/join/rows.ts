import type { JoinRoomAnswer } from '@flimme/contract';

// One row per answer of `api.join_room`, as in docs/design/screens/join-code.md#answers-apijoin_room.
// A test walks JOIN_ROOM_ANSWERS, and the types fail on a new
// answer without a row.

export type JoinMessage =
  | 'errors.notFound'
  | 'errors.rateLimited'
  | 'errors.full'
  | 'errors.starting'
  | 'errors.inFinale'
  | 'errors.closed'
  | 'errors.removed'
  | 'errors.locked'
  | 'errors.offline'
  | 'errors.network';

export type JoinRow =
  /** The player is in (or must name themselves first): the screen leaves. */
  | { kind: 'go'; to: 'room' | 'name' }
  /** The answer stays on the screen as a message. */
  | {
      kind: 'message';
      message: JoinMessage;
      /** What the boxes do: stay filled, shake then clear, or clear at once. */
      boxes: 'stay' | 'shake' | 'clear';
      /** The button under the message. */
      next: 'host' | 'retry' | null;
    }
  /** The game is starting: try again every second. */
  | { kind: 'wait' };

export const JOIN_ROWS: Record<JoinRoomAnswer, JoinRow> = {
  ok: { kind: 'go', to: 'room' },
  name_required: { kind: 'go', to: 'name' },
  not_found: { kind: 'message', message: 'errors.notFound', boxes: 'shake', next: null },
  rate_limited: { kind: 'message', message: 'errors.rateLimited', boxes: 'clear', next: null },
  full: { kind: 'message', message: 'errors.full', boxes: 'stay', next: 'host' },
  starting: { kind: 'wait' },
  in_finale: { kind: 'message', message: 'errors.inFinale', boxes: 'stay', next: 'host' },
  closed: { kind: 'message', message: 'errors.closed', boxes: 'clear', next: 'host' },
  removed: { kind: 'message', message: 'errors.removed', boxes: 'clear', next: 'host' },
  locked: { kind: 'message', message: 'errors.locked', boxes: 'stay', next: 'host' },
};

/** Offline before the call: the message, then it joins by itself when the connection is back. */
export const OFFLINE_ROW = { message: 'errors.offline', next: null } as const;
/** The call failed (any `ApiError`). */
export const NETWORK_ROW = { message: 'errors.network', next: 'retry' } as const;
/** Shown after `starting` kept coming back for 10 seconds. */
export const STARTING_GAVE_UP = { message: 'errors.starting', next: 'retry' } as const;

export const STARTING_RETRY_MS = 1000;
export const STARTING_RETRIES = 10;
