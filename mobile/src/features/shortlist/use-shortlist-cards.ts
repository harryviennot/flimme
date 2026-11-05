import type { Card } from '@flimme/contract';
import { useQuery } from '@tanstack/react-query';
import { useWindowDimensions } from 'react-native';

import { api } from '@/api';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { heldCardOf } from '@/features/match/use-match-card';
import { posterUrl } from '@/features/swipe/poster-url';

export type ShortlistFilm = { title: string; posterUri: string | null; thumbhash?: string };

/**
 * The films of the shortlist by id: from the cards the swipe screen holds, else one
 * `api.title_cards` read for the ones it does not (a cold start, a film never dealt here).
 */
export function useShortlistCards(
  roomId: string,
  titleIds: readonly number[],
  language: string,
): Map<number, ShortlistFilm> {
  const { width } = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const held = new Map<number, Card>();
  const missing: number[] = [];
  for (const id of titleIds) {
    const card = heldCardOf(id);
    if (card) held.set(id, card);
    else missing.push(id);
  }
  const read = useQuery({
    queryKey: ['room', roomId, 'shortlist-cards', missing.join(','), language],
    enabled: missing.length > 0,
    queryFn: async () => {
      const answer = await api.titleCards({ room_id: roomId, title_ids: missing, language });
      if (answer.status !== 'ok') throw new Error(`title_cards: ${answer.status}`);
      return answer.cards;
    },
    staleTime: Infinity,
    retry: 1,
  });
  const films = new Map<number, ShortlistFilm>();
  for (const id of titleIds) {
    const card = held.get(id) ?? read.data?.find((c) => c.title_id === id);
    if (card) {
      films.set(id, {
        title: card.title,
        posterUri: posterUrl(imageBase, card.poster_path, width),
        thumbhash: card.poster_placeholder ?? undefined,
      });
    }
  }
  return films;
}
