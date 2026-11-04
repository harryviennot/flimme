import type { LockInState } from './lock-in';

// What the footer shows (final-cut.md#locking-in, #states), decided without JSX.

export type Phase = 'loading' | 'voting' | 'sending' | 'locked' | 'counting';

export function phaseOf(input: {
  /** The finalists are known (the cards may still be on their way). */
  ready: boolean;
  lockIn: LockInState['kind'];
  /** The server says this seat locked in (a restart mid-round). */
  meLocked: boolean;
  /** The countdown reached zero. */
  ended: boolean;
  everyoneLocked: boolean;
  /** The round closed between the room read and the round read. */
  noOpenRound: boolean;
}): Phase {
  if (input.ended || input.everyoneLocked || input.noOpenRound || input.lockIn === 'closed') {
    return 'counting';
  }
  if (input.lockIn === 'locked' || input.meLocked) return 'locked';
  if (input.lockIn === 'sending') return 'sending';
  return input.ready ? 'voting' : 'loading';
}

/** Taps and long presses work only while voting. */
export const takesTaps = (phase: Phase) => phase === 'voting';

/** The countdown ticks only for a phone that has not locked in. */
export const ticks = (phase: Phase) => phase === 'voting';

/** The status line under the button, as a `finale` key, or null for an empty line. */
export function statusKey(input: {
  phase: Phase;
  online: boolean;
  sendFailed: boolean;
  liftVetoHint: boolean;
  countingSlow: boolean;
}): 'hint.sending' | 'hint.offline' | 'hint.liftVeto' | 'error.send' | 'counting.slow' | null {
  switch (input.phase) {
    case 'sending':
      return input.online ? 'hint.sending' : 'hint.offline';
    case 'counting':
      return input.countingSlow ? 'counting.slow' : null;
    case 'voting':
      if (input.sendFailed) return 'error.send';
      return input.liftVetoHint ? 'hint.liftVeto' : null;
    default:
      return null;
  }
}
