// The genre sheet's rules (lobby.md#your-genres-tonight): up to 3 picks, optional, counts only.
// Nothing here knows who picked what; the server never says. Genre ids stay out of analytics.
import type { Genre, RoomGenresResult, SetSeatPrefsResult } from '@flimme/contract';

/** At most 3 genres per player (decisions.md, 6 Nov 2026). */
export const GENRE_CAP = 3;

export type GenreChip = { id: number; name: string; count: number; selected: boolean };

/** A genre's name in the player's language: English, then the slug, when it has none. */
export function genreName(genre: Genre, language: string): string {
  const names = genre.names;
  const own = language.startsWith('fr') ? names.fr : names.en;
  return own ?? names.en ?? genre.slug;
}

/** A tap on a chip. A 4th pick changes nothing and says so (`capped`), as a note, not an error. */
export function toggleGenre(
  selection: readonly number[],
  id: number,
): { selection: number[]; capped: boolean } {
  if (selection.includes(id)) {
    return { selection: selection.filter((x) => x !== id), capped: false };
  }
  if (selection.length >= GENRE_CAP) return { selection: [...selection], capped: true };
  return { selection: [...selection, id], capped: false };
}

/**
 * The chips, sorted by name in the player's language (the server gives genre id order). The server's count includes the player's saved picks;
 * the chip shows the count as if the unsaved selection were saved, so a tap answers at once.
 * Offered ids with no known genre are skipped.
 */
export function genreChips(
  options: RoomGenresResult['options'],
  genres: readonly Genre[],
  language: string,
  selection: readonly number[],
  saved: readonly number[],
): GenreChip[] {
  const byId = new Map(genres.map((genre) => [genre.id, genre]));
  const chips: GenreChip[] = [];
  for (const option of options) {
    const genre = byId.get(option.genre_id);
    if (!genre) continue;
    const selected = selection.includes(option.genre_id);
    const count = option.count - (saved.includes(option.genre_id) ? 1 : 0) + (selected ? 1 : 0);
    chips.push({
      id: option.genre_id,
      name: genreName(genre, language),
      count: Math.max(0, count),
      selected,
    });
  }
  return chips.sort((a, b) => a.name.localeCompare(b.name, language));
}

/** The names of the player's saved picks that are still offered, for the lobby row. */
export function genreSummary(
  options: RoomGenresResult['options'],
  genres: readonly Genre[],
  language: string,
  mine: readonly number[],
): string[] {
  return genreChips(options, genres, language, mine, mine)
    .filter((chip) => chip.selected)
    .map((chip) => chip.name);
}

export type SaveGenresOutcome =
  /** Saved, nothing to save, or the room is over: close the sheet (the layout follows the room). */
  | { kind: 'close' }
  /** The game started: the picks are fixed. Close with a note. */
  | { kind: 'locked' }
  /** A pick is no longer offered: stay open and read the offer again. */
  | { kind: 'stale' }
  /** A bug on our side (the sheet stops a 4th pick): generic toast, a report, stays open. */
  | { kind: 'bug'; reason: string }
  /** The call failed: the warn toast, the sheet stays open. */
  | { kind: 'failed' };

export type SaveGenresDeps = {
  setSeatPrefs: (args: { room_id: string; genre_ids: number[] }) => Promise<SetSeatPrefsResult>;
};

const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

export async function saveGenres(
  input: { roomId: string; selection: number[]; start: number[] },
  deps: SaveGenresDeps,
): Promise<SaveGenresOutcome> {
  if (sameSet(input.selection, input.start)) return { kind: 'close' };
  try {
    const answer = await deps.setSeatPrefs({
      room_id: input.roomId,
      genre_ids: input.selection,
    });
    switch (answer.status) {
      case 'ok':
      case 'closed':
        return { kind: 'close' };
      case 'locked':
        return { kind: 'locked' };
      case 'unknown_genre':
      case 'out_tonight':
        return { kind: 'stale' };
      case 'too_many':
        return { kind: 'bug', reason: 'set_seat_prefs:too_many' };
    }
  } catch {
    return { kind: 'failed' };
  }
}
