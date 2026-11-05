import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { gamesPlayedBucket } from '@/lib/analytics';
import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// What this install has seen of its games, counted on the phone (`games_played` never comes from
// the database). A game counts once, when its room is seen `swiping`. The first card of a game is
// reported once per room. Only room ids are kept, the last 20 of each, and they never leave the
// phone. A deletion wipes the store (features/account/wipe-app.ts).

export const GAMES_KEEP = 20;

type Saved = { played: number; counted: string[]; firstCard: string[] };

export type GamesState = Saved & {
  /** A room reached `swiping`: true the first time only. */
  countGame: (roomId: string) => boolean;
  /** The first card of this room's game was reported: true the first time only. */
  markFirstCard: (roomId: string) => boolean;
};

export const GAMES_VERSION = 1;

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id !== '').slice(-GAMES_KEEP);
}

/** Anything unreadable reads as nothing played. */
export function readGames(saved: unknown): Saved {
  const s = (saved ?? {}) as Partial<Record<keyof Saved, unknown>>;
  const played = typeof s.played === 'number' && s.played >= 0 ? Math.floor(s.played) : 0;
  return { played, counted: ids(s.counted), firstCard: ids(s.firstCard) };
}

export function createGamesStore(kv?: KeyValueStore) {
  return create<GamesState>()(
    persist(
      (set, get) => ({
        played: 0,
        counted: [],
        firstCard: [],
        countGame: (roomId) => {
          if (get().counted.includes(roomId)) return false;
          set((s) => ({
            played: s.played + 1,
            counted: [...s.counted, roomId].slice(-GAMES_KEEP),
          }));
          return true;
        },
        markFirstCard: (roomId) => {
          if (get().firstCard.includes(roomId)) return false;
          set((s) => ({ firstCard: [...s.firstCard, roomId].slice(-GAMES_KEEP) }));
          return true;
        },
      }),
      persistOptions<GamesState, Saved>({
        name: 'games',
        version: GAMES_VERSION,
        migrate: readGames,
        sanitize: readGames,
        partialize: ({ played, counted, firstCard }) => ({ played, counted, firstCard }),
        kv,
      }),
    ),
  );
}

export const gamesStore = createGamesStore();

/** The `games_played` bucket, re-rendering when it changes. A named hook for the React Compiler. */
export function useGamesPlayed(): ReturnType<typeof gamesPlayedBucket> {
  return gamesPlayedBucket(gamesStore((s) => s.played));
}
