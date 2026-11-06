import type { NextCard, RoomSeat } from '@flimme/contract';
import { act, renderHook } from '@testing-library/react-native';
import { create } from 'zustand';

import type { ReactNode } from 'react';

import { ShortlistProvider } from '@/features/shortlist/context';
import { createShortlistController } from '@/features/shortlist/controller';

import { useSwipe } from './use-swipe';
import type { QueuedVote, VoteQueueEvent } from './vote-queue';

// The hook that joins the stack, the answer path, the vote queue and the room's events.

const ROOM = 'room-1';
const ME = 'm1';

const mockApi = { myNextCards: jest.fn(), requestCards: jest.fn() };
jest.mock('@/api', () => ({
  api: {
    myNextCards: (...args: unknown[]) => mockApi.myNextCards(...args),
    requestCards: (...args: unknown[]) => mockApi.requestCards(...args),
  },
}));
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn() } }));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://img.test' } }),
}));

const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));

const mockHandlers = new Map<string, (payload: unknown) => void>();
let mockKept: string | undefined = ROOM;
jest.mock('@/features/room', () => ({
  ROOM_KEY: (id: string) => ['room', id],
  useRoom: () => ({ data: { seen_rule: 'allow_rewatch' } }),
  useKeptRoom: () => ({ room: mockKept ? { id: mockKept, code: '123456' } : null }),
  useRoomEvent: (_room: string, event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
const mockPresence = jest.fn();
jest.mock('@/features/room/realtime', () => ({
  useRoomRealtime: () => ({ setPresence: mockPresence }),
}));

// A queue with the same surface as the real one, so the hook's reads and events are the real ones.
const mockQueue = (() => {
  const store = create<{ votes: QueuedVote[] }>(() => ({ votes: [] }));
  const listeners = new Set<(event: VoteQueueEvent) => void>();
  return {
    store,
    listeners,
    flush: jest.fn(async () => undefined),
    enqueue: (vote: QueuedVote) => store.setState({ votes: [...store.getState().votes, vote] }),
    pending: (room: string) => store.getState().votes.filter((v) => v.room_id === room).length,
    pendingSuperLikes: (room: string) =>
      store.getState().votes.filter((v) => v.room_id === room && v.answer === 'super_like').length,
    removeLast: jest.fn((room: string, id?: number) => {
      const list = store.getState().votes;
      const last = list[list.length - 1];
      if (!last || last.room_id !== room || (id !== undefined && last.title_id !== id)) return null;
      store.setState({ votes: list.slice(0, -1) });
      return last;
    }),
    enqueueUndo: jest.fn(),
    has: (room: string, id: number) =>
      store.getState().votes.some((v) => v.room_id === room && v.title_id === id),
    onAnswer: (listener: (event: VoteQueueEvent) => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
})();
jest.mock('./index', () => ({
  get voteQueue() {
    return mockQueue;
  },
}));

function film(id: number): NextCard {
  return {
    title_id: id,
    tmdb_id: id,
    title: `Film ${id}`,
    overview: null,
    year: 2020,
    runtime_min: 100,
    genre_ids: [],
    tmdb_score: 7,
    tmdb_votes: 10,
    poster_path: '/p.jpg',
    poster_placeholder: null,
    backdrop_path: null,
    trailer_key: null,
    directors: [],
    cast: [],
    providers: [],
    watch_link: null,
    deck_source: 'opening',
    reason_code: null,
    reason_params: {},
    member_ratings: [],
    seen: false,
    saved: false,
  };
}
const deck = (n: number) => Array.from({ length: n }, (_, i) => film(i + 1));
const seat = { member_id: ME, super_likes_left: 2, swipe_count: 0 } as RoomSeat;
const flush = () => act(async () => void (await new Promise((r) => setImmediate(r))));

async function open() {
  const view = await renderHook(() => useSwipe(ROOM, seat, 393));
  await flush();
  return view;
}

beforeEach(() => {
  mockHandlers.clear();
  mockKept = ROOM;
  mockOnline = true;
  mockPresence.mockClear();
  mockInvalidate.mockClear();
  mockQueue.flush.mockClear();
  mockQueue.removeLast.mockClear();
  mockQueue.enqueueUndo.mockClear();
  mockQueue.store.setState({ votes: [] });
  mockApi.myNextCards.mockReset();
  mockApi.requestCards.mockReset();
  mockApi.myNextCards.mockResolvedValue(deck(40));
  mockApi.requestCards.mockResolvedValue({ status: 'queued' });
});

describe('the cards', () => {
  it('fetches the seats cards in the profile language and mounts three', async () => {
    const { result } = await open();
    expect(mockApi.myNextCards).toHaveBeenCalledWith(
      expect.objectContaining({ room_id: ROOM, member_id: ME }),
    );
    expect(result.current.stack.getState().mounted.map((c) => c.title_id)).toEqual([1, 2, 3]);
  });

  it('fetches again when deck_updated names this seat, and not when it names others', async () => {
    await open();
    mockApi.myNextCards.mockClear();
    await act(async () => mockHandlers.get('deck_updated')?.({ member_ids: ['someone-else'] }));
    expect(mockApi.myNextCards).not.toHaveBeenCalled();
    await act(async () => mockHandlers.get('deck_updated')?.({ member_ids: [ME] }));
    expect(mockApi.myNextCards).toHaveBeenCalledTimes(1);
  });

  it('never deals back an answer made while a fetch was in flight', async () => {
    const { result } = await open();
    let release: (cards: NextCard[]) => void = () => undefined;
    mockApi.myNextCards.mockReturnValueOnce(new Promise<NextCard[]>((r) => (release = r)));
    await act(async () => mockHandlers.get('deck_updated')?.({ member_ids: [ME] }));
    // The player answers card 1 and the queue sends it before the fetch returns.
    await act(async () => {
      result.current.answer('like');
      mockQueue.store.setState({ votes: [] });
    });
    await act(async () => release(deck(40)));
    const ids = result.current.stack.getState().mounted.map((c) => c.title_id);
    expect(ids).not.toContain(1);
    expect(ids).toEqual([2, 3, 4]);
  });
});

describe('the room moves on', () => {
  it('locks on a match event', async () => {
    const { result } = await open();
    expect(result.current.locked).toBe(false);
    await act(async () => mockHandlers.get('match')?.({ title_id: 1 }));
    expect(result.current.locked).toBe(true);
    expect(result.current.answer('like')).toBeNull();
  });

  it('does not lock on a match that is not decided, event or queue', async () => {
    const { result } = await open();
    await act(async () => mockHandlers.get('match')?.({ title_id: 1, decided: false }));
    await act(async () =>
      mockQueue.listeners.forEach((l) =>
        l({ type: 'match', room_id: ROOM, title_id: 1, decided: false }),
      ),
    );
    expect(result.current.locked).toBe(false);
  });

  it('reads the room again when it locks, so the layout follows even if its event was missed', async () => {
    await open();
    await act(async () => mockHandlers.get('match')?.({ title_id: 1 }));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['room', ROOM], exact: true });
  });

  it('locks when the room leaves swiping, not when it says swiping', async () => {
    const { result } = await open();
    await act(async () => mockHandlers.get('state_changed')?.({ state: 'swiping' }));
    expect(result.current.locked).toBe(false);
    await act(async () => mockHandlers.get('state_changed')?.({ state: 'finale' }));
    expect(result.current.locked).toBe(true);
  });

  it.each<VoteQueueEvent>([
    { type: 'match', room_id: ROOM, title_id: 1 },
    { type: 'finale', room_id: ROOM, round_id: 'r' },
    { type: 'closed', room_id: ROOM, state: 'done' },
  ])('locks when the queue hears $type', async (event) => {
    const { result } = await open();
    await act(async () => mockQueue.listeners.forEach((l) => l(event)));
    expect(result.current.locked).toBe(true);
  });

  it('ignores the queue hearing about another room', async () => {
    const { result } = await open();
    await act(async () =>
      mockQueue.listeners.forEach((l) => l({ type: 'closed', room_id: 'other', state: 'done' })),
    );
    expect(result.current.locked).toBe(false);
  });
});

describe('super likes', () => {
  it('drop with each one spent and come back when the server had none', async () => {
    const { result } = await open();
    expect(result.current.superLikesLeft).toBe(2);
    await act(async () => void result.current.answer('super_like'));
    expect(result.current.superLikesLeft).toBe(1);
    await act(async () =>
      mockQueue.listeners.forEach((l) => l({ type: 'no_super_likes', room_id: ROOM, title_id: 1 })),
    );
    expect(result.current.superLikesLeft).toBe(2);
  });
});

describe('Yes on the rewatch chip', () => {
  it('replaces a waiting seen with seen_rewatch: one vote, no undo, the card stays gone', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('seen'));
    let ok = false;
    await act(async () => void (ok = result.current.rewatch(1)));
    expect(ok).toBe(true);
    expect(mockQueue.store.getState().votes.map((v) => [v.title_id, v.answer])).toEqual([
      [1, 'seen_rewatch'],
    ]);
    expect(mockQueue.enqueueUndo).not.toHaveBeenCalled();
    expect(result.current.stack.getState().mounted.map((c) => c.title_id)).toEqual([2, 3, 4]);
    expect(result.current.count).toBe(1);
  });

  it('queues the undo and then the new vote when the seen already left, in that order', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('seen'));
    await act(async () => mockQueue.store.setState({ votes: [] }));
    await act(async () => void result.current.rewatch(1));
    expect(mockQueue.enqueueUndo).toHaveBeenCalledTimes(1);
    expect(mockQueue.enqueueUndo).toHaveBeenCalledWith(expect.objectContaining({ title_id: 1 }));
    expect(mockQueue.store.getState().votes.map((v) => v.answer)).toEqual(['seen_rewatch']);
  });

  it('keeps Undo awake for the new answer, and takes that one back', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('seen'));
    await act(async () => void result.current.rewatch(1));
    expect(result.current.canUndo).toBe(true);
    await act(async () => void result.current.undo());
    expect(mockQueue.store.getState().votes).toEqual([]);
    expect(result.current.stack.getState().mounted[0]?.title_id).toBe(1);
  });

  it('refuses for another film, for an answer that is not seen, and once the room moved on', async () => {
    const { result } = await open();
    let ok = true;
    await act(async () => void (ok = result.current.rewatch(1)));
    expect(ok).toBe(false);
    await act(async () => void result.current.answer('nope'));
    await act(async () => void (ok = result.current.rewatch(1)));
    expect(ok).toBe(false);
    await act(async () => void result.current.answer('seen'));
    await act(async () => void (ok = result.current.rewatch(1)));
    expect(ok).toBe(false);
    await act(async () => mockHandlers.get('match')?.({ title_id: 9 }));
    await act(async () => void (ok = result.current.rewatch(2)));
    expect(ok).toBe(false);
    expect(mockQueue.store.getState().votes.map((v) => v.answer)).toEqual(['nope', 'seen']);
  });
});

