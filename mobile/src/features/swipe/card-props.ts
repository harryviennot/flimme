import type { NextCard } from '@flimme/contract';

import type { MovieCardProps } from '@/components/shared/movie-card';
import { formatList } from '@/features/lobby/names';

import { posterUrl } from './poster-url';

// What a card from the server shows on the movie card: numbers through Intl in the profile's
// language, services from the card's own offers. The back reads the same payload: nothing on it
// waits on the network.

const MAX_SERVICES = 3;
const CAST_SHOWN = 5;
const BACK_SERVICES = 6;
const LOGO_SIZE = 'w92';
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

export type BackService = { name: string; logo?: string };

/** The room's services for the film, with their logos, once each, for the back of the card. */
export function backServices(card: NextCard, imageBase: string | undefined): BackService[] {
  const base = imageBase?.replace(/\/+$/, '');
  const list: BackService[] = [];
  for (const offer of card.providers) {
    if (!INCLUDED.has(offer.kind) || list.some((s) => s.name === offer.name)) continue;
    list.push({
      name: offer.name,
      logo:
        base && offer.logo_path
          ? `${base}/${LOGO_SIZE}/${offer.logo_path.replace(/^\/+/, '')}`
          : undefined,
    });
  }
  return list.slice(0, BACK_SERVICES);
}

/** The trailer opens on YouTube, outside the app. */
export function trailerUrl(key: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`;
}

/**
 * The card back opens YouTube, whose next video isn't ours to choose, so rooms capped under 13
 * have no Trailer. The server already sends a null key there (`internal.card_payloads`); this is
 * the phone's own check, so a card cached before a change can't show it. `null` is uncapped, 0
 * ("All ages"), 10 and 12 are capped. `undefined` (the room isn't known yet) shows nothing.
 */
export function trailerAllowed(maxAge: number | null | undefined): boolean {
  return maxAge === null || (maxAge !== undefined && maxAge >= 13);
}

export type CardTextOptions = {
  language: string;
  /** `app_config.tmdb_image_base`. */
  imageBase: string | undefined;
  screenWidth: number;
  /** `swipe:card.noSynopsis`. */
  noSynopsis: string;
  /** `rooms.max_age`; `undefined` while the room is loading. See `trailerAllowed`. */
  maxAge?: number | null;
  /** Opens a trailer. Without it (or without a `trailer_key`) the back has no Trailer button. */
  onTrailer?: (url: string) => void;
  /** A touch started on the Trailer button. */
  onTrailerTouch?: () => void;
};

export function toMovieCard(
  card: NextCard,
  options: CardTextOptions,
): Omit<MovieCardProps, 'flipped' | 'onFlip' | 'stamp'> {
  const { language, onTrailer } = options;
  const key = trailerAllowed(options.maxAge) ? card.trailer_key : null;
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
      services: backServices(card, options.imageBase),
      onTrailer: key && onTrailer ? () => onTrailer(trailerUrl(key)) : undefined,
      onTrailerTouch: options.onTrailerTouch,
    },
  };
}
