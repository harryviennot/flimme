import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';
import { duration } from '@/theme/motion';

import { matchShownStore } from '../room/match-shown';
import { SKIP_AFTER_MS } from './controller';
import { useMatchOverlay } from './use-match-overlay';

const mockApi = { roomMatches: jest.fn() };
jest.mock('@/api', () => ({
  get api() {
    return mockApi;
  },
}));
const mockListeners: ((event: unknown) => void)[] = [];
jest.mock('@/features/swipe', () => ({
  voteQueue: {
    onAnswer: (listener: (event: unknown) => void) => {
      mockListeners.push(listener);
      return () => void mockListeners.splice(mockListeners.indexOf(listener), 1);
    },
  },
}));
jest.mock('@/lib/haptics', () => ({ haptics: { match: jest.fn() } }));
jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type Handler = (payload: unknown) => void;
function fakeRealtime() {
  const handlers: Handler[] = [];
  return {
    listen: (_event: string, handler: Handler) => {
      handlers.push(handler);
      return () => void handlers.splice(handlers.indexOf(handler), 1);
    },
    emit: (payload: unknown) => handlers.forEach((h) => h(payload)),
  };
}

const event = { title_id: 7, kind: 'unanimous', likes: 3, of: 3, decided: true };
const row = {
  room_id: 'r1',
  title_id: 7,
  kind: 'majority',
  like_count: 2,
  present_count: 3,
  pick_order: 1,
  created_at: '',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockApi.roomMatches.mockReset();
  matchShownStore.setState({ rooms: [] });
});
afterEach(() => jest.useRealTimers());

describe('useMatchOverlay', () => {
  it('starts on the match event, once, with the haptic and the sound', async () => {
    const realtime = fakeRealtime();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'swiping', true, realtime), {
      wrapper,
    });
    await act(async () => realtime.emit(event));
    expect(result.current.match).toEqual({ title_id: 7, likes: 3, of: 3 });
    expect(result.current.holdRoute).toBe(true);
    await act(async () => realtime.emit({ ...event, title_id: 9 }));
    expect(result.current.match?.title_id).toBe(7);
    expect(haptics.match).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('match');
  });

  it('starts on the phone’s own answer, and the event for the same film joins it', async () => {
    const realtime = fakeRealtime();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'swiping', true, realtime), {
      wrapper,
    });
    await act(async () =>
      mockListeners.forEach((l) => l({ type: 'match', room_id: 'r1', title_id: 7 })),
    );
    expect(result.current.match).toEqual({ title_id: 7, likes: null, of: null });
    await act(async () => realtime.emit(event));
    expect(result.current.match).toEqual({ title_id: 7, likes: 3, of: 3 });
    expect(haptics.match).toHaveBeenCalledTimes(1);
  });

  it('ignores another room’s answer', async () => {
    const { result } = await renderHook(
      () => useMatchOverlay('r1', 'swiping', true, fakeRealtime()),
      {
        wrapper,
      },
    );
    await act(async () =>
      mockListeners.forEach((l) => l({ type: 'match', room_id: 'r2', title_id: 7 })),
    );
    expect(result.current.match).toBeNull();
  });

  it('closes at the hold, and a tap closes it sooner (not in the first 800 ms)', async () => {
    const realtime = fakeRealtime();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'swiping', true, realtime), {
      wrapper,
    });
    await act(async () => realtime.emit(event));
    await act(async () => result.current.skip());
    expect(result.current.match).not.toBeNull();
    await act(async () => jest.advanceTimersByTime(SKIP_AFTER_MS));
    await act(async () => result.current.skip());
    expect(result.current.match).toBeNull();
    expect(result.current.holdRoute).toBe(false);
  });

  it('hands over by itself at the hold', async () => {
    const realtime = fakeRealtime();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'swiping', true, realtime), {
      wrapper,
    });
    await act(async () => realtime.emit(event));
    await act(async () => jest.advanceTimersByTime(duration['match-hold'] - 1));
    expect(result.current.match).not.toBeNull();
    await act(async () => jest.advanceTimersByTime(1));
    expect(result.current.match).toBeNull();
  });

  it('plays once per room, even after a restart', async () => {
    const realtime = fakeRealtime();
    const first = await renderHook(() => useMatchOverlay('r1', 'swiping', true, realtime), {
      wrapper,
    });
    await act(async () => realtime.emit(event));
    await act(async () => void jest.advanceTimersByTime(duration['match-hold']));
    await act(async () => first.unmount());
    // A restart: a new hook over the same remembered rooms.
    const reopened = fakeRealtime();
    const second = await renderHook(() => useMatchOverlay('r1', 'done', true, reopened), {
      wrapper,
    });
    await act(async () => reopened.emit(event));
    expect(second.result.current.match).toBeNull();
    expect(second.result.current.holdRoute).toBe(false);
    expect(mockApi.roomMatches).not.toHaveBeenCalled();
  });

  it('a re-read of a decided room that was not shown plays it once', async () => {
    mockApi.roomMatches.mockResolvedValue([row]);
    jest.useRealTimers();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'done', true, fakeRealtime()), {
      wrapper,
    });
    expect(result.current.holdRoute).toBe(true);
    await waitFor(() => expect(result.current.match).toEqual({ title_id: 7, likes: 2, of: 3 }));
    expect(haptics.match).toHaveBeenCalledTimes(1);
  });

  it('does not hold the route for a finale pick, by event or by re-read', async () => {
    const realtime = fakeRealtime();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'finale', true, realtime), {
      wrapper,
    });
    await act(async () => realtime.emit({ ...event, kind: 'finale' }));
    expect(result.current.match).toBeNull();
    expect(result.current.holdRoute).toBe(false);
    mockApi.roomMatches.mockResolvedValue([{ ...row, kind: 'finale' }]);
    jest.useRealTimers();
    const reread = await renderHook(() => useMatchOverlay('r2', 'done', true, fakeRealtime()), {
      wrapper,
    });
    await waitFor(() => expect(reread.result.current.holdRoute).toBe(false));
    expect(reread.result.current.match).toBeNull();
    expect(haptics.match).not.toHaveBeenCalled();
  });

  it('does not hold the route when the re-read finds no pick', async () => {
    mockApi.roomMatches.mockResolvedValue([]);
    jest.useRealTimers();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'done', true, fakeRealtime()), {
      wrapper,
    });
    await waitFor(() => expect(result.current.holdRoute).toBe(false));
    expect(result.current.match).toBeNull();
  });

  it('shows nothing to a phone whose seat has left', async () => {
    const realtime = fakeRealtime();
    const { result } = await renderHook(() => useMatchOverlay('r1', 'swiping', false, realtime), {
      wrapper,
    });
    await act(async () => realtime.emit(event));
    await act(async () =>
      mockListeners.forEach((l) => l({ type: 'match', room_id: 'r1', title_id: 7 })),
    );
    expect(result.current.match).toBeNull();
    expect(haptics.match).not.toHaveBeenCalled();
  });
});
