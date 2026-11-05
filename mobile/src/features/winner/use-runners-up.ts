import { ApiError, type Card } from '@flimme/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { ROOM_KEY } from '@/features/room';

import { buildRunnersUp, type RunnersUpData } from './runners-up';

// The winner screen's runners-up (winner.md#the-runners-up): `api.room_runners_up`, then the cards
// of its films. Every state that is not "films and cards read" shows nothing and no error: the
// pick's block never waits for this. The foreground refresh (a prefix invalidation of the room key) and TanStack
// reads it again when the app is foregrounded or back online.

const retry = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.kind === 'network') && count < 1;

/** The key a card is kept under; the pick's card read (`useMatchCard`) uses the same one. */
export const titleCardKey = (roomId: string, titleId: number, language: string) =>
  ['room', roomId, 'title-card', titleId, language] as const;

/**
 * The section's data, or null while it loads, fails, is offline or has nothing to show. `ids` is
 * the read's films and `answered` whether the read has answered at all (the sheet checks both).
 */
export function useRunnersUp(roomId: string, language: string, enabled = true) {
  const client = useQueryClient();
  const list = useQuery({
    queryKey: [...ROOM_KEY(roomId), 'runners-up'],
    enabled,
    queryFn: () => api.roomRunnersUp({ room_id: roomId }),
    staleTime: 0,
    retry,
  });
  const answer = list.data;
  const ids = answer?.status === 'ok' ? answer.runners_up.map((r) => r.title_id) : [];
  const cards = useQuery({
    queryKey: [...ROOM_KEY(roomId), 'runners-up-cards', ids.join(','), language],
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Card[]> => {
      const read = await api.titleCards({ room_id: roomId, title_ids: ids, language });
      if (read.status !== 'ok') throw new Error(`title_cards: ${read.status}`);
      // The runner-up sheet finds its card here without another read.
      for (const card of read.cards) {
        client.setQueryData(titleCardKey(roomId, card.title_id, language), card);
      }
      return read.cards;
    },
    staleTime: Infinity,
    retry,
  });

  const data: RunnersUpData | null = buildRunnersUp(answer, cards.data);
  return { data, ids, answered: answer !== undefined };
}
