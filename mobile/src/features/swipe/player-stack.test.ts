import { stackCounts, stackLayout } from './player-stack';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe('stackLayout (swipe.md#the-player-stack)', () => {
  // The spec's table, per stack width: [spaced up to, overlapped up to, discs kept with "+N"].
  it.each([
    [167, 4, 6, 5],
    [185, 5, 7, 6],
    [222, 6, 8, 7],
  ])(
    'at %s points: spaced to %s, overlapped to %s, then %s discs and "+N"',
    (w, spaced, over, kept) => {
      for (let n = 1; n <= spaced; n++) {
        const layout = stackLayout(w, ids(n), 'p1');
        expect(layout).toMatchObject({ mode: 'spaced', hidden: 0 });
        expect(layout.visible).toHaveLength(n);
      }
      for (let n = spaced + 1; n <= over; n++) {
        const layout = stackLayout(w, ids(n), 'p1');
        expect(layout).toMatchObject({ mode: 'overlapped', hidden: 0 });
        expect(layout.visible).toHaveLength(n);
      }
      for (let n = over + 1; n <= 10; n++) {
        const layout = stackLayout(w, ids(n), 'p1');
        expect(layout.mode).toBe('overlapped');
        expect(layout.visible).toHaveLength(kept);
        expect(layout.hidden).toBe(n - kept);
      }
    },
  );

  it('hides the last seats in seat order', () => {
    expect(stackLayout(167, ids(8), 'p1').visible).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('never hides the own seat: it takes the last visible place', () => {
    const layout = stackLayout(167, ids(10), 'p9');
    expect(layout.visible).toEqual(['p1', 'p2', 'p3', 'p4', 'p9']);
    expect(layout.hidden).toBe(5);
  });

  it('keeps the own seat in place when it already shows', () => {
    expect(stackLayout(167, ids(10), 'p3').visible).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('shows nobody for an empty room and never fewer than one place', () => {
    expect(stackLayout(167, [], undefined)).toEqual({ mode: 'spaced', visible: [], hidden: 0 });
    expect(stackLayout(10, ids(3), 'p1').visible.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the order it is given, so nothing jumps when a seat changes state', () => {
    expect(stackLayout(185, ids(4), 'p2').visible).toEqual(ids(4));
  });
});

describe('stackCounts', () => {
  it('counts the others who are done and away, never the own seat', () => {
    const counts = stackCounts([
      { done: true, away: false, isMe: true },
      { done: true, away: false, isMe: false },
      { done: false, away: true, isMe: false },
      { done: false, away: false, isMe: false },
    ]);
    expect(counts).toEqual({ total: 4, done: 1, away: 1 });
  });
});
