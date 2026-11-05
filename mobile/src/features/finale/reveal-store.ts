import { create } from 'zustand';

import type { RevealData } from './reveal';

// The reveal of the room the phone is in (final-cut.md#the-reveal). The room layout starts it
// (the `match` event, or the reads of a missed reveal) and holds the route while it is on; the
// Final Cut screen plays it. In memory only: "shown" is remembered by `matchShownStore`.
//
// idle: nothing yet. waiting: the reads of a missed reveal are out. playing: the data is here.
// over: this room's reveal has played or been given up, so it never starts again.

export type RevealPhase = 'idle' | 'waiting' | 'playing' | 'over';

export type RevealState = {
  roomId: string | null;
  phase: RevealPhase;
  data: RevealData | null;
  /** Bumps when the reveal restarts (a phone back from the background before the winner step). */
  run: number;
  wait: (roomId: string) => void;
  play: (roomId: string, data: RevealData) => void;
  restart: (roomId: string) => void;
  finish: (roomId: string) => void;
  reset: () => void;
};

const IDLE = { roomId: null, phase: 'idle', data: null, run: 0 } as const;

export const revealStore = create<RevealState>()((set, get) => ({
  ...IDLE,
  // A different room starts from idle; a finished one never starts again.
  wait: (roomId) => {
    const s = get();
    if (s.roomId === roomId && s.phase !== 'idle') return;
    set({ roomId, phase: 'waiting', data: null });
  },
  play: (roomId, data) => {
    const s = get();
    if (s.roomId === roomId && (s.phase === 'playing' || s.phase === 'over')) return;
    set({ roomId, phase: 'playing', data, run: s.roomId === roomId ? s.run : 0 });
  },
  restart: (roomId) => {
    const s = get();
    if (s.roomId === roomId && s.phase === 'playing') set({ run: s.run + 1 });
  },
  finish: (roomId) => {
    const s = get();
    if (s.roomId === roomId) set({ phase: 'over', data: null });
    else set({ roomId, phase: 'over', data: null, run: 0 });
  },
  reset: () => set({ ...IDLE }),
}));

/** What the store says about one room (idle for any other). */
export function useRevealOf(roomId: string | undefined) {
  const state = revealStore();
  return state.roomId === roomId && roomId
    ? state
    : { ...state, roomId: roomId ?? null, phase: 'idle' as RevealPhase, data: null };
}