describe('undo', () => {
  it('is asleep until the first answer, then removes a vote still waiting and puts the card back', async () => {
    const { result } = await open();
    expect(result.current.canUndo).toBe(false);
    await act(async () => void result.current.answer('like'));
    expect(result.current.canUndo).toBe(true);
    await act(async () => void result.current.undo());
    expect(mockQueue.store.getState().votes).toEqual([]);
    expect(mockQueue.enqueueUndo).not.toHaveBeenCalled();
    expect(result.current.stack.getState().mounted.map((c) => c.title_id)).toEqual([1, 2, 3]);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.returning?.card.title_id).toBe(1);
  });

  it('queues one undo when the vote already left the phone', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('nope'));
    await act(async () => mockQueue.store.setState({ votes: [] }));
    await act(async () => void result.current.undo());
    expect(mockQueue.enqueueUndo).toHaveBeenCalledTimes(1);
    expect(result.current.undo()).toBeNull();
    expect(mockQueue.enqueueUndo).toHaveBeenCalledTimes(1);
  });

  it('gives a super like back', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('super_like'));
    expect(result.current.superLikesLeft).toBe(1);
    await act(async () => void result.current.undo());
    expect(result.current.superLikesLeft).toBe(2);
  });

  it('is not dealt back by a refill that was already in flight, but can be answered again', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('like'));
    await act(async () => void result.current.undo());
    await act(async () => void result.current.answer('nope'));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.returning).toBeNull();
  });

  it('gives a refused super like back once, whether the refusal or the undo comes first', async () => {
    const refuse = (id: number) =>
      mockQueue.listeners.forEach((l) =>
        l({ type: 'no_super_likes', room_id: ROOM, title_id: id }),
      );
    // The refusal first, then the undo.
    const first = await open();
    await act(async () => void first.result.current.answer('super_like'));
    await act(async () => refuse(1));
    expect(first.result.current.superLikesLeft).toBe(2);
    await act(async () => void first.result.current.undo());
    expect(first.result.current.superLikesLeft).toBe(2);
    expect(mockQueue.enqueueUndo).not.toHaveBeenCalled();
    // The undo first, then the refusal.
    await first.unmount();
    await act(async () => mockQueue.store.setState({ votes: [] }));
    const second = await open();
    await act(async () => void second.result.current.answer('super_like'));
    await act(async () => void second.result.current.undo());
    expect(second.result.current.superLikesLeft).toBe(2);
    await act(async () => refuse(1));
    expect(second.result.current.superLikesLeft).toBe(2);
  });

  it('answers the same super like again after an undo, and spends it again', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('super_like'));
    await act(async () => void result.current.undo());
    await act(async () => void result.current.answer('super_like'));
    expect(result.current.superLikesLeft).toBe(1);
  });

  it('remembers the side the card left from, for the way back', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('seen'));
    await act(async () => void result.current.undo('left'));
    expect(result.current.returning?.direction).toBe('left');
  });

  it('lowers the swipe count it reports', async () => {
    const { result } = await open();
    for (let i = 0; i < 5; i++) await act(async () => void result.current.answer('like'));
    expect(mockPresence).toHaveBeenLastCalledWith({ swipe_count: 5, done: false });
    await act(async () => void result.current.undo());
    expect(mockPresence).toHaveBeenLastCalledWith({ swipe_count: 4, done: false });
    // The player's own pill counts the same.
    expect(result.current.count).toBe(4);
  });

  it('does nothing once the room moved on', async () => {
    const { result } = await open();
    await act(async () => void result.current.answer('like'));
    await act(async () => mockHandlers.get('finale_started')?.({}));
    expect(result.current.canUndo).toBe(false);
    await act(async () => void result.current.undo());
    expect(mockQueue.removeLast).not.toHaveBeenCalled();
  });
});

