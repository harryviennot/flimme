import type {
  Genre,
  RoomGenresResult,
  SetSeatPrefsResult,
  SetSeatSkipsResult,
} from '@flimme/contract';

import {
  allGenreChips,
  GENRE_CAP,
  genreChips,
  genreSummary,
  outTonightSet,
  ownSkipCount,
  reconcileTonight,
  ROOM_OUT_GENRES_MAX,
  saveTonight,
  SKIP_GENRES_MAX,
  toggleGenre,
  toggleSkip,
  tonightChanged,
  type SaveTonightDeps,
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
  it('sorts by the name in the language, and skips ids with no known genre', () => {
    const chips = genreChips(options, genres, 'fr', [], []);
    expect(chips.map((c) => [c.id, c.name, c.count])).toEqual([
      [35, 'Comédie', 3],
      [18, 'Drama', 1],
      [27, 'Horreur', 0],
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

  it('leaves out a pick that is no longer offered', () => {
    expect(genreSummary(options, genres, 'en', [99, 35])).toEqual(['Comedy']);
  });

  it('is empty with no picks', () => {
    expect(genreSummary(options, genres, 'en', [])).toEqual([]);
  });
});

describe('toggleSkip (3 per player, 4 out for the room)', () => {
  it('skips a genre and takes it off the picks', () => {
    const next = toggleSkip({ picks: [35, 27], skips: [] }, 35, []);
    expect(next).toMatchObject({ picks: [27], skips: [35], pickMoved: true, capped: false });
  });

  it('frees a place in the 3 picks when a pick is skipped', () => {
    const next = toggleSkip({ picks: [35, 27, 18], skips: [] }, 18, []);
    expect(next.picks).toHaveLength(GENRE_CAP - 1);
  });

  it('does not report a moved pick for a genre that was not picked', () => {
    expect(toggleSkip({ picks: [35], skips: [] }, 27, []).pickMoved).toBe(false);
  });

  it('refuses a 4th skip of the player (capped), changing nothing', () => {
    const state = { picks: [], skips: [1, 2, 3] };
    expect(state.skips).toHaveLength(SKIP_GENRES_MAX);
    expect(toggleSkip(state, 4, [])).toMatchObject({ skips: [1, 2, 3], capped: true });
  });

  it('refuses a new skip when the room already has 4 out, counting the draft', () => {
    expect(ROOM_OUT_GENRES_MAX).toBe(4);
    expect(toggleSkip({ picks: [], skips: [] }, 9, [1, 2, 3, 4])).toMatchObject({
      skips: [],
      roomLimit: true,
    });
    // 3 out by others plus 1 of the draft's own is 4.
    expect(toggleSkip({ picks: [], skips: [5] }, 9, [1, 2, 3])).toMatchObject({ roomLimit: true });
    // The draft's own skip of a genre others hold too counts once.
    expect(toggleSkip({ picks: [], skips: [1] }, 9, [1, 2, 3])).toMatchObject({
      skips: [1, 9],
      roomLimit: false,
    });
  });

  it('always skips a genre that is already out', () => {
    expect(toggleSkip({ picks: [], skips: [] }, 4, [1, 2, 3, 4])).toMatchObject({
      skips: [4],
      roomLimit: false,
    });
    // Also when the room holds more than 4 (a seat rejoined with its skips).
    expect(toggleSkip({ picks: [], skips: [] }, 6, [1, 2, 3, 4, 5, 6]).skips).toEqual([6]);
  });

  it('unskips', () => {
    expect(toggleSkip({ picks: [], skips: [1, 2] }, 1, [])).toMatchObject({
      skips: [2],
      capped: false,
      roomLimit: false,
    });
  });
});

describe('outTonightSet', () => {
  it('is the room out plus the draft skips, once each', () => {
    expect(outTonightSet([1, 2], [2, 3]).sort()).toEqual([1, 2, 3]);
  });

  it('brings an unskipped genre back unless the room still holds it', () => {
    expect(outTonightSet([1], [])).toEqual([1]);
    expect(outTonightSet([], [])).toEqual([]);
  });
});

describe('reconcileTonight (a fresh room_genres read)', () => {
  it('drops a picked genre that went out and reports it', () => {
    expect(reconcileTonight({ picks: [35, 27], skips: [] }, [27])).toEqual({
      picks: [35],
      skips: [],
      removed: [27],
    });
  });

  it('is quiet when nothing picked went out', () => {
    expect(reconcileTonight({ picks: [35], skips: [] }, [27]).removed).toEqual([]);
  });

  it('keeps only the skips that are out after a room_limit', () => {
    expect(reconcileTonight({ picks: [], skips: [1, 2, 3] }, [1, 4, 5], true).skips).toEqual([1]);
  });
});

describe('allGenreChips and ownSkipCount', () => {
  it('lists every genre sorted by name, with no count', () => {
    expect(allGenreChips(genres, 'en').map((g) => g.name)).toEqual([
      'Comedy',
      'documentary',
      'Drama',
      'Horror',
    ]);
  });

  it("counts only this player's own skips, genres and people", () => {
    expect(ownSkipCount(undefined)).toBe(0);
    expect(ownSkipCount({ genre_ids: [1, 2], people: [{ id: 3, name: 'X' }] })).toBe(3);
  });
});

describe('saveTonight: skips first, only what changed, every answer an outcome', () => {
  type Skips = SetSeatSkipsResult | Error;
  type Prefs = SetSeatPrefsResult | Error;
  const run = async (
    skipsAnswer: Skips,
    prefsAnswer: Prefs,
    input: Partial<Parameters<typeof saveTonight>[0]> = {},
  ) => {
    const calls: string[] = [];
    const deps: SaveTonightDeps = {
      setSeatSkips: jest.fn(async () => {
        calls.push('skips');
        if (skipsAnswer instanceof Error) throw skipsAnswer;
        return skipsAnswer;
      }),
      setSeatPrefs: jest.fn(async () => {
        calls.push('prefs');
        if (prefsAnswer instanceof Error) throw prefsAnswer;
        return prefsAnswer;
      }),
    };
    const outcome = await saveTonight(
      { roomId: 'r1', picks: [35], startPicks: [], skips: [16], startSkips: [], ...input },
      deps,
    );
    return { outcome, calls, deps };
  };
  const ok = { status: 'ok' } as const;

  it('sends the skips, then the picks, genre ids only', async () => {
    const { outcome, calls, deps } = await run(ok, ok);
    expect(outcome).toEqual({ kind: 'close' });
    expect(calls).toEqual(['skips', 'prefs']);
    expect(deps.setSeatSkips).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [16] });
    expect(deps.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [35] });
  });

  it('sends only what changed', async () => {
    expect((await run(ok, ok, { skips: [16], startSkips: [16] })).calls).toEqual(['prefs']);
    expect((await run(ok, ok, { picks: [35], startPicks: [35] })).calls).toEqual(['skips']);
    const none = { picks: [], startPicks: [], skips: [], startSkips: [] };
    expect((await run(ok, ok, none)).calls).toEqual([]);
  });

  it('can clear every skip', async () => {
    const { deps } = await run(ok, ok, { skips: [], startSkips: [16] });
    expect(deps.setSeatSkips).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [] });
  });

  it('out_tonight on a pick: stay, read again (the skips were saved)', async () => {
    const { outcome, calls } = await run(ok, { status: 'out_tonight' });
    expect(outcome).toEqual({ kind: 'pickOut' });
    expect(calls).toEqual(['skips', 'prefs']);
  });

  it('room_limit on the skips: stops before the picks', async () => {
    const { outcome, calls } = await run({ status: 'room_limit', max: 4 }, ok);
    expect(outcome).toEqual({ kind: 'roomLimit', max: 4 });
    expect(calls).toEqual(['skips']);
  });

  it('locked and closed, on either call', async () => {
    expect((await run({ status: 'locked' }, ok)).outcome).toEqual({ kind: 'locked' });
    expect((await run(ok, { status: 'locked' })).outcome).toEqual({ kind: 'locked' });
    expect((await run({ status: 'closed' }, ok)).outcome).toEqual({ kind: 'close' });
    expect((await run(ok, { status: 'closed' })).outcome).toEqual({ kind: 'close' });
  });

  it('unknown_genre on either call: stale', async () => {
    expect((await run({ status: 'unknown_genre' }, ok)).outcome).toEqual({ kind: 'stale' });
    expect((await run(ok, { status: 'unknown_genre' })).outcome).toEqual({ kind: 'stale' });
  });

  it('too_many is a bug on our side', async () => {
    const skips: Skips = { status: 'too_many', field: 'genre_ids', max: 3 };
    expect((await run(skips, ok)).outcome).toEqual({
      kind: 'bug',
      reason: 'set_seat_skips:too_many:genre_ids',
    });
    const prefs: Prefs = { status: 'too_many', field: 'genre_ids', max: 3 };
    expect((await run(ok, prefs)).outcome).toEqual({
      kind: 'bug',
      reason: 'set_seat_prefs:too_many',
    });
  });

  it('a failed call keeps the step open', async () => {
    expect((await run(new Error('offline'), ok)).outcome).toEqual({ kind: 'failed' });
    expect((await run(ok, new Error('offline'))).outcome).toEqual({ kind: 'failed' });
  });

  it('tonightChanged compares sets', () => {
    const same = { picks: [1, 2], startPicks: [2, 1], skips: [3], startSkips: [3] };
    expect(tonightChanged(same)).toBe(false);
    expect(tonightChanged({ ...same, skips: [] })).toBe(true);
  });
});
