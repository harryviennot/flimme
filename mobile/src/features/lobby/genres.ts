// The genre sheet's rules (lobby.md#your-genres-tonight): up to 3 picks, optional, counts only.
// Nothing here knows who picked what; the server never says. Genre ids stay out of analytics.
import type {
  Genre,
  RoomGenresResult,
  SetSeatPrefsResult,
  SetSeatSkipsResult,
} from '@flimme/contract';

/** At most 3 genres per player (decisions.md, 6 Nov 2026). */
export const GENRE_CAP = 3;

/** Not tonight (game-modes.md#not-tonight, Harry, 11 Nov 2026): 3 genres and 3 people per player. */
export const SKIP_GENRES_MAX = 3;
export const SKIP_PEOPLE_MAX = 3;
/** At most 4 genres out tonight for the whole room. */
export const ROOM_OUT_GENRES_MAX = 4;

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

/** Every TMDB genre, sorted by name in the player's language, for the Not tonight genres row. */
export function allGenreChips(
  genres: readonly Genre[],
  language: string,
): { id: number; name: string }[] {
  return genres
    .map((genre) => ({ id: genre.id, name: genreName(genre, language) }))
    .sort((a, b) => a.name.localeCompare(b.name, language));
}

/** The genres out tonight on this phone: the room's (never the player's own) plus the draft's skips. */
export function outTonightSet(out: readonly number[], skips: readonly number[]): number[] {
  return [...new Set([...out, ...skips])];
}

export type ToggleSkip = {
  picks: number[];
  skips: number[];
  /** A 4th skip: the player's own cap. */
  capped: boolean;
  /** A new skip with the room's 4 already out. */
  roomLimit: boolean;
  /** The skipped genre was one of the picks: it left them. */
  pickMoved: boolean;
};

/**
 * A tap on a skip chip. Skipping takes the genre off the picks. A genre already out can always be
 * skipped; a new one is refused when the room already has 4 out (the room's plus this draft's).
 * `out` can hold more than 4 (a rejoining seat brings its skips back): it only refuses new ones.
 */
export function toggleSkip(
  state: { picks: readonly number[]; skips: readonly number[] },
  id: number,
  out: readonly number[],
): ToggleSkip {
  const picks = [...state.picks];
  const skips = [...state.skips];
  const refuse = (why: 'capped' | 'roomLimit'): ToggleSkip => ({
    picks,
    skips,
    capped: why === 'capped',
    roomLimit: why === 'roomLimit',
    pickMoved: false,
  });
  if (skips.includes(id)) {
    return {
      picks,
      skips: skips.filter((x) => x !== id),
      capped: false,
      roomLimit: false,
      pickMoved: false,
    };
  }
  if (skips.length >= SKIP_GENRES_MAX) return refuse('capped');
  if (!out.includes(id) && outTonightSet(out, skips).length >= ROOM_OUT_GENRES_MAX) {
    return refuse('roomLimit');
  }
  return {
    picks: picks.filter((x) => x !== id),
    skips: [...skips, id],
    capped: false,
    roomLimit: false,
    pickMoved: picks.includes(id),
  };
}

/**
 * A fresh read of `room_genres`: a pick in a genre that is out leaves the draft (and is reported
 * in `removed`, for the `prefs.pickOut` line). With `dropSkips` (after `room_limit`) the draft
 * also keeps only the skips that are out now, so the player picks again.
 */
export function reconcileTonight(
  draft: { picks: readonly number[]; skips: readonly number[] },
  out: readonly number[],
  dropSkips = false,
): { picks: number[]; skips: number[]; removed: number[] } {
  const skips = dropSkips ? draft.skips.filter((id) => out.includes(id)) : [...draft.skips];
  const gone = (id: number) => out.includes(id) || skips.includes(id);
  return {
    picks: draft.picks.filter((id) => !gone(id)),
    skips,
    removed: draft.picks.filter((id) => out.includes(id) && !draft.skips.includes(id)),
  };
}