describe('presence', () => {
  it('carries the swipe count at 5, 10 and 15 answers, not in between', async () => {
    mockApi.requestCards.mockResolvedValue({ status: 'ok' });
    const { result } = await open();
    for (let i = 1; i <= 15; i++) {
      await act(async () => void result.current.answer('like'));
      await flush(); // the refill arrives
      if (i === 4) expect(mockPresence).not.toHaveBeenCalled();
    }
    expect(mockPresence.mock.calls).toEqual([
      [{ swipe_count: 5, done: false }],
      [{ swipe_count: 10, done: false }],
      [{ swipe_count: 15, done: false }],
    ]);
  });

  it('says done when the server has no more cards for this seat', async () => {
    mockApi.myNextCards.mockResolvedValue([]);
    mockApi.requestCards.mockResolvedValue({ status: 'enough' });
    await open();
    await flush();
    expect(mockPresence).toHaveBeenCalledWith({ swipe_count: 0, done: true });
  });

  it('says not done any more when Undo brings back the card that emptied the stack', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      mockApi.myNextCards.mockResolvedValueOnce(deck(1)).mockResolvedValue([]);
      mockApi.requestCards.mockResolvedValue({ status: 'enough' });
      const { result } = await open();
      await act(async () => void result.current.answer('like'));
      // The stack asks the server again when its retry timer runs, and finds nothing left.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(9000);
      });
      await flush();
      expect(mockPresence).toHaveBeenLastCalledWith({ swipe_count: 1, done: true });
      await act(async () => void result.current.undo());
      expect(mockPresence).toHaveBeenLastCalledWith({ swipe_count: 0, done: false });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the queue', () => {
  it('flushes once the room is the kept one', async () => {
    mockKept = undefined;
    const view = await open();
    expect(mockQueue.flush).not.toHaveBeenCalled();
    mockKept = ROOM;
    await view.rerender({});
    expect(mockQueue.flush).toHaveBeenCalled();
  });

  it('does not flush for a room the phone does not keep', async () => {
    mockKept = 'other';
    await open();
    expect(mockQueue.flush).not.toHaveBeenCalled();
  });

  it('flushes again when the phone comes back online', async () => {
    mockOnline = false;
    const view = await open();
    expect(mockQueue.flush).not.toHaveBeenCalled();
    mockOnline = true;
    await view.rerender({});
    expect(mockQueue.flush).toHaveBeenCalled();
  });

  it('counts the votes waiting for this room only', async () => {
    const { result } = await open();
    await act(async () => {
      mockQueue.enqueue({ room_id: ROOM, title_id: 1 } as QueuedVote);
      mockQueue.enqueue({ room_id: ROOM, title_id: 2 } as QueuedVote);
      mockQueue.enqueue({ room_id: 'other', title_id: 3 } as QueuedVote);
    });
    expect(result.current.waitingVotes).toBe(2);
  });
});

