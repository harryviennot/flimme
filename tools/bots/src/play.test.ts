import { describe, expect, it, vi } from 'vitest';

import { createPlayer, type PlayApi } from './play';
import { makePersonality, seededRandom, type Personality } from './personality';

const card = (id: number) => ({
  title_id: id,
  genre_ids: [1, 2],
  year: 2000,
  tmdb_score: 7,
});

function fakeApi(overrides: Record<string, unknown> = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const record = (name: string, answer: (args: never) => unknown) => (args: never) => {
    calls.push({ name, args });
    return Promise.resolve(answer(args));
  };
  const api = {
    myNextCards: record('myNextCards', () => [card(1), card(2), card(3)]),
    requestCards: record('requestCards', () => ({ status: 'ok' })),
    castVote: record('castVote', () => ({ status: 'ok', match: false })),
    undoLastVote: record('undoLastVote', () => ({ status: 'ok', title_id: 1 })),
    titleCards: record('titleCards', () => ({
      status: 'ok',
      cards: [card(10), card(11), card(12), card(13)],
    })),
    castBallot: record('castBallot', () => ({ status: 'ok', locked: [], of: 3 })),
    ...overrides,
  } as unknown as PlayApi;
  return { api, calls };
}

function setup(
  api: PlayApi,
  personality: Partial<Personality> = {},
  extra: { sleep?: () => Promise<void> } = {},
) {
  const lines: string[] = [];
  const scheduled: (() => void)[] = [];
  const player = createPlayer({
    api,
    roomId: 'room-secret',
    memberId: 'seat-secret',
    label: 'bot 2',
    personality: {
      ...makePersonality(3, 2, 'mixed'),
      seenChance: 0,
      undoChance: 0,
      pauseChance: 0,
      neverLocksChance: 0,
      ...personality,
    },
    random: seededRandom(5),
    sleep: extra.sleep ?? (() => Promise.resolve()),
    schedule: (fn) => {
      scheduled.push(fn);
      return () => {};
    },
    now: () => Date.parse('2026-11-05T12:00:00Z'),
    log: (line) => lines.push(line),
    setPresence: () => {},
    swipeMs: null,
    likeRate: null,
    initialState: 'lobby',
  });
  return { player, lines, scheduled };
}

const finale = (kind: 'final_cut' | 'ranked_vote') => ({
  round_id: 'round-1',
  title_ids: [10, 11, 12, 13],
  kind,
  closes_at: '2026-11-05T12:01:00Z',
});

describe('swiping', () => {
  it('keeps swiping until the room leaves swiping, whatever the shortlist does', async () => {
    let votes = 0;
    const { api, calls } = fakeApi({
      // The room stays in `swiping` after a vote (a shortlist does not end the game) until the
      // fourth vote, which answers `closed`.
      castVote: (args: unknown) => {
        calls.push({ name: 'castVote', args });
        votes += 1;
        return Promise.resolve(
          votes < 4
            ? { status: 'ok', match: votes === 2, state: undefined }
            : { status: 'closed', state: 'finale' },
        );
      },
    });
    const { player } = setup(api);
    player.setState('swiping');
    await vi.waitFor(() => expect(votes).toBe(4));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.filter((c) => c.name === 'castVote')).toHaveLength(4);
  });

  it('stops when a state change says the room moved on', async () => {
    const { api, calls } = fakeApi();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let sleeps = 0;
    const { player } = setup(
      api,
      {},
      {
        sleep: async () => {
          sleeps += 1;
          if (sleeps === 2) await gate;
        },
      },
    );
    player.setState('swiping');
    await vi.waitFor(() => expect(sleeps).toBe(2));
    player.setState('finale');
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.filter((c) => c.name === 'castVote')).toHaveLength(1);
  });

  it('asks for more cards when it runs out, and looks again', async () => {
    let asked = 0;
    const { api, calls } = fakeApi({
      myNextCards: (args: unknown) => {
        calls.push({ name: 'myNextCards', args });
        asked += 1;
        return Promise.resolve(asked === 1 ? [] : [card(1)]);
      },
      castVote: (args: unknown) => {
        calls.push({ name: 'castVote', args });
        return Promise.resolve({ status: 'closed', state: 'done' });
      },
    });
    const { player } = setup(api);
    player.setState('swiping');
    await vi.waitFor(() => expect(calls.some((c) => c.name === 'castVote')).toBe(true));
    expect(calls.some((c) => c.name === 'requestCards')).toBe(true);
  });

  it('takes a vote back and answers the same film again (Undo)', async () => {
    const { api, calls } = fakeApi({
      castVote: (args: unknown) => {
        calls.push({ name: 'castVote', args });
        return Promise.resolve(
          calls.filter((c) => c.name === 'castVote').length < 2
            ? { status: 'ok', match: false }
            : { status: 'closed', state: 'done' },
        );
      },
    });
    const { player } = setup(api, { undoChance: 1 });
    player.setState('swiping');
    await vi.waitFor(() => expect(calls.filter((c) => c.name === 'castVote')).toHaveLength(2));
    const names = calls.map((c) => c.name).filter((n) => n !== 'myNextCards');
    expect(names.slice(0, 3)).toEqual(['castVote', 'undoLastVote', 'castVote']);
    const votes = calls
      .filter((c) => c.name === 'castVote')
      .map((c) => c.args as { title_id: number });
    expect(votes[1]!.title_id).toBe(votes[0]!.title_id);
  });

  it('only stays present when the swipe is off', async () => {
    const { api, calls } = fakeApi();
    const { player } = setup(api);
    const off = createPlayer({
      api,
      roomId: 'r',
      memberId: 'm',
      label: 'bot 1',
      personality: makePersonality(1, 1, 'mixed'),
      random: seededRandom(1),
      sleep: () => Promise.resolve(),
      log: () => {},
      setPresence: () => {},
      swipeMs: 'off',
      likeRate: null,
      initialState: 'swiping',
    });
    off.setState('swiping');
    await new Promise((resolve) => setTimeout(resolve, 10));
    player.stop();
    expect(calls).toHaveLength(0);
  });
});

