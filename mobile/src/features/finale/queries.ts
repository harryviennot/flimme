import type { Card } from '@flimme/contract';

import { api } from '@/api';
import { heldCardOf } from '@/features/match/use-match-card';
import { ROOM_KEY } from '@/features/room';

import { cardsKey } from './rounds';

// The reads behind the Final Cut screen. Keys sit under the room's, so one invalidate re-reads all.

export const roundsQuery = (roomId: string) => ({
  queryKey: [...ROOM_KEY(roomId), 'rounds'] as const,
  queryFn: () => api.rounds({ room_id: roomId }),
  staleTime: 0,
  retry: 1,
});

export const candidatesQuery = (roomId: string, roundId: string) => ({
  queryKey: [...ROOM_KEY(roomId), 'round', roundId, 'candidates'] as const,
  queryFn: () => api.roundCandidates({ round_id: roundId }),
  staleTime: 0,
  retry: 1,
});

export const progressQuery = (roomId: string, roundId: string) => ({
  queryKey: [...ROOM_KEY(roomId), 'round', roundId, 'progress'] as const,
  queryFn: () => api.roundProgress({ round_id: roundId }),
  staleTime: 0,
  retry: 1,
});

/**
 * One call for every finalist (the stack's held cards first, as the match overlay does). Shared
 * by the screen and by the preload that `finale_started` starts, so the posters are often here
 * when the screen opens.
 */
export const finalistCardsQuery = (
  roomId: string,
  titleIds: readonly number[],
  language: string,
) => ({
  queryKey: [...ROOM_KEY(roomId), 'finalist-cards', language, cardsKey(titleIds)] as const,
  queryFn: async (): Promise<Card[]> => {
    const held = titleIds.flatMap((id) => heldCardOf(id) ?? []);
    const missing = titleIds.filter((id) => !held.some((card) => card.title_id === id));
    if (missing.length === 0) return held;
    const answer = await api.titleCards({ room_id: roomId, title_ids: missing, language });
    if (answer.status !== 'ok') throw new Error(`title_cards: ${answer.status}`);
    return [...held, ...answer.cards];
  },
  staleTime: Infinity,
  retry: 1,
});
