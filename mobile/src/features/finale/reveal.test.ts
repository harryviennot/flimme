import {
  ballotCount,
  countUpValue,
  lineKey,
  pointsShow,
  readRevealEvent,
  revealFromViews,
  revealPlan,
  revealSoundStart,
  REVEAL_TADUM_MS,
  type RevealData,
} from './reveal';

const f = (titleId: number, seed: number, points: number, vetoed = false) => ({
  titleId,
  seed,
  points,
  vetoed,
});

const data = (over: Partial<RevealData> = {}): RevealData => ({
  winnerId: 1,
  reason: 'points',
  finalists: [f(1, 1, 30), f(2, 2, 20), f(3, 3, 10)],
  ...over,
});

describe('readRevealEvent', () => {
  const event = {
    title_id: 1,
    kind: 'finale',
    decided: true,
    likes: 2,
    of: 3,
    reason: 'points',
    finalists: [
      { title_id: 1, seed: 1, points: 6, vetoed: false },
      { title_id: 2, seed: 2, points: 0, vetoed: true },
    ],
  };

  it('reads a finale result with finalists', () => {
    expect(readRevealEvent(event)).toEqual({
      winnerId: 1,
      reason: 'points',
      finalists: [f(1, 1, 6), f(2, 2, 0, true)],
    });
  });

  it('ignores the single-film pick, other kinds and undecided results', () => {
    expect(readRevealEvent({ ...event, reason: 'only_film', finalists: undefined })).toBeNull();
    expect(readRevealEvent({ ...event, kind: 'unanimous' })).toBeNull();
    expect(readRevealEvent({ ...event, decided: false })).toBeNull();
    expect(readRevealEvent({ ...event, finalists: [] })).toBeNull();
    expect(readRevealEvent(null)).toBeNull();
  });

  it('reads an unknown reason as none', () => {
    expect(readRevealEvent({ ...event, reason: 'mystery' })?.reason).toBeNull();
  });
});

describe('revealFromViews (a missed reveal)', () => {
  const round = { winner_title_id: 1 };
  const row = (title_id: number, seed: number, points: number, vetoed: boolean | null) => ({
    title_id,
    seed,
    points,
    vetoed,
  });

  it('works the reason out: one film left with a knock-out is only_unvetoed', () => {
    const d = revealFromViews(round, [row(1, 1, 0, false), row(2, 2, 0, true), row(3, 3, 0, true)]);
    expect(d?.reason).toBe('only_unvetoed');
  });

  it('every point 0 and nothing knocked out is no_ballots', () => {
    const d = revealFromViews(round, [row(1, 1, 0, null), row(2, 2, 0, false)]);
    expect(d?.reason).toBe('no_ballots');
    expect(d?.finalists.every((x) => !x.vetoed)).toBe(true);
  });

  it('anything else is points, in seed order', () => {
    const d = revealFromViews(round, [row(2, 2, 4, false), row(1, 1, 6, false)]);
    expect(d?.reason).toBe('points');
    expect(d?.finalists.map((x) => x.titleId)).toEqual([1, 2]);
  });

  it('has no reveal without a winner or candidates', () => {
    expect(revealFromViews({ winner_title_id: null }, [row(1, 1, 0, false)])).toBeNull();
    expect(revealFromViews(round, [])).toBeNull();
  });
});

describe('the points', () => {
  it('counts the ballots from the points of the films still in', () => {
    // 4 films, 10 ballots: 10 + 9 + ... = 10 * 10 = 100 points in total
    expect(ballotCount([f(1, 1, 40), f(2, 2, 30), f(3, 3, 20), f(4, 4, 10)])).toBe(10);
    // a knocked-out film's points do not count; 2 films in, 3 ballots: 3 * 3 = 9
    expect(ballotCount([f(1, 1, 6), f(2, 2, 3), f(3, 3, 0, true)])).toBe(3);
  });

  it('shows only for reason points, 2 films in and 3 ballots', () => {
    expect(pointsShow(data())).toBe(true);
    expect(pointsShow(data({ reason: 'only_unvetoed' }))).toBe(false);
    expect(pointsShow(data({ reason: 'no_ballots' }))).toBe(false);
    // 2 ballots over 3 films: 12 points -> 2 ballots
    expect(pointsShow(data({ finalists: [f(1, 1, 6), f(2, 2, 4), f(3, 3, 2)] }))).toBe(false);
    // a 2 player room: 2 ballots
    expect(pointsShow(data({ finalists: [f(1, 1, 4), f(2, 2, 2)] }))).toBe(false);
    // one film in
    expect(pointsShow(data({ finalists: [f(1, 1, 9), f(2, 2, 0, true)] }))).toBe(false);
  });
});

