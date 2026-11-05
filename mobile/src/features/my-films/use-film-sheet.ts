import type { Card } from '@flimme/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useOnline } from '@/features/network';
import { serviceLogos, type ServiceLogo } from '@/features/winner/services';

export type SheetView =
  | { status: 'loading' }
  /** No card yet and no network: it loads by itself when the phone is back. */
  | { status: 'offline' }
  | { status: 'error'; retry: () => void }
  /** The film left the list on another screen. */
  | { status: 'not_found' }
  | {
      status: 'ready';
      card: Card;
      seen: boolean;
      liked: boolean;
      services: ServiceLogo[];
      watchLink: string | null;
    };

type CardAnswer = Awaited<ReturnType<typeof api.myFilmCard>>;

const cardKey = (titleId: number, language: string) => ['my-film-card', titleId, language] as const;

/** The film sheet's card, and whether the film is seen and liked (film-sheet.md). */
export function useFilmSheet(titleId: number, language: string) {
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const online = useOnline();
  const client = useQueryClient();
  const key = cardKey(titleId, language);
  const read = useQuery({
    queryKey: key,
    queryFn: async () => {
      const answer = await api.myFilmCard({ title_id: titleId, language });
      // A rate limit is a failed read the sheet can retry.
      if (answer.status === 'rate_limited') throw new Error('my_film_card: rate_limited');
      return answer;
    },
    enabled: Number.isFinite(titleId),
    staleTime: 60_000,
    retry: 1,
  });

  const answer: CardAnswer | undefined = read.data;
  let view: SheetView;
  if (answer?.status === 'ok') {
    view = {
      status: 'ready',
      card: answer.card,
      seen: answer.seen,
      liked: answer.liked,
      services: serviceLogos(answer.card.providers, imageBase),
      watchLink: answer.card.watch_link,
    };
  } else if (answer?.status === 'not_found') {
    view = { status: 'not_found' };
  } else if (read.isError) {
    view = online ? { status: 'error', retry: () => void read.refetch() } : { status: 'offline' };
  } else if (read.fetchStatus === 'paused' || !online) {
    view = { status: 'offline' };
  } else {
    view = { status: 'loading' };
  }

  /** Keeps the cached card in step with a seen mark that went through. */
  const setSeen = (seen: boolean) =>
    client.setQueryData<CardAnswer>(key, (old) => (old?.status === 'ok' ? { ...old, seen } : old));

  return { view, setSeen };
}
