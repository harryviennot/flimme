import type { Card, RoomMatch } from '@flimme/contract';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/api';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useMatchCard } from '@/features/match/use-match-card';
import { ROOM_KEY } from '@/features/room';

import { isOnlyFilmPick, pickOf } from './pick';
import { serviceLogos, type ServiceLogo } from './services';

export type WinnerView =
  /** The pick row, or the card, is still on its way. */
  | { status: 'loading' }
  /** The room is `done` and picked nothing. */
  | { status: 'no_pick' }
  /** The card read failed. `retry` reads it again. */
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      card: Card;
      posterUri: string | null;
      services: ServiceLogo[];
      watchLink: string | null;
      onlyFilm: boolean;
    };

/** Everything the winner screen shows, from the room's pick (winner.md). */
export function useWinner(roomId: string, language: string): WinnerView {
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const matches = useQuery({
    queryKey: [...ROOM_KEY(roomId), 'matches'],
    queryFn: () => api.roomMatches({ room_id: roomId }),
    staleTime: 0,
    retry: 1,
  });
  const pick: RoomMatch | null = pickOf(matches.data);
  // Only a finale pick can be the single-film pick, so only then are the rounds read.
  const rounds = useQuery({
    queryKey: [...ROOM_KEY(roomId), 'rounds'],
    enabled: pick?.kind === 'finale',
    queryFn: () => api.rounds({ room_id: roomId }),
    staleTime: 0,
    retry: 1,
  });
  const { card, posterUri, failed, retry } = useMatchCard(roomId, pick?.title_id, language);

  if (matches.data && !pick) return { status: 'no_pick' };
  if (matches.isError && !matches.data) {
    return { status: 'error', retry: () => void matches.refetch() };
  }
  if (!pick || !card) {
    if (failed) return { status: 'error', retry };
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    card,
    posterUri,
    services: serviceLogos(card.providers, imageBase),
    watchLink: card.watch_link,
    onlyFilm: isOnlyFilmPick(pick, rounds.data),
  };
}
