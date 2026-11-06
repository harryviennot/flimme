import type { MyFilmEditResult } from '@flimme/contract';
import { ApiError } from '@flimme/contract';

import type { PendingSave, PendingSavesState } from './pending';

/** After 1, 2, 4, 8 and 16 seconds, then every 30 (as the vote queue). */
export const SAVE_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export type SaveSettlerDeps = {
  store: { getState: () => PendingSavesState };
  setFilmSaved: (args: { title_id: number; saved: boolean }) => Promise<MyFilmEditResult>;
  /** Gets a fresh session; throws if it can't. */
  refreshSession: () => Promise<unknown>;
};

/**
 * Sends the waiting saves one at a time. `ok` and `not_found` settle a save (`not_found` on an
 * unsave means it was not saved). A lost network or a rate limit keeps it and waits; a refusal
 * after a fresh session, or any other error, drops it so it never blocks the ones behind it.
 */
export function createSaveSettler(deps: SaveSettlerDeps) {
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  async function attempt(item: PendingSave): Promise<'next' | 'retry'> {
    let refreshed = false;
    for (;;) {
      try {
        const answer = await deps.setFilmSaved(item);
        if (answer.status === 'rate_limited') return 'retry';
        deps.store.getState().settle(item);
        return 'next';
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'denied') {
          if (!refreshed) {
            refreshed = true;
            try {
              await deps.refreshSession();
            } catch {
              return 'retry';
            }
            continue;
          }
          // Dropped: a save is a wish, not a vote. The bookmark may stay filled for this session.
          deps.store.getState().settle(item);
          return 'next';
        }
        if (error instanceof ApiError && error.kind === 'unexpected') {
          deps.store.getState().settle(item);
          return 'next';
        }
        return 'retry';
      }
    }
  }

  async function loop() {
    for (;;) {
      const head = deps.store.getState().items[0];
      if (!head) {
        failures = 0;
        return;
      }
      if ((await attempt(head)) === 'retry') {
        const delay = SAVE_RETRY_DELAYS_MS[Math.min(failures, SAVE_RETRY_DELAYS_MS.length - 1)]!;
        failures += 1;
        timer = setTimeout(() => {
          timer = undefined;
          void run();
        }, delay);
        return;
      }
      failures = 0;
    }
  }

  function run(): Promise<void> {
    running ??= loop().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    /** Starts a pass unless one runs or a retry is waiting (the network is down: don't hammer it). */
    run(): Promise<void> {
      return timer === undefined ? run() : Promise.resolve();
    },
    /** On start, on reconnect, on foreground: tries at once and starts the delays again. */
    flush(): Promise<void> {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      failures = 0;
      return run();
    },
    /** Forgets the retry (the wipe). */
    clear(): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      failures = 0;
    },
  };
}
