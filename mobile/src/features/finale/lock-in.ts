import type { CastBallotResult } from '@flimme/contract';

import { RETRY_MS } from './countdown';

/** What is sent: frozen at the tap. */
export type SentBallot = { ranking: number[]; veto?: number };

// Locking in (final-cut.md#locking-in), without JSX. One tap sends one ballot, frozen at the
// tap. `ok` and `already_voted` lock the screen; `closed` is "Counting the votes"; `not_in_room`
// sends the phone Home; `invalid` and `no_veto` are client bugs (reported) and unfreeze the
// button; a call that fails stays Sending and is sent again each second.

export type LockInState =
  | { kind: 'idle'; error: boolean }
  | { kind: 'sending' }
  | { kind: 'locked'; locked: readonly string[]; of: number | null }
  | { kind: 'closed' }
  | { kind: 'left' };

export type LockInDeps = {
  send: (ballot: SentBallot) => Promise<CastBallotResult>;
  /** `invalid` and `no_veto`: a client bug. */
  report: (status: 'invalid' | 'no_veto') => void;
  /** `no_veto`: the seat is read again, so the veto control goes. */
  onNoVeto: () => void;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
};

export function createLockIn(deps: LockInDeps) {
  const schedule = deps.schedule ?? setTimeout;
  const cancel = deps.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let state: LockInState = { kind: 'idle', error: false };
  let handle: unknown;
  let stopped = false;
  let frozen: SentBallot = { ranking: [] };
  const listeners = new Set<() => void>();

  function set(next: LockInState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function attempt() {
    deps.send(frozen).then(
      (result) => {
        if (stopped || state.kind !== 'sending') return;
        switch (result.status) {
          case 'ok':
            set({ kind: 'locked', locked: result.locked, of: result.of });
            break;
          case 'already_voted':
            set({ kind: 'locked', locked: [], of: null });
            break;
          case 'closed':
            set({ kind: 'closed' });
            break;
          case 'not_in_room':
            set({ kind: 'left' });
            break;
          case 'invalid':
            deps.report('invalid');
            set({ kind: 'idle', error: true });
            break;
          case 'no_veto':
            deps.report('no_veto');
            deps.onNoVeto();
            set({ kind: 'idle', error: true });
            break;
        }
      },
      () => {
        if (stopped || state.kind !== 'sending') return;
        handle = schedule(attempt, RETRY_MS);
      },
    );
  }

  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** The tap. A second tap while sending, or after, does nothing. */
    submit(ballot: SentBallot) {
      if (stopped || state.kind !== 'idle') return;
      frozen = ballot;
      set({ kind: 'sending' });
      attempt();
    },
    /** The round closed or the phone left: nothing more is sent. */
    stop() {
      stopped = true;
      cancel(handle);
    },
  };
}

export type LockIn = ReturnType<typeof createLockIn>;
