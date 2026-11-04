import { formatRuntime } from '@/features/swipe/card-props';

// What the match overlay says about the film, as the swipe card does (Hermes ignores
// `Intl.NumberFormat` unit styles, so the runtime comes from the card's own formatter).

/** "2021 · 1 h 52", or whatever part the film has; an empty string with neither. */
export function matchMeta(
  film: { year: number | null; runtime_min: number | null },
  language: string,
): string {
  const parts: string[] = [];
  if (film.year !== null) parts.push(String(film.year));
  if (film.runtime_min !== null && film.runtime_min > 0) {
    parts.push(formatRuntime(film.runtime_min, language));
  }
  return parts.join(' · ');
}
