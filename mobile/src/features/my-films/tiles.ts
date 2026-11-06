import type { MyFilmTile, MyFilmsFilter, MyFilmsSegment } from '@flimme/contract';

// What My films shows of its rows (my-films.md): one tile per film, at most one badge, the
// label a screen reader reads, and which empty line fits the segment and chip.

/** The pages in order, each film once (a film liked while the player pages can shift pages). */
export function mergePages(pages: readonly { films: readonly MyFilmTile[] }[]): MyFilmTile[] {
  const seen = new Set<number>();
  const films: MyFilmTile[] = [];
  for (const page of pages) {
    for (const film of page.films) {
      if (seen.has(film.title_id)) continue;
      seen.add(film.title_id);
      films.push(film);
    }
  }
  return films;
}

export type TileBadge = 'picked' | 'super' | null;

/** "Picked" wins over the star (Q41.10); Seen and Later tiles have no badge (Q39.3). */
export function badgeOf(segment: MyFilmsSegment, film: MyFilmTile): TileBadge {
  if (segment !== 'liked') return null;
  if (film.is_picked) return 'picked';
  return film.is_super_liked ? 'super' : null;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** "Heat, 1995, picked on a movie night"; with no year, the title alone. */
export function tileLabel(segment: MyFilmsSegment, film: MyFilmTile, t: Translate): string {
  const base =
    film.year === null ? film.title : t('a11y.tile', { title: film.title, year: film.year });
  const badge = badgeOf(segment, film);
  if (badge === 'picked') return `${base}, ${t('a11y.picked')}`;
  if (badge === 'super') return `${base}, ${t('a11y.superLiked')}`;
  return base;
}

export type EmptyKind = 'liked' | 'friends' | 'solo' | 'seen' | 'later';

export function emptyKind(segment: MyFilmsSegment, filter: MyFilmsFilter): EmptyKind {
  if (segment === 'seen') return 'seen';
  if (segment === 'later') return 'later';
  return filter === 'friends' ? 'friends' : filter === 'solo' ? 'solo' : 'liked';
}

export type GridState = 'loading' | 'offline' | 'error' | 'empty' | 'ready';

/**
 * What the grid shows from the query: nothing read and no network is Offline (the query is
 * paused and loads by itself), a first page that failed is an Error, and pages already read stay
 * a grid whatever the network does.
 */
export function gridState(input: {
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  films: number;
  online: boolean;
}): GridState {
  const { status, fetchStatus, films, online } = input;
  if (status === 'success') return films === 0 ? 'empty' : 'ready';
  if (status === 'error') return online ? 'error' : 'offline';
  return fetchStatus === 'paused' || !online ? 'offline' : 'loading';
}

export const GRID_COLUMNS = 3;
const GRID_GUTTER = 16;
const GRID_GAP = 8;

/** A tile's width: the window minus the gutters (16 each side) and the two gaps, in three. */
export function tileWidth(windowWidth: number): number {
  return Math.floor((windowWidth - GRID_GUTTER * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
}
