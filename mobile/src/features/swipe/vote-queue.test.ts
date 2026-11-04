import { ApiError, type CastVoteResult, type UndoLastVoteResult } from '@flimme/contract';

import type { KeyValueStore } from '@/lib/storage';

import {
  createVoteQueue,
  RETRY_DELAYS_MS,
  type QueuedVote,
  type VoteQueueEvent,
} from './vote-queue';

const ROOM = 'room-1';
const OTHER_ROOM = 'room-2';
const MEMBER = 'member-1';

function memoryKv(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
    getItemSync: (k) => map.get(k) ?? null,
    setItemSync: (k, v) => void map.set(k, v),
    removeItemSync: (k) => void map.delete(k),
  };
}

function vote(title_id: number, extra: Partial<QueuedVote> = {}): QueuedVote {
  return {
    room_id: ROOM,
    member_id: MEMBER,
    title_id,
    answer: 'like',
    dwell_ms: 800,
    client_at: '2026-11-04T10:00:00.000Z',
    flipped: false,
    ...extra,
  };
}

const networkError = () => new ApiError('network', 'cast_vote', 'the request failed');
const deniedError = () => new ApiError('denied', 'cast_vote', 'no', { code: '42501' });
const notDealtError = () => new ApiError('unexpected', 'cast_vote', 'no', { code: '22023' });

type Sent = { room_id: string; title_id: number; flipped?: boolean };

/** A queue over a fake api. `answers` is called per attempt and may be async or throw. */
function setup(
  answer: (sent: Sent, attempt: number) => CastVoteResult | Promise<CastVoteResult> = () => ({
    status: 'ok',
    match: false,
  }),
  options: {
    kv?: KeyValueStore;
    kept?: string | null;
    undo?: (attempt: number) => UndoLastVoteResult | Promise<UndoLastVoteResult>;
  } = {},
) {
  const log: string[] = [];
  let undoAttempts = 0;
  const kv = options.kv ?? memoryKv();
  const sent: Sent[] = [];
  const attempts = new Map<number, number>();
  const events: VoteQueueEvent[] = [];
  const reported: { error: unknown; context: object }[] = [];
  const invalidated: string[] = [];
  const refreshSession = jest.fn(async () => undefined);
  const kept = { id: options.kept === undefined ? ROOM : options.kept };
  const queue = createVoteQueue({
    kv,
    castVote: async (args) => {
      const s = { room_id: args.room_id, title_id: args.title_id };
      sent.push({ ...s, flipped: args.flipped });
      log.push(`vote ${args.title_id}`);
      const n = (attempts.get(args.title_id) ?? 0) + 1;
      attempts.set(args.title_id, n);
      return answer(s, n);
    },
    undoLastVote: async () => {
      log.push('undo');
      undoAttempts += 1;
      return options.undo ? options.undo(undoAttempts) : { status: 'ok', title_id: 0 };
    },
    refreshSession,
    invalidateRoom: (id) => void invalidated.push(id),
    report: (error, context) => void reported.push({ error, context }),
    keptRoomId: () => kept.id,
  });
  queue.onAnswer((e) => void events.push(e));
  return { queue, kv, sent, log, events, reported, invalidated, refreshSession, kept };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('flipped', () => {
  it('sends whether the card was turned over', async () => {
    const { queue, sent } = setup(() => ({ status: 'ok', match: false }));
    queue.enqueue(vote(1, { flipped: true }));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.flipped)).toEqual([true, false]);
  });
});

describe('order', () => {
  it('sends one vote at a time, in the order given, the next after the previous answered', async () => {
    const releases: (() => void)[] = [];
    const { queue, sent } = setup(
      () =>
        new Promise<CastVoteResult>((resolve) => {
          releases.push(() => resolve({ status: 'ok', match: false }));
        }),
    );
    queue.enqueue(vote(1));
    queue.enqueue(vote(2));
    queue.enqueue(vote(3));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.title_id)).toEqual([1]);

    releases[0]!();
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.title_id)).toEqual([1, 2]);

    releases[1]!();
    await jest.advanceTimersByTimeAsync(0);
    releases[2]!();
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.title_id)).toEqual([1, 2, 3]);
    expect(queue.pending(ROOM)).toBe(0);
  });

  it('enqueue returns at once and never waits for the network', () => {
    const { queue } = setup(() => new Promise<CastVoteResult>(() => undefined));
    queue.enqueue(vote(1));
    expect(queue.pending(ROOM)).toBe(1);
    expect(queue.has(ROOM, 1)).toBe(true);
    expect(queue.has(ROOM, 2)).toBe(false);
  });

  it('ignores a second vote for the same film', async () => {
    const { queue, sent } = setup();
    queue.enqueue(vote(1));
    queue.enqueue(vote(1, { answer: 'nope' }));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
  });
});

