import type { RoomSeat } from '@flimme/contract';

import { isHostSeat, nextRoomOf, offerHostOf, winnerFooterOf } from './offer';

jest.mock('@/features/profile', () => ({ toAvatarColor: () => 'teal' }));

const seat = (over: Partial<RoomSeat>): RoomSeat =>
  ({
    member_id: 'm1',
    display_name: 'Harry',
    avatar_key: 'teal',
    role: 'guest',
    is_me: false,
    left_at: null,
    ...over,
  }) as RoomSeat;

describe('nextRoomOf', () => {
  it('needs both the id and the code', () => {
    expect(nextRoomOf({ next_room_id: 'r2', next_room_code: '123456' })).toEqual({
      roomId: 'r2',
      code: '123456',
    });
    expect(nextRoomOf({ next_room_id: 'r2', next_room_code: null })).toBeNull();
    expect(nextRoomOf(null)).toBeNull();
  });
});

describe('offerHostOf', () => {
  it('names the host from the seat list, seats that left included', () => {
    const seats = [seat({ left_at: '2026-11-05T10:00:00Z' })];
    expect(offerHostOf(seats, 'm1')).toEqual({ kind: 'named', name: 'Harry', color: 'teal' });
  });
  it('knows its own seat', () => {
    expect(offerHostOf([seat({ is_me: true })], 'm1')).toEqual({ kind: 'self' });
  });
  it('has no name without an event or without the seat', () => {
    expect(offerHostOf([seat({})], null)).toEqual({ kind: 'unknown' });
    expect(offerHostOf([seat({})], 'zz')).toEqual({ kind: 'unknown' });
  });
});

describe('isHostSeat', () => {
  it('is the host seat that has not left', () => {
    expect(isHostSeat([seat({ is_me: true, role: 'host' })])).toBe(true);
    expect(isHostSeat([seat({ is_me: true, role: 'guest' })])).toBe(false);
    expect(isHostSeat([seat({ is_me: true, role: 'host', left_at: 'x' })])).toBe(false);
    expect(isHostSeat(undefined)).toBe(false);
  });
});

describe('winnerFooterOf', () => {
  const next = { roomId: 'r2', code: '123456' };
  it('shows Play again to the host, pick or not', () => {
    expect(winnerFooterOf({ solo: false, next: null, host: true, hidden: false })).toBe(
      'play-again',
    );
  });
  it('never shows it to a guest, in solo, or once hidden', () => {
    expect(winnerFooterOf({ solo: false, next: null, host: false, hidden: false })).toBeNull();
    expect(winnerFooterOf({ solo: true, next: null, host: true, hidden: false })).toBeNull();
    expect(winnerFooterOf({ solo: false, next: null, host: true, hidden: true })).toBeNull();
  });
  it('replaces it with the offer on every phone, the host included', () => {
    expect(winnerFooterOf({ solo: false, next, host: true, hidden: false })).toBe('offer');
    expect(winnerFooterOf({ solo: false, next, host: false, hidden: false })).toBe('offer');
    expect(winnerFooterOf({ solo: true, next, host: false, hidden: false })).toBeNull();
  });
});
