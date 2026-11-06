import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

// Which films this phone saved for Later during this session, for the bookmark's state. Room
// cards never carry the saved state (a film saved in an earlier game shows an empty bookmark),
// so the bookmark shows only what this phone did since it opened. In memory, on purpose.

export type SavedSessionState = {
  ids: ReadonlySet<number>;
  has: (titleId: number) => boolean;
  set: (titleId: number, saved: boolean) => void;
  reset: () => void;
};

export function createSavedSession() {
  return createStore<SavedSessionState>()((set, get) => ({
    ids: new Set<number>(),
    has: (titleId) => get().ids.has(titleId),
    set: (titleId, saved) => {
      const ids = new Set(get().ids);
      if (saved) ids.add(titleId);
      else ids.delete(titleId);
      set({ ids });
    },
    reset: () => set({ ids: new Set<number>() }),
  }));
}

export const savedSession = createSavedSession();

/** Whether this phone saved the film in this session. */
export function useIsSaved(titleId: number): boolean {
  return useStore(savedSession, (s) => s.ids.has(titleId));
}
