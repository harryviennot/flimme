import type { Card } from '@flimme/contract';

import type { MovieCardProps } from '@/components/shared/movie-card';
import { formatList } from '@/features/lobby/names';
import { backMeta, cardMeta } from '@/features/swipe/card-props';
import { posterUrl } from '@/features/swipe/poster-url';

// The film sheet's card back (film-sheet.md): the poster header, title, meta, TMDB rating,
// synopsis and credits. Left out on purpose: the reason label, a friend's rating, the trailer
// (no age cap to check outside a room) and the service tags, which "Where to watch" says better.

const CAST_SHOWN = 5;

export function sheetCardProps(
  card: Card,
  options: {
    language: string;
    imageBase: string | undefined;
    screenWidth: number;
    noSynopsis: string;
  },
): Omit<MovieCardProps, 'flipped' | 'onFlip'> {
  const { language } = options;
  const url = posterUrl(options.imageBase, card.poster_path, options.screenWidth);
  const score = card.tmdb_score;
  return {
    title: card.title,
    meta: cardMeta(card, language),
    poster: url ? { uri: url } : null,
    thumbhash: card.poster_placeholder ?? undefined,
    services: [],
    still: true,
    back: {
      meta: backMeta(card, language),
      tmdbRating:
        score !== null
          ? new Intl.NumberFormat(language, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format(score)
          : undefined,
      synopsis: card.overview ?? options.noSynopsis,
      director: card.directors.length > 0 ? formatList(card.directors, language) : undefined,
      cast: card.cast.length > 0 ? formatList(card.cast.slice(0, CAST_SHOWN), language) : undefined,
      services: [],
    },
  };
}
