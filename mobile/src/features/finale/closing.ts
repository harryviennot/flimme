import type { CloseRoundStageResult } from '@flimme/contract';

import { RETRY_MS } from './countdown';

// Closing the round at zero (final-cut.md#the-countdown, Q5.1): the phone calls
// `close_round_stage` 2 seconds after the deadline. `not_yet` and a failed call are tried again
// each second; `ok` and `closed` stop it, and the phone waits for the room to be `done`.
// Several phones calling is harmless.

export type Closer = {
  /** Starts calling after `delayMs`. Calling again restarts the wait. */
  start: (delayMs: number) => void;
  stop: () => void;
};

export function createCloser(
  call: () => Promise<CloseRoundStageResult>,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout,
  cancel: (handle: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
): Closer {
  let handle: unknown;
  let generation = 0;

  function attempt(mine: number) {
    call().then(
      (result) => {
        if (mine !== generation) return;
        if (result.status === 'not_yet') handle = schedule(() => attempt(mine), RETRY_MS);
      },
      () => {
        if (mine !== generation) return;
        handle = schedule(() => attempt(mine), RETRY_MS);
      },
    );
  }

  return {
    start(delayMs) {
      cancel(handle);
      const mine = ++generation;
      handle = schedule(() => attempt(mine), delayMs);
    },
    stop() {
      generation++;
      cancel(handle);
    },
  };
}