describe('the line', () => {
  it('picks one line per reason', () => {
    expect(lineKey(data())).toBe('points');
    expect(lineKey(data({ reason: 'only_unvetoed' }))).toBe('onlyUnvetoed');
    expect(lineKey(data({ reason: 'no_ballots' }))).toBe('noBallots');
  });

  it('says tie only when the points show and the top two are level', () => {
    expect(lineKey(data({ finalists: [f(1, 1, 20), f(2, 2, 20), f(3, 3, 10)] }))).toBe('tie');
    // fewer than 3 ballots: no points, so never the tie line
    expect(lineKey(data({ finalists: [f(1, 1, 3), f(2, 2, 3)] }))).toBe('points');
  });

  it('has no line for an unknown reason without points', () => {
    expect(lineKey(data({ reason: null, finalists: [f(1, 1, 3), f(2, 2, 3)] }))).toBeNull();
    expect(lineKey(data({ reason: null }))).toBe('points');
  });
});

describe('revealPlan', () => {
  it('times each case as the spec does', () => {
    expect(
      revealPlan(
        data({
          reason: 'only_unvetoed',
          finalists: [f(1, 1, 0), f(2, 2, 0, true), f(3, 3, 0, true)],
        }),
      ),
    ).toEqual({
      knockouts: 300,
      points: null,
      winner: 800,
      handOver: 3300,
    });
    expect(
      revealPlan(data({ finalists: [f(1, 1, 40), f(2, 2, 30), f(3, 3, 20), f(4, 4, 10, false)] })),
    ).toEqual({ knockouts: null, points: 300, winner: 1300, handOver: 3800 });
    expect(
      revealPlan(
        data({
          finalists: [f(1, 1, 30), f(2, 2, 20), f(3, 3, 10), f(4, 4, 0, true)],
        }),
      ),
    ).toEqual({ knockouts: 300, points: 800, winner: 1800, handOver: 4300 });
    expect(revealPlan(data({ reason: 'no_ballots' }))).toEqual({
      knockouts: null,
      points: null,
      winner: 300,
      handOver: 2800,
    });
  });
});

describe('countUpValue', () => {
  it('starts at 0, lands on the total and steps', () => {
    expect(countUpValue(0, 40)).toBe(0);
    expect(countUpValue(1, 40)).toBe(40);
    expect(countUpValue(2, 40)).toBe(40);
    expect(Number.isInteger(countUpValue(0.37, 40))).toBe(true);
  });
});

describe('the reveal with 2 films', () => {
  it('shows points only from 3 ballots, never knock-outs, and says top of swipes with none', () => {
    expect(pointsShow(data({ finalists: [f(1, 1, 6), f(2, 2, 3)] }))).toBe(true);
    expect(pointsShow(data({ finalists: [f(1, 1, 4), f(2, 2, 2)] }))).toBe(false);
    expect(pointsShow(data({ finalists: [f(1, 1, 2), f(2, 2, 1)] }))).toBe(false);
    expect(lineKey(data({ reason: 'no_ballots', finalists: [f(1, 1, 0), f(2, 2, 0)] }))).toBe(
      'noBallots',
    );
  });

  it('is read again from the candidates as points, or no ballots', () => {
    const row = (title_id: number, seed: number, points: number) => ({
      title_id,
      seed,
      points,
      vetoed: false,
    });
    expect(revealFromViews({ winner_title_id: 1 }, [row(1, 1, 6), row(2, 2, 3)])?.reason).toBe(
      'points',
    );
    expect(revealFromViews({ winner_title_id: 1 }, [row(1, 1, 0), row(2, 2, 0)])?.reason).toBe(
      'no_ballots',
    );
  });
});

describe('revealSoundStart', () => {
  it('starts the sound so its ta-dum lands on the winner, in the three cases', () => {
    expect(REVEAL_TADUM_MS).toBe(894);
    // Knock-outs and points: the winner lifts at 1.8 s.
    expect(
      revealSoundStart(
        revealPlan(data({ finalists: [f(1, 1, 30), f(2, 2, 20), f(3, 3, 10), f(4, 4, 0, true)] })),
      ),
    ).toBe(906);
    // Points, no knock-outs: 1.3 s.
    expect(
      revealSoundStart(
        revealPlan(data({ finalists: [f(1, 1, 40), f(2, 2, 30), f(3, 3, 20), f(4, 4, 10)] })),
      ),
    ).toBe(406);
    // Knock-outs, no points: 0.8 s, so the sound starts at Clear.
    expect(
      revealSoundStart(
        revealPlan(
          data({
            reason: 'only_unvetoed',
            finalists: [f(1, 1, 0), f(2, 2, 0, true), f(3, 3, 0, true)],
          }),
        ),
      ),
    ).toBe(0);
  });
});