describe('answers', () => {
  it('ok with a match removes the vote and tells the listeners', async () => {
    const { queue, events } = setup(() => ({
      status: 'ok',
      match: true,
      kind: 'unanimous',
      decided: true,
    }));
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(0);
    expect(events).toEqual([
      { type: 'match', room_id: ROOM, title_id: 1, kind: 'unanimous', decided: true },
    ]);
  });

  it('ok with a finale round tells the listeners about the finale', async () => {
    const { queue, events } = setup(() => ({
      status: 'ok',
      match: false,
      finale_round_id: 'round-1',
    }));
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(0);
    expect(events).toEqual([{ type: 'finale', room_id: ROOM, round_id: 'round-1' }]);
  });

  it('ok without a match says nothing', async () => {
    const { queue, events } = setup();
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(0);
    expect(events).toEqual([]);
  });

  it.each(['duplicate', 'dropped'] as const)(
    '%s removes the vote and the next one goes',
    async (status) => {
      const { queue, sent, events } = setup((s) =>
        s.title_id === 1 ? { status } : { status: 'ok', match: false },
      );
      queue.enqueue(vote(1));
      queue.enqueue(vote(2));
      await jest.advanceTimersByTimeAsync(0);
      expect(sent.map((s) => s.title_id)).toEqual([1, 2]);
      expect(queue.pending(ROOM)).toBe(0);
      expect(events).toEqual([]);
    },
  );

  it('closed removes every vote of that room, re-reads it and keeps the other rooms', async () => {
    const { queue, sent, events, invalidated } = setup((s) =>
      s.room_id === ROOM ? { status: 'closed', state: 'finale' } : { status: 'ok', match: false },
    );
    queue.enqueue(vote(1));
    queue.enqueue(vote(2));
    queue.enqueue(vote(3));
    queue.enqueue(vote(9, { room_id: OTHER_ROOM }));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.title_id)).toEqual([1, 9]);
    expect(queue.pending(ROOM)).toBe(0);
    expect(queue.pending(OTHER_ROOM)).toBe(0);
    expect(invalidated).toEqual([ROOM]);
    // Quiet: the listeners learn the room closed, nothing about lost swipes.
    expect(events).toEqual([{ type: 'closed', room_id: ROOM, state: 'finale' }]);
  });

  it('no_super_likes removes the vote and gives the super like back', async () => {
    const { queue, events } = setup(() => ({ status: 'no_super_likes' }));
    queue.enqueue(vote(1, { answer: 'super_like' }));
    expect(queue.pendingSuperLikes(ROOM)).toBe(1);
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(0);
    expect(queue.pendingSuperLikes(ROOM)).toBe(0);
    expect(events).toEqual([{ type: 'no_super_likes', room_id: ROOM, title_id: 1 }]);
  });

  it('a super like is spent at once and stays spent after its ok', async () => {
    const { queue } = setup();
    queue.enqueue(vote(1, { answer: 'super_like' }));
    queue.enqueue(vote(2, { answer: 'like' }));
    expect(queue.pendingSuperLikes(ROOM)).toBe(1);
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pendingSuperLikes(ROOM)).toBe(0);
  });

  it('a card that was not dealt is removed, reported with ids only, and the cards are refetched', async () => {
    const { queue, events, reported, sent } = setup((s) => {
      if (s.title_id === 1) throw notDealtError();
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.title_id)).toEqual([1, 2]);
    expect(queue.pending(ROOM)).toBe(0);
    expect(events).toEqual([{ type: 'card_not_dealt', room_id: ROOM, title_id: 1 }]);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.context).toEqual({ room_id: ROOM, title_id: 1 });
  });
});

