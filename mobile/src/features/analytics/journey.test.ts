import { JOIN_ROOM_ANSWERS } from '@flimme/contract';

import { ANALYTICS_EVENTS } from '@/lib/analytics-core';

import {
  joinStatus,
  msSinceLinkOpen,
  msSinceSwiping,
  rememberLinkJoin,
  roomSizeBucket,
} from './journey';

describe('the journey', () => {
  it('measures since the link only for the room the link led to', () => {
    rememberLinkJoin('r1', 1_000);
    expect(msSinceLinkOpen('r1', 4_500)).toBe(3_500);
    expect(msSinceLinkOpen('r2', 4_500)).toBeUndefined();
  });

  it('measures since swiping from the room, and says nothing when it is unknown', () => {
    const start = '2026-11-05T10:00:00.000Z';
    expect(msSinceSwiping(start, Date.parse(start) + 2_000)).toBe(2_000);
    expect(msSinceSwiping(null)).toBeUndefined();
    expect(msSinceSwiping('not a date')).toBeUndefined();
  });

  it('buckets the room size', () => {
    expect([1, 2, 3, 4, 5, 10].map(roomSizeBucket)).toEqual([
      '2',
      '2',
      '3_4',
      '3_4',
      '5_10',
      '5_10',
    ]);
  });

  it('knows every join answer the contract has, and calls a new one unknown', () => {
    const listed: readonly string[] = ANALYTICS_EVENTS['join:attempt_finish'].status;
    for (const answer of JOIN_ROOM_ANSWERS) expect(listed).toContain(answer);
    expect(joinStatus('full')).toBe('full');
    expect(joinStatus('something_new')).toBe('unknown');
  });
});
