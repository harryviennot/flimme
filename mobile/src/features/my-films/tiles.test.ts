import type { MyFilmTile } from '@flimme/contract';

import i18n from '@/i18n';

import { badgeOf, emptyKind, gridState, mergePages, tileLabel, tileWidth } from './tiles';

const film = (id: number, extra: Partial<MyFilmTile> = {}): MyFilmTile => ({
  title_id: id,
  title: `Film ${id}`,
  year: 1995,
  poster_path: null,
  is_picked: false,
  is_super_liked: false,
  at: '2026-11-05T10:00:00Z',
  ...extra,
});

describe('mergePages', () => {
  it('keeps the order and shows a film once', () => {
    const merged = mergePages([{ films: [film(1), film(2)] }, { films: [film(2), film(3)] }]);
    expect(merged.map((f) => f.title_id)).toEqual([1, 2, 3]);
  });
});

describe('badgeOf', () => {
  it('Picked wins over the star', () => {
    expect(badgeOf('liked', film(1, { is_picked: true, is_super_liked: true }))).toBe('picked');
  });
  it('shows the star alone for a super like', () => {
    expect(badgeOf('liked', film(1, { is_super_liked: true }))).toBe('super');
  });
  it('shows nothing on a plain like, nor on any Seen tile', () => {
    expect(badgeOf('liked', film(1))).toBeNull();
    expect(badgeOf('seen', film(1, { is_picked: true, is_super_liked: true }))).toBeNull();
  });
});

describe('tileLabel', () => {
  const t = i18n.getFixedT('en', 'myFilms') as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  it('reads title, year and badge', () => {
    expect(tileLabel('liked', film(1, { title: 'Heat', is_picked: true }), t)).toBe(
      'Heat, 1995, picked on a movie night',
    );
    expect(tileLabel('liked', film(1, { title: 'Heat', is_super_liked: true }), t)).toBe(
      'Heat, 1995, super liked',
    );
  });
  it('is the title alone without a year', () => {
    expect(tileLabel('liked', film(1, { title: 'Heat', year: null }), t)).toBe('Heat');
  });
});

describe('emptyKind', () => {
  it('has a line per segment and chip', () => {
    expect(emptyKind('liked', 'all')).toBe('liked');
    expect(emptyKind('liked', 'friends')).toBe('friends');
    expect(emptyKind('liked', 'solo')).toBe('solo');
    expect(emptyKind('seen', 'solo')).toBe('seen');
  });
});

describe('gridState', () => {
  const base = { status: 'success', fetchStatus: 'idle', films: 3, online: true } as const;
  it('walks every state', () => {
    expect(gridState(base)).toBe('ready');
    expect(gridState({ ...base, films: 0 })).toBe('empty');
    expect(gridState({ ...base, status: 'pending', fetchStatus: 'fetching' })).toBe('loading');
    expect(gridState({ ...base, status: 'pending', fetchStatus: 'paused', online: false })).toBe(
      'offline',
    );
    expect(gridState({ ...base, status: 'error', films: 0 })).toBe('error');
    expect(gridState({ ...base, status: 'error', films: 0, online: false })).toBe('offline');
  });
  it('keeps pages already read when the phone goes offline', () => {
    expect(gridState({ ...base, online: false })).toBe('ready');
  });
});

describe('tileWidth', () => {
  it('fits three tiles and two gaps in the window minus the gutters', () => {
    expect(tileWidth(375)).toBe(109);
    expect(tileWidth(375) * 3 + 16 + 32).toBeLessThanOrEqual(375);
  });
});
