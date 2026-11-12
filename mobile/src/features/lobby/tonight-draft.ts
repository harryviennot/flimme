import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { SkippedPerson } from './people';

// The player's unsaved Not tonight choices (genre-step.md#not-tonight-m670-and-m671): the picks,
// the skipped genres and the skipped people. Memory only, one room at a time. The genre step, the
// lobby's genres sheet and the people search sheet share it. A list that is `null` has not been
// touched: it follows what the seat holds, so a re-read of `api.room_genres` shows through until
// the first tap.

export type TonightChange = { picks?: number[]; skips?: number[]; people?: SkippedPerson[] };

export type TonightDraftState = {
  roomId: string | null;
  picks: number[] | null;
  skips: number[] | null;
  /** The skipped people, in the order added. */
  people: SkippedPerson[] | null;
  /** The screen says whether the draft differs from what the seat holds (Start tells the player). */
  unsaved: boolean;
  set: (roomId: string, change: TonightChange) => void;
  setUnsaved: (roomId: string, unsaved: boolean) => void;
  reset: () => void;
};

export function createTonightDraftStore() {
  return createStore<TonightDraftState>()((set, get) => ({
    roomId: null,
    picks: null,
    skips: null,
    people: null,
    unsaved: false,
    set: (roomId, change) => {
      const same = get().roomId === roomId;
      set({
        roomId,
        picks: change.picks ?? (same ? get().picks : null),
        skips: change.skips ?? (same ? get().skips : null),
        people: change.people ?? (same ? get().people : null),
      });
    },
    setUnsaved: (roomId, unsaved) => {
      if (get().roomId === roomId && get().unsaved !== unsaved) set({ unsaved });
      else if (get().roomId !== roomId && unsaved) set({ roomId, unsaved });
    },
    reset: () => set({ roomId: null, picks: null, skips: null, people: null, unsaved: false }),
  }));
}

export const tonightDraftStore = createTonightDraftStore();

/** The draft of this room: `null` lists have not been touched. */
export function useTonightDraft(roomId: string | undefined) {
  const state = useStore(tonightDraftStore);
  const mine = state.roomId === roomId;
  return {
    picks: mine ? state.picks : null,
    skips: mine ? state.skips : null,
    people: mine ? state.people : null,
    set: (change: TonightChange) => state.set(roomId ?? '', change),
    setUnsaved: (unsaved: boolean) => state.setUnsaved(roomId ?? '', unsaved),
    reset: state.reset,
  };
}

/**
 * Start (the room left the lobby) while the draft has changes nobody saved: true once, and the draft
 * is cleared. The layout then says the changes didn't make it.
 */
export function takeUnsavedTonight(roomId: string): boolean {
  const state = tonightDraftStore.getState();
  if (state.roomId !== roomId) return false;
  const lost = state.unsaved;
  state.reset();
  return lost;
}
