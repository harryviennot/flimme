import type { MyFilmsFilter, MyFilmsSegment } from '@flimme/contract';
import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/api';
import { queryClient } from '@/lib/query-client';

// Each segment and chip is its own query, so switching back is instant (my-films.md, Paging).
// A page is 60 films; `next_cursor` is opaque and null on the last page.

export const MY_FILMS_KEY = ['my-films'] as const;

/** The filter only means something under Liked; Seen always reads with `all`. */
export const myFilmsKey = (segment: MyFilmsSegment, filter: MyFilmsFilter, language: string) =>
  [...MY_FILMS_KEY, segment, segment === 'liked' ? filter : 'all', language] as const;

export function useMyFilms(segment: MyFilmsSegment, filter: MyFilmsFilter, language: string) {
  const effective = segment === 'liked' ? filter : 'all';
  return useInfiniteQuery({
    queryKey: myFilmsKey(segment, effective, language),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.myFilms({ segment, filter: effective, cursor: pageParam, language }),
    getNextPageParam: (last) => last.next_cursor,
    // Always read again when the tab comes back (a film liked a minute ago must show).
    staleTime: 0,
    retry: 1,
  });
}

/** Reads every My films list again (after a remove, a seen mark, or a sheet that closed). */
export function refreshMyFilms(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: MY_FILMS_KEY });
}
