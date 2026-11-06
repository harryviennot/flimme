import type { PlayAgainAnswer } from '@flimme/contract';

// One row per answer of `api.play_again`, as in docs/design/screens/winner.md#answers-apiplay_again.
// A test walks PLAY_AGAIN_ANSWERS, and the types fail on a new answer without a row.

export type PlayAgainMessage =
  | 'errors.notFinished'
  | 'errors.unknownMode'
  | 'errors.notHost'
  | 'errors.offline'
  | 'errors.network';

export type PlayAgainRow =
  /** The next room is open: the phone goes to its lobby. */
  | { kind: 'go' }
  /** The profile has no name: the name screen, then the host taps again. */
  | { kind: 'name' }
  /** A calm toast; `hide` takes the button away for this room. */
  | { kind: 'toast'; message: PlayAgainMessage; hide: boolean };

export const PLAY_AGAIN_ROWS: Record<PlayAgainAnswer, PlayAgainRow> = {
  ok: { kind: 'go' },
  not_finished: { kind: 'toast', message: 'errors.notFinished', hide: false },
  unknown_mode: { kind: 'toast', message: 'errors.unknownMode', hide: true },
  name_required: { kind: 'name' },
};

/** Raised 42501: no longer the host. The seats are read again and decide whether the button stays. */
export const NOT_HOST_MESSAGE: PlayAgainMessage = 'errors.notHost';
/** Offline: no call, no haptic. */
export const OFFLINE_MESSAGE: PlayAgainMessage = 'errors.offline';
/** The call failed: a retry is safe, a repeat returns the same open room. */
export const NETWORK_MESSAGE: PlayAgainMessage = 'errors.network';
