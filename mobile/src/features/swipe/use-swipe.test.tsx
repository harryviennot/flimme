import type { NextCard, RoomSeat } from '@flimme/contract';
import { act, renderHook } from '@testing-library/react-native';
import { create } from 'zustand';

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