describe('offline', () => {
  it('keeps the cards on the phone and waits for the connection when none are left', async () => {
    mockApi.myNextCards.mockResolvedValue([]);
    mockApi.requestCards.mockResolvedValue({ status: 'queued' });
    mockOnline = false;
    const { result } = await open();
    expect(result.current.stack.getState().status).toBe('waiting_offline');
  });
});

describe('the shortlist', () => {
  const controller = () =>
    createShortlistController({ onBeat: () => undefined, onMismatch: () => undefined });
  const wrap = (shortlist: ReturnType<typeof controller>) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <ShortlistProvider value={shortlist}>{children}</ShortlistProvider>;
    };
  const openWith = async (shortlist: ReturnType<typeof controller>) => {
    const view = await renderHook(() => useSwipe(ROOM, seat, 393), { wrapper: wrap(shortlist) });
    await flush();
    return view;
  };
  const ids = (view: { result: { current: ReturnType<typeof useSwipe> } }) => {
    const { mounted, buffer } = view.result.current.stack.getState();
    return [...mounted, ...buffer].map((c) => c.title_id);
  };
  const matched = (title_id: number) => ({
    title_id,
    likes: 3,
    of: 3,
    decided: false,
    shortlisted: 1,
    shortlist_size: 3,
  });

  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  it('takes no answer during the beat and gives the stack back after it', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    await act(async () => shortlist.signal(matched(9)));
    expect(view.result.current.beating).toBe(true);
    expect(view.result.current.answer('like')).toBeNull();
    expect(mockQueue.store.getState().votes).toEqual([]);
    await act(async () => void jest.advanceTimersByTime(1750));
    expect(view.result.current.beating).toBe(false);
    expect(view.result.current.answer('like')).not.toBeNull();
  });

  it('takes a matched film out of the stack, mounted or behind, and sends no vote for it', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    expect(view.result.current.stack.getState().mounted.map((c) => c.title_id)).toEqual([1, 2, 3]);
    await act(async () => {
      shortlist.signal(matched(2));
      shortlist.signal({ ...matched(8), shortlisted: 2 });
    });
    await act(async () => void jest.advanceTimersByTime(200));
    expect(ids(view)).not.toContain(2);
    expect(ids(view)).not.toContain(8);
    expect(view.result.current.stack.getState().mounted.map((c) => c.title_id)).toEqual([1, 3, 4]);
    expect(mockQueue.store.getState().votes).toEqual([]);
  });

  it('takes a film read back (a cold start) out of the stack with no beat', async () => {
    const shortlist = controller();
    shortlist.readBack([1, 5]);
    const view = await openWith(shortlist);
    expect(view.result.current.beating).toBe(false);
    expect(ids(view)).not.toContain(1);
    expect(ids(view)).not.toContain(5);
    expect(view.result.current.stack.getState().mounted.map((c) => c.title_id)).toEqual([2, 3, 4]);
  });

  it('turns Undo off while the last card answered is on the shortlist, and on at the next answer', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    await act(async () => void view.result.current.answer('like'));
    expect(view.result.current.canUndo).toBe(true);
    await act(async () => shortlist.signal(matched(1)));
    expect(view.result.current.canUndo).toBe(false);
    expect(view.result.current.undoShortlisted).toBe(true);
    await act(async () => void jest.advanceTimersByTime(1750));
    await act(async () => void view.result.current.answer('nope'));
    expect(view.result.current.canUndo).toBe(true);
    expect(view.result.current.undoShortlisted).toBe(false);
  });

  it('takes the card Undo brought back away again when the server says locked, and counts it answered', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    await act(async () => void view.result.current.answer('super_like'));
    await act(async () => mockQueue.store.setState({ votes: [] }));
    await act(async () => void view.result.current.undo());
    expect(view.result.current.stack.getState().mounted[0]?.title_id).toBe(1);
    expect(view.result.current.superLikesLeft).toBe(2);
    expect(view.result.current.count).toBe(0);
    await act(async () =>
      mockQueue.listeners.forEach((l) => l({ type: 'undo_locked', room_id: ROOM, title_id: 1 })),
    );
    expect(ids(view)).not.toContain(1);
    expect(view.result.current.stack.getState().mounted[0]?.title_id).toBe(2);
    expect(view.result.current.superLikesLeft).toBe(1);
    expect(view.result.current.count).toBe(1);
    expect(view.result.current.canUndo).toBe(false);
  });

  it('leaves the count and the super like alone when another phone completes the match after an accepted undo', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    await act(async () => void view.result.current.answer('super_like'));
    await act(async () => mockQueue.store.setState({ votes: [] }));
    await act(async () => void view.result.current.undo());
    expect(view.result.current.count).toBe(0);
    expect(view.result.current.superLikesLeft).toBe(2);
    // The card is back on top and the server has no vote from this phone for it.
    await act(async () => shortlist.signal(matched(1)));
    await act(async () => void jest.advanceTimersByTime(200));
    expect(ids(view)).not.toContain(1);
    expect(view.result.current.count).toBe(0);
    expect(view.result.current.superLikesLeft).toBe(2);
  });

  it('counts the vote again when its own answer says match after an undo in flight', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    await act(async () => void view.result.current.answer('like'));
    await act(async () => mockQueue.store.setState({ votes: [] }));
    await act(async () => void view.result.current.undo());
    expect(view.result.current.count).toBe(0);
    await act(async () =>
      mockQueue.listeners.forEach((l) =>
        l({ type: 'match', room_id: ROOM, title_id: 1, kind: 'unanimous', decided: false }),
      ),
    );
    expect(view.result.current.count).toBe(1);
  });

  it('keeps the card when the undo is locked after the room moved on: the layout follows the room', async () => {
    const shortlist = controller();
    const view = await openWith(shortlist);
    await act(async () => void view.result.current.answer('like'));
    await act(async () => mockQueue.store.setState({ votes: [] }));
    await act(async () => void view.result.current.undo());
    await act(async () => mockHandlers.get('state_changed')?.({ state: 'finale' }));
    await act(async () =>
      mockQueue.listeners.forEach((l) => l({ type: 'undo_locked', room_id: ROOM, title_id: 1 })),
    );
    expect(view.result.current.locked).toBe(true);
    expect(view.result.current.stack.getState().mounted[0]?.title_id).toBe(1);
  });
});