describe('retries', () => {
  it('keeps the vote on a network error and retries after 1, 2, 4, 8, 16, then every 30 seconds', async () => {
    const { queue, sent } = setup((s, attempt) => {
      if (s.title_id === 1 && attempt <= 8) throw networkError();
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(sent.map((s) => s.title_id)).toEqual([1]);

    expect(RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
    let expected = 1;
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(sent).toHaveLength(expected);
      await jest.advanceTimersByTimeAsync(1);
      expected += 1;
      expect(sent).toHaveLength(expected);
      // Still first in line: the second vote has not gone.
      expect(sent.every((s) => s.title_id === 1)).toBe(true);
      expect(queue.pending(ROOM)).toBe(2);
    }

    await jest.advanceTimersByTimeAsync(30000);
    expect(sent.map((s) => s.title_id)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(queue.pending(ROOM)).toBe(0);
  });

  it('a server error is retried like a network error', async () => {
    const { queue, sent } = setup((_s, attempt) => {
      if (attempt === 1) throw new ApiError('unexpected', 'cast_vote', 'boom', { code: '57014' });
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);
    expect(queue.pending(ROOM)).toBe(0);
  });

  it('flush() on reconnect tries at once and starts the delays again', async () => {
    let offline = true;
    const { queue, sent } = setup(() => {
      if (offline) throw networkError();
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(2);

    offline = false;
    await queue.flush();
    expect(sent).toHaveLength(3);
    expect(queue.pending(ROOM)).toBe(0);
  });

  it('a new vote while waiting for a retry does not send early', async () => {
    const { queue, sent } = setup((_s, attempt) => {
      if (attempt === 1) throw networkError();
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(500);
    expect(sent.map((s) => s.title_id)).toEqual([1, 1, 2]);
  });

  it('six votes made offline arrive in order once the connection is back, counting down to 0', async () => {
    let offline = true;
    const { queue, sent } = setup(() => {
      if (offline) throw networkError();
      return { status: 'ok', match: false };
    });
    for (let i = 1; i <= 6; i++) queue.enqueue(vote(i));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(6);

    offline = false;
    const seen: number[] = [];
    queue.store.subscribe(() => seen.push(queue.pending(ROOM)));
    await queue.flush();
    expect(sent.slice(-6).map((s) => s.title_id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
  });
});

describe('an expired session', () => {
  it('refreshes the session once and retries the vote', async () => {
    const { queue, sent, refreshSession, reported } = setup((_s, attempt) => {
      if (attempt === 1) throw deniedError();
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
    expect(queue.pending(ROOM)).toBe(0);
    expect(reported).toEqual([]);
  });

  it('drops the vote and reports it when the second try is denied too, and the next vote goes', async () => {
    const { queue, sent, refreshSession, reported } = setup((s) => {
      if (s.title_id === 1) throw deniedError();
      return { status: 'ok', match: false };
    });
    queue.enqueue(vote(1));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sent.map((s) => s.title_id)).toEqual([1, 1, 2]);
    expect(queue.pending(ROOM)).toBe(0);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.context).toEqual({ room_id: ROOM, title_id: 1 });
  });

  it('keeps the vote when the refresh itself fails for lack of a network', async () => {
    const { queue, refreshSession } = setup(() => {
      throw deniedError();
    });
    refreshSession.mockRejectedValueOnce(networkError());
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.pending(ROOM)).toBe(1);
  });
});

describe('restart', () => {
  it('brings the waiting votes back and sends them first when the room reopens', async () => {
    const kv = memoryKv();
    const first = setup(
      () => {
        throw networkError();
      },
      { kv },
    );
    first.queue.enqueue(vote(1));
    first.queue.enqueue(vote(2, { answer: 'super_like', flipped: true }));
    await jest.advanceTimersByTimeAsync(0);
    expect(kv.getItemSync('flimme.vote-queue')).not.toBeNull();

    // The app is killed here: a new queue over the same storage.
    const second = setup(undefined, { kv });
    expect(second.queue.pending(ROOM)).toBe(2);
    expect(second.queue.pendingSuperLikes(ROOM)).toBe(1);
    await second.queue.flush();
    expect(second.sent.map((s) => s.title_id)).toEqual([1, 2]);
    expect(second.queue.pending(ROOM)).toBe(0);
    expect(second.queue.store.getState().votes).toEqual([]);
  });

  it('drops votes for a room the phone no longer keeps, unsent', async () => {
    const kv = memoryKv();
    const first = setup(
      () => {
        throw networkError();
      },
      { kv },
    );
    first.queue.enqueue(vote(1));
    first.queue.enqueue(vote(2, { room_id: OTHER_ROOM }));
    await jest.advanceTimersByTimeAsync(0);

    const second = setup(undefined, { kv, kept: OTHER_ROOM });
    await second.queue.flush();
    expect(second.sent).toEqual([{ room_id: OTHER_ROOM, title_id: 2, flipped: false }]);
    expect(second.queue.pending(ROOM)).toBe(0);

    const third = setup(undefined, { kv: memoryKv(), kept: null });
    third.queue.enqueue(vote(5));
    await third.queue.flush();
    expect(third.sent).toEqual([]);
    expect(third.queue.pending(ROOM)).toBe(0);
  });

  it('reads damaged saved data as an empty queue', () => {
    const kv = memoryKv();
    kv.setItemSync(
      'flimme.vote-queue',
      JSON.stringify({ state: { votes: [{ nonsense: true }, null, 7] }, version: 1 }),
    );
    const { queue } = setup(undefined, { kv });
    expect(queue.store.getState().votes).toEqual([]);
  });
});

describe('undo', () => {
  const undoItem = (title_id: number) => ({ room_id: ROOM, member_id: MEMBER, title_id });

  it('takes the last vote out when it is still waiting, and calls nothing for it', async () => {
    const { queue, sent } = setup(() => {
      throw networkError();
    });
    queue.enqueue(vote(1));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.removeLast(ROOM)?.title_id).toBe(2);
    expect(queue.has(ROOM, 2)).toBe(false);
    expect(queue.has(ROOM, 1)).toBe(true);
    expect(sent.map((s) => s.title_id)).toEqual([1]);
  });

  it('does not take out a vote that is being sent', () => {
    const { queue } = setup(() => new Promise<CastVoteResult>(() => undefined));
    queue.enqueue(vote(1));
    expect(queue.removeLast(ROOM)).toBeNull();
    expect(queue.has(ROOM, 1)).toBe(true);
  });

  it('does not take out a head whose send failed: it may have reached the server', async () => {
    const { queue } = setup(() => {
      throw networkError();
    });
    queue.enqueue(vote(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.removeLast(ROOM)).toBeNull();
    expect(queue.has(ROOM, 1)).toBe(true);
  });

  it('answers null for another room or an empty queue', () => {
    const { queue } = setup();
    expect(queue.removeLast(ROOM)).toBeNull();
  });

  it('sends the undo after the votes before it and before the votes after it', async () => {
    const { queue, log } = setup();
    queue.enqueue(vote(1));
    queue.enqueueUndo(undoItem(1));
    queue.enqueue(vote(1, { answer: 'nope' }));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['vote 1', 'undo', 'vote 1', 'vote 2']);
  });

  it('keeps an undo waiting offline and sends it once, in line, when the network is back', async () => {
    const { queue, log } = setup(undefined, {
      undo: (n) => {
        if (n === 1) throw networkError();
        return { status: 'ok', title_id: 1 };
      },
    });
    queue.enqueueUndo(undoItem(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(queue.removeLast(ROOM)).toBeNull();
    await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(log).toEqual(['undo', 'undo']);
    expect(queue.store.getState().votes).toEqual([]);
  });

  it('reports nothing_to_undo and drops it', async () => {
    const { queue, reported } = setup(undefined, { undo: () => ({ status: 'nothing_to_undo' }) });
    queue.enqueueUndo(undoItem(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(reported).toHaveLength(1);
    expect(queue.store.getState().votes).toEqual([]);
  });

  it('on locked reads the room again and shows no error', async () => {
    const { queue, reported, invalidated, events } = setup(undefined, {
      undo: () => ({ status: 'locked' }),
    });
    queue.enqueueUndo(undoItem(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(invalidated).toEqual([ROOM]);
    expect(reported).toEqual([]);
    expect(events).toEqual([]);
    expect(queue.store.getState().votes).toEqual([]);
  });

  it('on closed drops the room and tells the screens', async () => {
    const { queue, events } = setup(undefined, {
      undo: () => ({ status: 'closed', state: 'closed' }),
    });
    queue.enqueue(vote(1, { room_id: ROOM }));
    queue.enqueueUndo(undoItem(1));
    queue.enqueue(vote(2));
    await jest.advanceTimersByTimeAsync(0);
    expect(events.some((e) => e.type === 'closed')).toBe(true);
    expect(queue.pending(ROOM)).toBe(0);
  });

  it('is saved on the device and read back after a restart', async () => {
    const kv = memoryKv();
    const first = setup(
      () => {
        throw networkError();
      },
      { kv },
    );
    first.queue.enqueue(vote(1));
    first.queue.enqueueUndo(undoItem(1));
    await jest.advanceTimersByTimeAsync(0);
    const second = setup(undefined, { kv });
    await second.queue.flush();
    expect(second.log).toEqual(['vote 1', 'undo']);
  });

  it('does not count an undo as a waiting swipe', () => {
    const { queue } = setup(() => new Promise<CastVoteResult>(() => undefined));
    queue.enqueue(vote(1));
    queue.enqueueUndo(undoItem(1));
    expect(queue.pending(ROOM)).toBe(1);
  });
});