export type SaveTonightOutcome =
  /** Saved, nothing to save, or the room is over: close (the layout follows the room). */
  | { kind: 'close' }
  /** The game started: the choices are fixed. Close with a note. */
  | { kind: 'locked' }
  /** A pick hit a genre that went out: stay, read again, say `prefs.pickOut`. */
  | { kind: 'pickOut' }
  /** The room's 4 filled first: refusal feedback, warn toast, read again, stay. */
  | { kind: 'roomLimit'; max: number }
  /** A genre is no longer offered or known: stay and read again. */
  | { kind: 'stale' }
  /** A skipped person is no longer in the catalog: the warn toast, the draft drops the people. */
  | { kind: 'personGone' }
  /** A bug on our side: generic toast, a report, stays open. */
  | { kind: 'bug'; reason: string }
  /** The call failed: the warn toast, stays open. */
  | { kind: 'failed' };

export type SaveTonightDeps = {
  setSeatSkips: (args: {
    room_id: string;
    genre_ids?: number[];
    person_ids?: number[];
  }) => Promise<SetSeatSkipsResult>;
  setSeatPrefs: (args: { room_id: string; genre_ids: number[] }) => Promise<SetSeatPrefsResult>;
};

const sameSet = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Whether the draft differs from what the seat holds. */
export function tonightChanged(input: {
  picks: readonly number[];
  startPicks: readonly number[];
  skips: readonly number[];
  startSkips: readonly number[];
  people: readonly number[];
  startPeople: readonly number[];
}): boolean {
  return (
    !sameSet(input.picks, input.startPicks) ||
    !sameSet(input.skips, input.startSkips) ||
    !sameSet(input.people, input.startPeople)
  );
}

/**
 * Continue and Done: the skips first (saving the picks first would refuse a pick of a genre the
 * player has just unskipped), then the picks, each only when it changed. One skips call carries
 * the genre ids and the person ids that changed; a list left out stays as the seat holds it. A
 * skip-only change sends no `seat_updated` (the server's job).
 */
export async function saveTonight(
  input: {
    roomId: string;
    picks: number[];
    startPicks: number[];
    skips: number[];
    startSkips: number[];
    /** The skipped people's ids, in the order added. */
    people: number[];
    startPeople: number[];
  },
  deps: SaveTonightDeps,
): Promise<SaveTonightOutcome> {
  try {
    const genresChanged = !sameSet(input.skips, input.startSkips);
    const peopleChanged = !sameSet(input.people, input.startPeople);
    if (genresChanged || peopleChanged) {
      const answer = await deps.setSeatSkips({
        room_id: input.roomId,
        ...(genresChanged ? { genre_ids: input.skips } : {}),
        ...(peopleChanged ? { person_ids: input.people } : {}),
      });
      switch (answer.status) {
        case 'ok':
          break;
        case 'closed':
          return { kind: 'close' };
        case 'locked':
          return { kind: 'locked' };
        case 'room_limit':
          return { kind: 'roomLimit', max: answer.max };
        case 'unknown_genre':
          return { kind: 'stale' };
        case 'too_many':
          return { kind: 'bug', reason: `set_seat_skips:too_many:${answer.field}` };
        case 'unknown_person':
          return { kind: 'personGone' };
      }
    }
    if (!sameSet(input.picks, input.startPicks)) {
      const answer = await deps.setSeatPrefs({ room_id: input.roomId, genre_ids: input.picks });
      switch (answer.status) {
        case 'ok':
        case 'closed':
          return { kind: 'close' };
        case 'locked':
          return { kind: 'locked' };
        case 'unknown_genre':
          return { kind: 'stale' };
        case 'out_tonight':
          return { kind: 'pickOut' };
        case 'too_many':
          return { kind: 'bug', reason: 'set_seat_prefs:too_many' };
      }
    }
    return { kind: 'close' };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * The lobby row's skip count: this player's own skips, genres and people (from `skips`). Never
 * another seat's.
 */
export function ownSkipCount(skips: RoomGenresResult['skips'] | undefined): number {
  return skips ? skips.genre_ids.length + skips.people.length : 0;
}
