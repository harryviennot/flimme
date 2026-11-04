import type { RoomSeat } from '@flimme/contract';

import { doneNames, pillsFor } from './pills';

function seat(id: string, joined: number, extra: Partial<RoomSeat> = {}): RoomSeat {
  return {
    member_id: id,
    display_name: id.toUpperCase(),
    avatar_key: 'blue',
    role: 'guest',
    joined_at: new Date(joined).toISOString(),
    left_at: null,
    swipe_count: 0,
    is_me: false,
    ...extra,
  } as RoomSeat;
}

const none = { online: new Set<string>(), away: new Set<string>(), progress: new Map() };

describe('pillsFor', () => {
  it('lists seats in join order, hides those who left, and crowns the host', () => {
    const seats = [
      seat('b', 2),
      seat('a', 1, { role: 'host' }),
      seat('c', 3, { left_at: new Date(5).toISOString() }),
    ];
    const pills = pillsFor({ seats, ...none, myId: 'b', myCount: 0, myDone: false });
    expect(pills.map((p) => p.memberId)).toEqual(['a', 'b']);
    expect(pills.map((p) => p.isHost)).toEqual([true, false]);
    expect(pills.map((p) => p.isMe)).toEqual([false, true]);
  });

  it('takes the own count from the phone and the others from presence, else from the seat', () => {
    const seats = [
      seat('a', 1, { swipe_count: 3 }),
      seat('b', 2, { swipe_count: 3 }),
      seat('c', 3, { swipe_count: 7 }),
    ];
    const progress = new Map([['b', { swipe_count: 10, done: false }]]);
    const pills = pillsFor({
      seats,
      online: new Set(['a', 'b']),
      away: new Set<string>(),
      progress,
      myId: 'a',
      myCount: 4,
      myDone: false,
    });
    expect(pills.map((p) => p.count)).toEqual([4, 10, 7]);
  });

  it('marks online, away and done seats', () => {
    const seats = [seat('a', 1), seat('b', 2), seat('c', 3)];
    const pills = pillsFor({
      seats,
      online: new Set(['a', 'b']),
      away: new Set(['c']),
      progress: new Map([['b', { swipe_count: 20, done: true }]]),
      myId: 'a',
      myCount: 0,
      myDone: false,
    });
    expect(pills.map((p) => [p.online, p.away, p.done])).toEqual([
      [true, false, false],
      [true, false, true],
      [false, true, false],
    ]);
  });
});

describe('doneNames', () => {
  it('names the other seats that are done, and not the own', () => {
    const seats = [seat('a', 1), seat('b', 2), seat('c', 3)];
    const pills = pillsFor({
      seats,
      ...none,
      progress: new Map([
        ['b', { swipe_count: 20, done: true }],
        ['c', { swipe_count: 20, done: true }],
      ]),
      myId: 'c',
      myCount: 20,
      myDone: true,
    });
    expect(doneNames(pills)).toEqual(['B']);
  });
});
