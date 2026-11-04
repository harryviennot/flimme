import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// The rooms whose match overlay has played (match.md#when-it-shows, Q14.3). A phone that
// cold-starts in a marked `done` room goes straight to the winner screen. Only ids are kept:
// the last 20 rooms, oldest dropped first.

/** How many rooms are remembered. */
export const MATCH_SHOWN_KEEP = 20;

type Saved = { rooms: string[] };

export type MatchShownState = Saved & {
  has: (roomId: string) => boolean;
  mark: (roomId: string) => void;
};

export const MATCH_SHOWN_VERSION = 1;

/** Anything that isn't a list of non-empty strings reads as the strings that are. */
export function readMatchShown(saved: unknown): Saved {
  const list = (saved as { rooms?: unknown } | null | undefined)?.rooms;
  if (!Array.isArray(list)) return { rooms: [] };
  const rooms = list.filter((id): id is string => typeof id === 'string' && id !== '');
  return { rooms: rooms.slice(-MATCH_SHOWN_KEEP) };
}

export function createMatchShownStore(kv?: KeyValueStore) {
  return create<MatchShownState>()(
    persist(
      (set, get) => ({
        rooms: [],
        has: (roomId) => get().rooms.includes(roomId),
        mark: (roomId) => {
          if (get().rooms.includes(roomId)) return;
          set({ rooms: [...get().rooms, roomId].slice(-MATCH_SHOWN_KEEP) });
        },
      }),
      persistOptions<MatchShownState, Saved>({
        name: 'match-shown',
        version: MATCH_SHOWN_VERSION,
        migrate: readMatchShown,
        sanitize: readMatchShown,
        partialize: ({ rooms }) => ({ rooms }),
        kv,
      }),
    ),
  );
}

export const matchShownStore = createMatchShownStore();

/**
 * Whether this room's match overlay has played, and re-renders when it does. A named hook:
 * the React Compiler only treats `use...` functions as hooks, and would otherwise memoize
 * the store call and change the hook order between renders.
 */
export function useMatchShown(roomId: string | undefined): boolean {
  return matchShownStore((state) => (roomId ? state.rooms.includes(roomId) : false));
}
