import { recordServerTime, resetServerTime } from '@/lib/server-time';

import { announceSeconds, closeDelay, shownDeadline } from './countdown';

afterEach(resetServerTime);

describe('the shown deadline', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');

  it('is the server deadline when it is within 60 seconds', () => {
    expect(shownDeadline('2026-11-04T10:00:42Z', now)).toBe('2026-11-04T10:00:42.000Z');
  });

  it('never shows more than 60 seconds from the first read', () => {
    expect(shownDeadline('2026-11-04T10:05:00Z', now)).toBe('2026-11-04T10:01:00.000Z');
  });

  it('counts the cap on the server clock', () => {
    // This phone is 5 seconds behind the server.
    recordServerTime('2026-11-04T10:00:05Z', now, now);
    expect(shownDeadline('2026-11-04T10:05:00Z', now)).toBe('2026-11-04T10:01:05.000Z');
  });

  it('falls back to 60 seconds for an unreadable deadline', () => {
    expect(shownDeadline('nope', now)).toBe('2026-11-04T10:01:00.000Z');
  });
});

describe('the close call', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');

  it('goes out 2 seconds after the deadline', () => {
    expect(closeDelay('2026-11-04T10:00:10Z', now)).toBe(12_000);
  });

  it('goes out at once when the deadline and the grace are past', () => {
    expect(closeDelay('2026-11-03T10:00:10Z', now)).toBe(0);
  });
});

describe('screen reader announcements', () => {
  it('speaks at 30 and 10 seconds only', () => {
    expect(announceSeconds(30_000)).toBe(30);
    expect(announceSeconds(29_100)).toBe(30);
    expect(announceSeconds(10_000)).toBe(10);
    expect(announceSeconds(20_000)).toBeNull();
  });
});
