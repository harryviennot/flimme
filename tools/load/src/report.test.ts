import { describe, expect, it } from 'vitest';

import { buildReport, evaluateTargets, type Measures } from './report';

const good: Measures = {
  castVoteMs: [100, 120, 200],
  matchMs: [200, 400, 800],
  fallbackDeals: 0,
  lost: null,
  duplicated: null,
  castVoteErrors: 0,
};

const statusOf = (measures: Measures, name: string) =>
  evaluateTargets(measures).find((line) => line.name.includes(name))!.status;

describe('evaluateTargets', () => {
  it('passes when the numbers are inside the targets', () => {
    expect(statusOf(good, 'cast_vote')).toBe('pass');
    expect(statusOf(good, 'A match reaching')).toBe('pass');
    expect(statusOf(good, 'Fallback deals')).toBe('pass');
  });
  it('fails when a p95 is over its target', () => {
    expect(statusOf({ ...good, castVoteMs: [100, 400, 900] }, 'cast_vote')).toBe('fail');
    expect(statusOf({ ...good, matchMs: [1500, 1600] }, 'A match reaching')).toBe('fail');
  });
  it('treats exactly the target as a miss: the bound is "under"', () => {
    expect(statusOf({ ...good, castVoteMs: [300] }, 'cast_vote')).toBe('fail');
    expect(statusOf({ ...good, matchMs: [1000] }, 'A match reaching')).toBe('fail');
  });
  it('fails on a fallback deal and on a vote error', () => {
    expect(statusOf({ ...good, fallbackDeals: 1 }, 'Fallback deals')).toBe('fail');
  });
  it('says no data when nothing was measured, never pass', () => {
    expect(statusOf({ ...good, castVoteMs: [] }, 'cast_vote')).toBe('no data');
    expect(statusOf({ ...good, matchMs: [] }, 'A match reaching')).toBe('no data');
  });
  it('reads lost and duplicated votes as by hand until counts are compared', () => {
    expect(statusOf(good, 'Lost or duplicated')).toBe('by hand');
    expect(statusOf({ ...good, lost: 0, duplicated: 0 }, 'Lost or duplicated')).toBe('pass');
    expect(statusOf({ ...good, lost: 1, duplicated: 0 }, 'Lost or duplicated')).toBe('fail');
    expect(statusOf({ ...good, lost: 0, duplicated: 2 }, 'Lost or duplicated')).toBe('fail');
  });
  it('leaves the targets it cannot measure to be read by hand, with where to read them', () => {
    const lines = evaluateTargets(good);
    for (const name of ['internal.deck_candidates', 'A deal from', 'Database CPU', 'New Sentry']) {
      const line = lines.find((l) => l.name.includes(name))!;
      expect(line.status).toBe('by hand');
      expect(line.how.length).toBeGreaterThan(10);
    }
  });
});

describe('buildReport', () => {
  const input = {
    date: '2026-11-05',
    scenario: {
      rooms4: 3,
      rooms10: 1,
      rampMs: 60_000,
      durationMs: 300_000,
      bots: 22,
      swipeMs: 3000,
      likeRate: 0.3,
      target: 'staging',
    },
    ramp: 'rooms started over 60s',
    rooms: {
      started: 4,
      cycles: 9,
      picks: 7,
      noPicks: 1,
      abandoned: 1,
      timeToPickMs: [40_000, 60_000],
    },
    measures: good,
    startGameMs: [300, 500],
    since: '2026-11-05T10:00:00Z',
  };
  it('lists the scenario, the numbers and a line per target', () => {
    const text = buildReport(input);
    expect(text).toContain('# Load run 2026-11-05');
    expect(text).toContain('22 bots');
    expect(text).toContain('| `cast_vote` round trip, p95');
    expect(text).toContain('PASS');
    expect(text).toContain('read by hand');
    expect(text).toContain('select');
  });
  it('carries no email, id or room code', () => {
    const text = buildReport(input);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
