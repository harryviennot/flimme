// Posters come from TMDB at w500, or w780 on large screens, never the original size
// (app-structure.md#the-card-stack). The base comes from `app_config.tmdb_image_base`.
export type PosterSize = 'w500' | 'w780';

/** From this width (in points) a screen gets the bigger poster. */
export const LARGE_SCREEN_WIDTH = 600;

export function posterSize(screenWidth: number): PosterSize {
  return screenWidth >= LARGE_SCREEN_WIDTH ? 'w780' : 'w500';
}

/** The poster's URL, or null when the base or the path is missing. */
export function posterUrl(
  imageBase: string | undefined,
  posterPath: string | null,
  screenWidth: number,
): string | null {
  if (!imageBase || !posterPath) return null;
  const base = imageBase.replace(/\/+$/, '');
  const path = posterPath.replace(/^\/+/, '');
  return `${base}/${posterSize(screenWidth)}/${path}`;
}
