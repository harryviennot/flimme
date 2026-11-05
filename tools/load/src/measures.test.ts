import { describe, expect, it } from 'vitest';

import { createLedger } from './ledger';
import { createMatchTracker } from './match-tracker';
import { planRooms } from './ramp';
import { percentile, summarize } from './stats';

describe('percentile', () => {
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  it('uses the nearest rank', () => {
    expect(percentile(hundred, 50)).toBe(50);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile(hundred, 100)).toBe(100);
  });
  it('does not depend on the order and does not change the input', () => {
    const values = [30, 10, 20];
    expect(percentile(values, 50)).toBe(20);
    expect(values).toEqual([30, 10, 20]);
  });
  it('has no answer for an empty list', () => {
    expect(percentile([], 95)).toBeNull();
    expect(summarize([])).toEqual({ count: 0, p50: null, p95: null, max: null });
  });
  it('summarizes', () => {
    expect(summarize([5, 1, 3])).toEqual({ count: 3, p50: 3, p95: 5, max: 5 });
  });
});

describe('planRooms', () => {
  it('starts the rooms evenly over the ramp', () => {
    const plan = planRooms({ rooms4: 45, rooms10: 5, rampMs: 300_000 });
    expect(plan).toHaveLength(50);
    expect(plan[0]!.startAtMs).toBe(0);
    expect(plan[1]!.startAtMs).toBe(6000);
    expect(plan[49]!.startAtMs).toBe(294_000);
  });
  it('spreads the big rooms through the ramp', () => {
    const plan = planRooms({ rooms4: 45, rooms10: 5, rampMs: 300_000 });
    expect(plan.filter((room) => room.size === 10)).toHaveLength(5);
    expect(plan.filter((room) => room.size === 4)).toHaveLength(45);
    const bigAt = plan.map((room, i) => (room.size === 10 ? i : -1)).filter((i) => i >= 0);
    expect(bigAt[0]).toBeLessThan(10);
    expect(bigAt[4]).toBeGreaterThan(39);
  });
  it('starts a single room at once and an empty plan has no rooms', () => {
    expect(planRooms({ rooms4: 1, rooms10: 0, rampMs: 60_000 })).toEqual([
      { size: 4, startAtMs: 0 },
    ]);
    expect(planRooms({ rooms4: 0, rooms10: 0, rampMs: 60_000 })).toEqual([]);
  });
});

describe('vote ledger', () => {
  it('finds nothing wrong when the counts match', () => {
    const ledger = createLedger();
    ledger.voteAnswered('a', 1, 'ok');
    ledger.voteAnswered('a', 2, 'ok');
    ledger.voteAnswered('b', 1, 'ok');
    expect(ledger.compare({ a: 2, b: 1 })).toEqual({ lost: 0, duplicated: 0, seats: 2 });
  });
  it('finds a lost vote: answered ok, missing from the counts', () => {
    const ledger = createLedger();
    ledger.voteAnswered('a', 1, 'ok');
    ledger.voteAnswered('a', 2, 'ok');
    expect(ledger.compare({ a: 1 })).toEqual({ lost: 1, duplicated: 0, seats: 1 });
    expect(ledger.compare({})).toEqual({ lost: 2, duplicated: 0, seats: 1 });
  });
  it('finds a duplicated vote: more rows than answers', () => {
    const ledger = createLedger();
    ledger.voteAnswered('a', 1, 'ok');
    expect(ledger.compare({ a: 3 })).toEqual({ lost: 0, duplicated: 2, seats: 1 });
  });
  it('finds a film answered ok twice for one seat', () => {
    const ledger = createLedger();
    ledger.voteAnswered('a', 1, 'ok');
    ledger.voteAnswered('a', 1, 'ok');
    expect(ledger.compare({ a: 1 })).toEqual({ lost: 0, duplicated: 1, seats: 1 });
  });
  it('ignores answers that are not ok, and takes an undone vote back', () => {
    const ledger = createLedger();
    ledger.voteAnswered('a', 1, 'duplicate');
    ledger.voteAnswered('a', 2, 'closed');
    ledger.voteAnswered('a', 3, 'ok');
    ledger.undone('a', 3);
    ledger.voteAnswered('a', 3, 'ok');
    expect(ledger.compare({ a: 1 })).toEqual({ lost: 0, duplicated: 0, seats: 1 });
  });
  it('exports and reloads the expected counts', () => {
    const ledger = createLedger();
    ledger.voteAnswered('a', 1, 'ok');
    expect(ledger.expected()).toEqual({ a: 1 });
  });
});

describe('match tracker', () => {
  it('measures the other seats, from the answer to the event', () => {
    const tracker = createMatchTracker();
    tracker.eventSeen('r1', 7, 'b', 1100);
    tracker.voteAnswered('r1', 7, 'a', 1000);
    tracker.eventSeen('r1', 7, 'c', 1250);
    tracker.eventSeen('r1', 7, 'a', 1005);
    expect(tracker.samples()).toEqual([100, 250]);
  });
  it('counts an event that came before the answer as instant', () => {
    const tracker = createMatchTracker();
    tracker.eventSeen('r1', 7, 'b', 990);
    tracker.voteAnswered('r1', 7, 'a', 1000);
    expect(tracker.samples()).toEqual([0]);
  });
  it('counts a seat once per film: the Final Cut repeats the match later', () => {
    const tracker = createMatchTracker();
    tracker.voteAnswered('r1', 7, 'a', 1000);
    tracker.eventSeen('r1', 7, 'b', 1100);
    tracker.eventSeen('r1', 7, 'b', 31_000);
    expect(tracker.samples()).toEqual([100]);
  });
  it('forgets a room', () => {
    const tracker = createMatchTracker();
    tracker.voteAnswered('r1', 7, 'a', 1000);
    tracker.forgetRoom('r1');
    tracker.eventSeen('r1', 7, 'b', 1100);
    expect(tracker.samples()).toEqual([]);
  });
});
