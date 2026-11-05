import {
  ballotToSend,
  EMPTY_BALLOT,
  placesOf,
  pressFinalist,
  tapFinalist,
  tapPick,
  vetoAllowed,
} from './ballot';

const SEEDS = [10, 20, 30, 40];

describe('ranking by tapping', () => {
  it('ranks posters in tap order', () => {
    let ballot = tapFinalist(EMPTY_BALLOT, 30);
    ballot = tapFinalist(ballot, 10);
    expect(placesOf(SEEDS, ballot).get(30)).toEqual({ kind: 'ranked', rank: 1 });
    expect(placesOf(SEEDS, ballot).get(10)).toEqual({ kind: 'ranked', rank: 2 });
  });

  it('shows faint numbers on untapped posters: the rest in seed order after the tapped', () => {
    const places = placesOf(SEEDS, tapFinalist(EMPTY_BALLOT, 30));
    expect(places.get(30)).toEqual({ kind: 'ranked', rank: 1 });
    expect(places.get(10)).toEqual({ kind: 'faint', rank: 2 });
    expect(places.get(20)).toEqual({ kind: 'faint', rank: 3 });
    expect(places.get(40)).toEqual({ kind: 'faint', rank: 4 });
  });

  it('takes a number off on a second tap and closes the gap', () => {
    let ballot = EMPTY_BALLOT;
    for (const id of [10, 20, 30]) ballot = tapFinalist(ballot, id);
    ballot = tapFinalist(ballot, 10);
    const places = placesOf(SEEDS, ballot);
    expect(places.get(20)).toEqual({ kind: 'ranked', rank: 1 });
    expect(places.get(30)).toEqual({ kind: 'ranked', rank: 2 });
    expect(places.get(10)).toEqual({ kind: 'faint', rank: 3 });
  });

  it('shows every badge solid when all are tapped', () => {
    let ballot = EMPTY_BALLOT;
    for (const id of SEEDS) ballot = tapFinalist(ballot, id);
    expect([...placesOf(SEEDS, ballot).values()].every((p) => p.kind === 'ranked')).toBe(true);
  });
});

describe('the ballot sent', () => {
  it('is the seed order when nothing was tapped', () => {
    expect(ballotToSend(SEEDS, EMPTY_BALLOT)).toEqual({ ranking: SEEDS });
  });

  it('is the tapped films in tap order, then the rest in seed order', () => {
    const ballot = tapFinalist(tapFinalist(EMPTY_BALLOT, 40), 20);
    expect(ballotToSend(SEEDS, ballot)).toEqual({ ranking: [40, 20, 10, 30] });
  });

  it('leaves the veto out of the ranking and sends it apart', () => {
    let ballot = tapFinalist(EMPTY_BALLOT, 30);
    ballot = pressFinalist(ballot, 20, true);
    expect(ballotToSend(SEEDS, ballot)).toEqual({ ranking: [30, 10, 40], veto: 20 });
  });
});

describe('the veto', () => {
  it('vetoes a film, which leaves the ranking and closes the gap', () => {
    let ballot = tapFinalist(tapFinalist(EMPTY_BALLOT, 10), 20);
    ballot = pressFinalist(ballot, 10, true);
    const places = placesOf(SEEDS, ballot);
    expect(places.get(10)).toEqual({ kind: 'vetoed' });
    expect(places.get(20)).toEqual({ kind: 'ranked', rank: 1 });
    // The faint numbers skip the veto.
    expect(places.get(30)).toEqual({ kind: 'faint', rank: 2 });
    expect(places.get(40)).toEqual({ kind: 'faint', rank: 3 });
  });

  it("can't be tapped into the order", () => {
    const ballot = pressFinalist(EMPTY_BALLOT, 20, true);
    expect(tapFinalist(ballot, 20)).toBe(ballot);
  });

  it('is lifted by a long press on the same film, without its old rank back', () => {
    let ballot = pressFinalist(tapFinalist(EMPTY_BALLOT, 20), 20, true);
    ballot = pressFinalist(ballot, 20, true);
    expect(ballot.veto).toBeNull();
    expect(placesOf(SEEDS, ballot).get(20)).toEqual({ kind: 'faint', rank: 2 });
  });

  it('moves to another poster with a long press there: one veto at most', () => {
    let ballot = pressFinalist(EMPTY_BALLOT, 20, true);
    ballot = tapFinalist(ballot, 30);
    ballot = pressFinalist(ballot, 30, true);
    expect(ballot.veto).toBe(30);
    const places = placesOf(SEEDS, ballot);
    expect([...places.values()].filter((p) => p.kind === 'vetoed')).toHaveLength(1);
    expect(places.get(30)).toEqual({ kind: 'vetoed' });
    expect(places.get(20)).toEqual({ kind: 'faint', rank: 2 });
  });

  it('does nothing where no veto is allowed', () => {
    expect(pressFinalist(EMPTY_BALLOT, 10, false)).toBe(EMPTY_BALLOT);
  });

  it('is allowed only in a Final Cut with a veto left', () => {
    expect(vetoAllowed('final_cut', 1)).toBe(true);
    expect(vetoAllowed('final_cut', 0)).toBe(false);
    expect(vetoAllowed('final_cut', null)).toBe(false);
    expect(vetoAllowed('ranked_vote', 1)).toBe(false);
  });
});

describe('picking one of 2 films', () => {
  it('a tap picks, a tap on the other moves the pick, a tap on the picked film lifts it', () => {
    const seeds = [10, 20];
    const first = tapPick(EMPTY_BALLOT, 10);
    expect(placesOf(seeds, first).get(10)).toEqual({ kind: 'ranked', rank: 1 });
    expect(placesOf(seeds, first).get(20)).toEqual({ kind: 'faint', rank: 2 });
    const moved = tapPick(first, 20);
    expect(placesOf(seeds, moved).get(20)).toEqual({ kind: 'ranked', rank: 1 });
    expect(placesOf(seeds, moved).get(10)).toEqual({ kind: 'faint', rank: 2 });
    expect(tapPick(moved, 20)).toEqual(EMPTY_BALLOT);
  });

  it('sends the picked film first and no veto', () => {
    expect(ballotToSend([10, 20], tapPick(EMPTY_BALLOT, 20))).toEqual({ ranking: [20, 10] });
    expect(ballotToSend([10, 20], EMPTY_BALLOT)).toEqual({ ranking: [10, 20] });
  });
});
