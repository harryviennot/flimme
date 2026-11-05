import { create } from 'zustand';

// Films the player removed that the server has not been told about yet (or whose list has not
// been read again): the grid leaves them out so Remove feels instant, and Undo puts them back.

type HiddenStore = { ids: ReadonlySet<number> };
const useHiddenStore = create<HiddenStore>(() => ({ ids: new Set() }));

export function hideFilm(titleId: number) {
  useHiddenStore.setState((s) => ({ ids: new Set(s.ids).add(titleId) }));
}

export function unhideFilm(titleId: number) {
  useHiddenStore.setState((s) => {
    const ids = new Set(s.ids);
    ids.delete(titleId);
    return { ids };
  });
}

/** The ids the grid leaves out. */
export function useHiddenFilms(): ReadonlySet<number> {
  return useHiddenStore((s) => s.ids);
}

export function hiddenFilms(): ReadonlySet<number> {
  return useHiddenStore.getState().ids;
}
