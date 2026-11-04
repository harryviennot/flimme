import type { NextCard, RequestCardsAnswer } from '@flimme/contract';

import { createCardStack, REQUEST_RETRY_MS, type StackDeps } from './card-stack';

function card(id: number): NextCard {
  return {
    title_id: id,
    tmdb_id: id + 1000,
    title: `Film ${id}`,
    overview: null,
    year: 2000,
    runtime_min: 100,
    genre_ids: [],
    tmdb_score: null,
    tmdb_votes: 0,
    poster_path: `/p${id}.jpg`,
    poster_placeholder: null,
    backdrop_path: null,
    trailer_key: null,
    directors: [],
    cast: [],
    providers: [],
    watch_link: null,
    deck_source: 'ranked',
    reason_code: null,
    reason_params: {},
    member_ratings: [],
  };
}
const cards = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => card(from + i));
const ids = (list: NextCard[]) => list.map((c) => c.title_id);

function setup(initial: NextCard[], opts: { width?: number; answers?: RequestCardsAnswer[] } = {}) {
  let clock = 1000;
  const answered = new Set<number>();
  const fetchResults: NextCard[][] = [initial];
  const deferred: ((cards: NextCard[]) => void)[] = [];
  const answerQueue = [...(opts.answers ?? [])];
  const deps = {
    fetchCards: jest.fn((_limit: number) => {
      const next = fetchResults.length > 1 ? fetchResults.shift()! : fetchResults[0]!;
      return Promise.resolve(next);
    }),
    requestCards: jest.fn(() => Promise.resolve(answerQueue.shift() ?? 'queued')),
    prefetch: jest.fn(),
    isAnswered: jest.fn((id: number) => answered.has(id)),
    now: () => clock,
  } satisfies StackDeps;
  const stack = createCardStack(deps, {
    imageBase: 'https://img.test/t/p/',
    screenWidth: opts.width ?? 390,
  });
  return {
    stack,
    deps,
    answered,
    deferred,
    next: (c: NextCard[]) => fetchResults.push(c),
    setNext: (c: NextCard[]) => {
      fetchResults.length = 0;
      fetchResults.push(c);
    },
    tick: (ms: number) => {
      clock += ms;
    },
    get: () => stack.getState(),
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('card stack', () => {
  it('mounts 3 and buffers up to 10 in the server order (13 fetched)', async () => {
    const t = setup(cards(1, 13));
    t.stack.getState().start();
    expect(t.get().status).toBe('loading');
    await flush();
    expect(t.deps.fetchCards).toHaveBeenCalledWith(13);
    expect(ids(t.get().mounted)).toEqual([1, 2, 3]);
    expect(ids(t.get().buffer)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(t.get().status).toBe('ready');
  });

  it('leaves out films the queue already holds', async () => {
    const t = setup(cards(1, 13));
    t.answered.add(1);
    t.answered.add(5);
    t.stack.getState().start();
    await flush();
    expect(ids(t.get().mounted)).toEqual([2, 3, 4]);
    expect(ids(t.get().buffer)).not.toContain(5);
    expect(ids(t.get().buffer)[0]).toBe(6);
  });

  it('moves the next card up on answer and returns dwell time and flip state', async () => {
    const t = setup(cards(1, 13));
    t.stack.getState().start();
    await flush();
    t.tick(2500);
    t.get().setFlipped(true);
    const result = t.get().answer();
    expect(result?.card.title_id).toBe(1);
    expect(result?.dwellMs).toBe(2500);
    expect(result?.flipped).toBe(true);
    expect(ids(t.get().mounted)).toEqual([2, 3, 4]);
    expect(ids(t.get().buffer)[0]).toBe(5);
    t.tick(700);
    expect(t.get().answer()?.dwellMs).toBe(700);
  });

  it('counts each turn to the back, for the first-flip hint', async () => {
    const t = setup(cards(1, 13));
    t.stack.getState().start();
    await flush();
    expect(t.get().flips).toBe(0);
    t.get().setFlipped(true);
    t.get().setFlipped(true);
    expect(t.get().flips).toBe(1);
    t.get().setFlipped(false);
    expect(t.get().flips).toBe(1);
    t.get().setFlipped(true);
    expect(t.get().flips).toBe(2);
  });

  it('resets flipped when a card reaches the top', async () => {
    const t = setup(cards(1, 13));
    t.stack.getState().start();
    await flush();
    t.get().setFlipped(true);
    expect(t.get().flipped).toBe(true);
    t.get().answer();
    expect(t.get().flipped).toBe(false);
  });

  it('answers null when there is nothing on top', () => {
    const t = setup([]);
    expect(t.get().answer()).toBeNull();
  });

  describe('asking for more', () => {
    it('calls request_cards once at 5 left, again after 8 seconds, never more often', async () => {
      const t = setup(cards(1, 8));
      t.stack.getState().start();
      await flush();
      expect(t.deps.requestCards).not.toHaveBeenCalled();
      for (let i = 0; i < 3; i++) t.get().answer(); // 5 left
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1);
      t.get().answer(); // 4 left
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(REQUEST_RETRY_MS - 1);
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(2);
      t.stack.getState().stop();
    });

    it('stops retrying once new cards arrive', async () => {
      const t = setup(cards(1, 8), { answers: ['queued'] });
      t.stack.getState().start();
      await flush();
      for (let i = 0; i < 3; i++) t.get().answer();
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1);
      t.setNext(cards(4, 16));
      t.get().onDeckUpdated();
      await flush();
      jest.advanceTimersByTime(REQUEST_RETRY_MS * 2);
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1);
    });

    it.each(['ok', 'enough'] as const)('refetches on %s', async (answer) => {
      const t = setup(cards(1, 8), { answers: [answer] });
      t.stack.getState().start();
      await flush();
      expect(t.deps.fetchCards).toHaveBeenCalledTimes(1);
      t.setNext(cards(4, 16));
      for (let i = 0; i < 3; i++) t.get().answer();
      await flush();
      expect(t.deps.fetchCards).toHaveBeenCalledTimes(2);
      expect(t.get().mounted.length + t.get().buffer.length).toBe(13);
    });

    it('waits on queued', async () => {
      const t = setup(cards(1, 8), { answers: ['queued'] });
      t.stack.getState().start();
      await flush();
      for (let i = 0; i < 3; i++) t.get().answer();
      await flush();
      expect(t.deps.fetchCards).toHaveBeenCalledTimes(1);
      expect(t.get().status).toBe('ready');
    });

    it('stops asking on closed', async () => {
      const t = setup(cards(1, 8), { answers: ['closed'] });
      t.stack.getState().start();
      await flush();
      for (let i = 0; i < 3; i++) t.get().answer();
      await flush();
      jest.advanceTimersByTime(REQUEST_RETRY_MS * 3);
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1);
      expect(t.deps.fetchCards).toHaveBeenCalledTimes(1);
    });

    it('is empty when the server has nothing more and nothing is coming', async () => {
      const t = setup(cards(1, 4), { answers: ['queued', 'enough'] });
      t.stack.getState().start();
      await flush();
      t.setNext([]);
      for (let i = 0; i < 4; i++) t.get().answer();
      jest.advanceTimersByTime(REQUEST_RETRY_MS);
      await flush();
      expect(t.get().mounted).toEqual([]);
      expect(t.get().status).toBe('empty');
    });

    it('is loading, not empty, while a refill is queued', async () => {
      const t = setup(cards(1, 4), { answers: ['queued'] });
      t.stack.getState().start();
      await flush();
      for (let i = 0; i < 4; i++) t.get().answer();
      await flush();
      expect(t.get().status).toBe('loading');
    });
  });

  describe('deck_updated', () => {
    it('keeps the 3 mounted cards and replaces only the buffer', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      const before = t.get().mounted;
      t.setNext([card(1), card(2), card(3), ...cards(50, 59)]);
      t.get().onDeckUpdated();
      await flush();
      expect(t.get().mounted).toEqual(before);
      expect(ids(t.get().buffer)).toEqual(ids(cards(50, 59)));
      expect(t.get().stale).toBe(false);
    });

    it('shows a loading card, never an old buffered card, until the refetch returns', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      let release: (c: NextCard[]) => void = () => {};
      t.deps.fetchCards.mockImplementationOnce(
        () => new Promise<NextCard[]>((resolve) => (release = resolve)),
      );
      t.get().onDeckUpdated();
      expect(t.get().stale).toBe(true);
      for (let i = 0; i < 3; i++) t.get().answer();
      expect(t.get().mounted).toEqual([]);
      expect(t.get().status).toBe('loading');
      release([...cards(50, 62)]);
      await flush();
      expect(ids(t.get().mounted)).toEqual([50, 51, 52]);
      expect(t.get().status).toBe('ready');
    });

    it('ignores a fetch that started before the latest deck_updated', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      const releases: ((c: NextCard[]) => void)[] = [];
      t.deps.fetchCards.mockImplementation(
        () => new Promise<NextCard[]>((resolve) => releases.push(resolve)),
      );
      t.get().onDeckUpdated();
      t.get().onDeckUpdated();
      releases[1]!(cards(70, 82));
      await flush();
      releases[0]!(cards(60, 72));
      await flush();
      expect(ids(t.get().mounted)).toEqual([1, 2, 3]);
      expect(ids(t.get().buffer)[0]).toBe(70);
    });
  });

  describe('offline', () => {
    it('keeps swiping through the cards on the phone, then waits, then refetches on reconnect', async () => {
      const t = setup(cards(1, 5));
      t.stack.getState().start();
      await flush();
      t.get().onOffline();
      for (let i = 0; i < 4; i++) expect(t.get().answer()).not.toBeNull();
      expect(t.get().status).toBe('ready');
      jest.advanceTimersByTime(REQUEST_RETRY_MS * 2);
      await flush();
      expect(t.deps.requestCards).toHaveBeenCalledTimes(1); // only the call made while online
      t.get().answer();
      expect(t.get().status).toBe('waiting_offline');
      t.setNext(cards(6, 18));
      t.get().onOnline();
      await flush();
      expect(ids(t.get().mounted)).toEqual([6, 7, 8]);
      expect(t.get().status).toBe('ready');
    });

    it('waits offline when the first fetch fails', async () => {
      const t = setup([]);
      t.deps.fetchCards.mockRejectedValueOnce(new Error('network'));
      t.stack.getState().start();
      await flush();
      expect(t.get().status).toBe('waiting_offline');
    });
  });

  describe('poster prefetch', () => {
    it('prefetches cards 4 to 6 at w500, each at most once', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      const urls = (n: number) => t.deps.prefetch.mock.calls[n][0];
      expect(urls(0)).toEqual([4, 5, 6].map((i) => `https://img.test/t/p/w500/p${i}.jpg`));
      t.get().answer();
      const all = t.deps.prefetch.mock.calls.flatMap((c) => c[0]);
      expect(all).toEqual([4, 5, 6, 7].map((i) => `https://img.test/t/p/w500/p${i}.jpg`));
    });

    it('uses w780 at 600 points or more', async () => {
      const t = setup(cards(1, 13), { width: 820 });
      t.stack.getState().start();
      await flush();
      expect(t.deps.prefetch.mock.calls[0][0][0]).toBe('https://img.test/t/p/w780/p4.jpg');
    });
  });

  describe('putBack (undo)', () => {
    it('puts the answered card on top again, front side up, and the others behind it', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      t.get().setFlipped(true);
      const done = t.get().answer()!;
      expect(ids(t.get().mounted)).toEqual([2, 3, 4]);
      t.get().putBack(done.card);
      expect(ids(t.get().mounted)).toEqual([1, 2, 3]);
      expect(ids(t.get().buffer)[0]).toBe(4);
      expect(t.get().flipped).toBe(false);
      expect(t.get().status).toBe('ready');
    });

    it('restarts the dwell time', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      const done = t.get().answer()!;
      t.tick(5000);
      t.get().putBack(done.card);
      t.tick(700);
      expect(t.get().answer()!.dwellMs).toBe(700);
    });

    it('works when the answer was the last card of the deck', async () => {
      const t = setup(cards(1, 1));
      t.stack.getState().start();
      await flush();
      const done = t.get().answer()!;
      expect(t.get().mounted).toEqual([]);
      t.get().putBack(done.card);
      expect(ids(t.get().mounted)).toEqual([1]);
      expect(t.get().status).toBe('ready');
    });

    it('never doubles a card that is already mounted', async () => {
      const t = setup(cards(1, 13));
      t.stack.getState().start();
      await flush();
      t.get().putBack(t.get().mounted[1]!);
      expect(ids(t.get().mounted)).toEqual([2, 1, 3]);
    });
  });
});
