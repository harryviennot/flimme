import type { RoomMatch, RoomRound } from '@flimme/contract';

import { isOnlyFilmPick, pickOf } from './pick';

const row = (over: Partial<RoomMatch>): RoomMatch => ({
  room_id: 'r1',
  title_id: 1,
  kind: 'unanimous',
  like_count: 3,
  present_count: 3,
  pick_order: null,
  created_at: '2026-11-04T10:00:00Z',
  ...over,
});
const round = { id: 'x', room_id: 'r1', seq: 1 } as RoomRound;

describe('pickOf', () => {
  it('finds the row with pick_order 1, whatever its kind', () => {
    for (const kind of ['unanimous', 'majority', 'finale'] as const) {
      const pick = row({ title_id: 9, kind, pick_order: 1 });
      expect(pickOf([row({ title_id: 2 }), pick])).toBe(pick);
    }
  });

  it('is null with no pick_order 1 row, or no rows at all', () => {
    expect(pickOf([row({}), row({ title_id: 2, pick_order: 2 })])).toBeNull();
    expect(pickOf([])).toBeNull();
    expect(pickOf(undefined)).toBeNull();
  });
});

describe('isOnlyFilmPick', () => {
  it('is true for a finale pick in a room with no round', () => {
    expect(isOnlyFilmPick(row({ kind: 'finale', pick_order: 1 }), [])).toBe(true);
  });

  it('is false when the finale had a round', () => {
    expect(isOnlyFilmPick(row({ kind: 'finale', pick_order: 1 }), [round])).toBe(false);
  });

  it('is false for a match, whatever the rounds', () => {
    expect(isOnlyFilmPick(row({ kind: 'unanimous', pick_order: 1 }), [])).toBe(false);
    expect(isOnlyFilmPick(row({ kind: 'majority', pick_order: 1 }), [])).toBe(false);
  });

  it('is false while the rounds are not known yet, or without a pick', () => {
    expect(isOnlyFilmPick(row({ kind: 'finale', pick_order: 1 }), undefined)).toBe(false);
    expect(isOnlyFilmPick(null, [])).toBe(false);
  });
});
