import type { RoomSeat } from '@flimme/contract';

import {
  everyoneLocked,
  lockedCount,
  lockedInRow,
  mergeLocked,
  readProgressEvent,
  rowSeats,
} from './progress';

const seat = (id: string, joined: string, left: string | null = null) =>
  ({ member_id: id, joined_at: joined, left_at: left }) as RoomSeat;

const SEATS = [
  seat('c', '2026-11-04T10:00:02Z'),
  seat('a', '2026-11-04T10:00:00Z'),
  seat('b', '2026-11-04T10:00:00Z'),
  seat('z', '2026-11-04T10:00:01Z', '2026-11-04T10:05:00Z'),
];

describe('the lock-in row', () => {
  it('lists seats in seat order and leaves out seats that left', () => {
    expect(rowSeats(SEATS).map((s) => s.member_id)).toEqual(['a', 'b', 'c']);
  });

  it('counts locked seats still in the row, never more than of', () => {
    expect(lockedCount(['a', 'z'], rowSeats(SEATS), 3)).toBe(1);
    expect(lockedCount(['a', 'b', 'c'], rowSeats(SEATS), 2)).toBe(2);
    expect([...lockedInRow(['b', 'z'], rowSeats(SEATS))]).toEqual(['b']);
  });

  it('knows when everyone present has locked in', () => {
    expect(everyoneLocked(['a', 'b'], 3)).toBe(false);
    expect(everyoneLocked(['a', 'b', 'c'], 3)).toBe(true);
    expect(everyoneLocked([], 0)).toBe(false);
    expect(everyoneLocked(['a'], null)).toBe(false);
  });

  it('merges lock-ins, which only grow', () => {
    expect(mergeLocked(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('the round_progress event', () => {
  it('reads a good payload and refuses a bad one', () => {
    expect(readProgressEvent({ round_id: 'r', locked: ['a'], of: 2 })).toEqual({
      round_id: 'r',
      locked: ['a'],
      of: 2,
    });
    expect(readProgressEvent({ round_id: 'r', locked: 'a', of: 2 })).toBeNull();
    expect(readProgressEvent(null)).toBeNull();
  });
});