describe('the Final Cut', () => {
  it('sends a ranked vote ballot with no veto, whatever the bot feels', async () => {
    const { api, calls } = fakeApi();
    const { player, scheduled } = setup(api, { vetoChance: 1 });
    await player.playFinale(finale('ranked_vote'));
    scheduled.forEach((fn) => fn());
    await vi.waitFor(() => expect(calls.some((c) => c.name === 'castBallot')).toBe(true));
    const ballot = calls.find((c) => c.name === 'castBallot')!.args as {
      round_id: string;
      ranking: number[];
      veto?: number;
    };
    expect(ballot.veto).toBeUndefined();
    expect([...ballot.ranking].sort()).toEqual([10, 11, 12, 13]);
  });

  it('can veto in a Final Cut, and leaves the vetoed film out of the ranking', async () => {
    const { api, calls } = fakeApi();
    const { player, scheduled } = setup(api, { vetoChance: 1 });
    await player.playFinale(finale('final_cut'));
    scheduled.forEach((fn) => fn());
    await vi.waitFor(() => expect(calls.some((c) => c.name === 'castBallot')).toBe(true));
    const ballot = calls.find((c) => c.name === 'castBallot')!.args as {
      ranking: number[];
      veto?: number;
    };
    expect(ballot.veto).toBeDefined();
    expect(ballot.ranking).not.toContain(ballot.veto);
  });

  it('locks in once per round, and never when it is the bot that never locks', async () => {
    const { api, calls } = fakeApi();
    const { player, scheduled } = setup(api, { neverLocksChance: 1 });
    await player.playFinale(finale('final_cut'));
    expect(scheduled).toHaveLength(0);
    expect(calls.some((c) => c.name === 'castBallot')).toBe(false);
  });

  it('does not lock in after it was stopped', async () => {
    const { api, calls } = fakeApi();
    const { player, scheduled } = setup(api);
    await player.playFinale(finale('final_cut'));
    player.stop();
    scheduled.forEach((fn) => fn());
    expect(calls.some((c) => c.name === 'castBallot')).toBe(false);
  });
});

describe('logs (rule 7)', () => {
  it('say only that a bot liked a film or locked in, never a code, id or title', async () => {
    let votes = 0;
    const { api } = fakeApi({
      castVote: () => {
        votes += 1;
        return Promise.resolve(
          votes < 30 ? { status: 'ok', match: false } : { status: 'closed', state: 'done' },
        );
      },
    });
    const { player, lines, scheduled } = setup(api, { likeRate: 0.9 }, {});
    player.setState('swiping');
    await vi.waitFor(() => expect(votes).toBeGreaterThanOrEqual(30));
    await player.playFinale(finale('final_cut'));
    scheduled.forEach((fn) => fn());
    await vi.waitFor(() => expect(lines).toContain('bot 2 locked in'));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line).toMatch(/^bot \d+ (liked a film|locked in)$/);
  });
});
