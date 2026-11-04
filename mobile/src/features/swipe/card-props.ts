import type { NextCard } from '@flimme/contract';

import type { MovieCardProps } from '@/components/shared/movie-card';
import { formatList } from '@/features/lobby/names';

import { posterUrl } from './poster-url';

// What a card from the server shows on the movie card: numbers through Intl in the profile's
// language, services from the card's own offers. The back's content is M6.10's to refine.

const MAX_SERVICES = 3;
const CAST_SHOWN = 3;
const INCLUDED = new Set(['subscription', 'free', 'ads']);

/** "1 h 43", "2 h 04" or "45 min". */
export function formatRuntime(minutes: number, language: string): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${new Intl.NumberFormat(language).format(rest)} min`;
  const two = new Intl.NumberFormat(language, { minimumIntegerDigits: 2 }).format(rest);
  return `${new Intl.NumberFormat(language).format(hours)} h ${two}`;
}

function formatScore(score: number, language: string): string {
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(score);
}

/** "2017 · 1 h 43 · ★ 7.4": what the film has, in that order. */
export function cardMeta(card: NextCard, language: string): string {
  const parts: string[] = [];
  if (card.year !== null) parts.push(String(card.year));
  if (card.runtime_min !== null && card.runtime_min > 0) {
    parts.push(formatRuntime(card.runtime_min, language));
  }
  if (card.tmdb_score !== null) parts.push(`★ ${formatScore(card.tmdb_score, language)}`);
  return parts.join(' · ');
}

/** The services the film is included with, once each, at most three. */
export function cardServices(card: NextCard): string[] {
  const names: string[] = [];
  for (const offer of card.providers) {
    if (INCLUDED.has(offer.kind) && !names.includes(offer.name)) names.push(offer.name);
  }
  return names.slice(0, MAX_SERVICES);
}

export type CardTextOptions = {
  language: string;
  /** `app_config.tmdb_image_base`. */
  imageBase: string | undefined;
  screenWidth: number;
  /** `swipe:card.noSynopsis`. */
  noSynopsis: string;
};

export function toMovieCard(
  card: NextCard,
  options: CardTextOptions,
): Omit<MovieCardProps, 'flipped' | 'onFlip' | 'stamp'> {
  const { language } = options;
  const url = posterUrl(options.imageBase, card.poster_path, options.screenWidth);
  const directors = card.directors.length > 0 ? formatList(card.directors, language) : undefined;
  const cast =
    card.cast.length > 0 ? formatList(card.cast.slice(0, CAST_SHOWN), language) : undefined;
  return {
    title: card.title,
    meta: cardMeta(card, language),
    poster: url ? { uri: url } : null,
    thumbhash: card.poster_placeholder ?? undefined,
    services: cardServices(card),
    back: {
      tmdbRating: card.tmdb_score !== null ? formatScore(card.tmdb_score, language) : undefined,
      synopsis: card.overview ?? options.noSynopsis,
      director: directors,
      cast,
    },
  };
}
