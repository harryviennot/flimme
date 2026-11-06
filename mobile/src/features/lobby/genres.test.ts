import type { Genre, RoomGenresResult, SetSeatPrefsResult } from '@flimme/contract';

import {
  GENRE_CAP,
  genreChips,
  genreSummary,
  saveGenres,
  toggleGenre,
  type SaveGenresDeps,
} from './genres';

const genres: Genre[] = [
  { id: 35, slug: 'comedy', names: { fr: 'Comédie', en: 'Comedy' } },
  { id: 27, slug: 'horror', names: { fr: 'Horreur', en: 'Horror' } },
  { id: 18, slug: 'drama', names: { en: 'Drama' } },
  { id: 99, slug: 'documentary', names: {} },
];
const options: RoomGenresResult['options'] = [
  { genre_id: 35, count: 3 },
  { genre_id: 27, count: 0 },
  { genre_id: 18, count: 1 },
  { genre_id: 12345, count: 2 },
];

describe('toggleGenre (the cap is 3)', () => {
  it('adds and removes a pick', () => {
    expect(toggleGenre([35], 27)).toEqual({ selection: [35, 27], capped: false });
    expect(toggleGenre([35, 27], 35)).toEqual({ selection: [27], capped: false });
  });

  it('stops a 4th pick with a note, not an error, and keeps the selection', () => {
    const full = [35, 27, 18];
    expect(full).toHaveLength(GENRE_CAP);
    expect(toggleGenre(full, 99)).toEqual({ selection: full, capped: true });
  });

  it('still lets a full selection drop a pick', () => {
    expect(toggleGenre([35, 27, 18], 27)).toEqual({ selection: [35, 18], capped: false });
  });
});

describe('genreChips', () => {
  it('keeps the server order, names in the language, and skips ids with no known genre', () => {
    const chips = genreChips(options, genres, 'fr', [], []);
    expect(chips.map((c) => [c.id, c.name, c.count])).toEqual([
      [35, 'Comédie', 3],
      [27, 'Horreur', 0],
      [18, 'Drama', 1],
    ]);
  });

  it('falls back to English, then the slug', () => {
    const chips = genreChips([{ genre_id: 99, count: 1 }], genres, 'fr', [], []);
    expect(chips[0]?.name).toBe('documentary');
  });

  it('counts your own unsaved pick at once, and never counts it twice once saved', () => {
    // Saved: 35 is yours and counted. Unsaved: you add 27 and drop 35.
    const chips = genreChips(options, genres, 'en', [27], [35]);
    expect(chips.find((c) => c.id === 35)?.count).toBe(2);
    expect(chips.find((c) => c.id === 27)?.count).toBe(1);
    expect(chips.find((c) => c.id === 18)?.count).toBe(1);
    expect(chips.find((c) => c.id === 35)?.selected).toBe(false);
    expect(chips.find((c) => c.id === 27)?.selected).toBe(true);
  });

  it('never goes under zero', () => {
    const chips = genreChips([{ genre_id: 35, count: 0 }], genres, 'en', [], [35]);
    expect(chips[0]?.count).toBe(0);
  });
});

describe('genreSummary', () => {
  it('names your picks that are still offered, in the order offered', () => {
    expect(genreSummary(options, genres, 'en', [18, 35])).toEqual(['Comedy', 'Drama']);
  });

  it('is empty with no picks', () => {
    expect(genreSummary(options, genres, 'en', [])).toEqual([]);
  });
});

describe('saveGenres: every answer has an outcome', () => {
  const run = async (
    answer: SetSeatPrefsResult | Error,
    selection = [35],
    start: number[] = [],
  ) => {
    const setSeatPrefs = jest.fn(async (_args: { room_id: string; genre_ids: number[] }) => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    const deps: SaveGenresDeps = { setSeatPrefs };
    const outcome = await saveGenres({ roomId: 'r1', selection, start }, deps);
    return { outcome, setSeatPrefs };
  };

  it('sends only genre ids and closes on ok', async () => {
    const { outcome, setSeatPrefs } = await run({ status: 'ok' });
    expect(outcome).toEqual({ kind: 'close' });
    expect(setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [35] });
  });

  it('sends nothing when the picks did not change', async () => {
    const { outcome, setSeatPrefs } = await run({ status: 'ok' }, [35, 27], [27, 35]);
    expect(outcome).toEqual({ kind: 'close' });
    expect(setSeatPrefs).not.toHaveBeenCalled();
  });

  it('can clear every pick', async () => {
    const { setSeatPrefs } = await run({ status: 'ok' }, [], [35]);
    expect(setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [] });
  });

  it('locked: the game started, close and say the picks are fixed', async () => {
    expect((await run({ status: 'locked' })).outcome).toEqual({ kind: 'locked' });
  });

  it('closed: the room is over, close and let the layout follow', async () => {
    expect((await run({ status: 'closed' })).outcome).toEqual({ kind: 'close' });
  });

  it('unknown_genre: the offer changed, stay open and read it again', async () => {
    expect((await run({ status: 'unknown_genre' })).outcome).toEqual({ kind: 'stale' });
  });

  it('too_many is a bug on our side (the sheet stops a 4th pick)', async () => {
    const answer: SetSeatPrefsResult = { status: 'too_many', field: 'genre_ids', max: 3 };
    expect((await run(answer)).outcome).toEqual({
      kind: 'bug',
      reason: 'set_seat_prefs:too_many',
    });
  });

  it('a failed call keeps the sheet open', async () => {
    expect((await run(new Error('offline'))).outcome).toEqual({ kind: 'failed' });
  });
});
