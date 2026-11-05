import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';

import { useSoloDealFallback, useSoloEnd, DEAL_FALLBACK_MS } from './use-solo-room';

const mockExit = jest.fn();
let mockLeaving = false;
jest.mock('@/api', () => ({ api: { roomMatches: jest.fn(), startGame: jest.fn() } }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/room', () => ({
  ROOM_KEY: (id: string) => ['room', id],
  useExitRoomToHome: () => mockExit,
  useRoom: () => ({ data: undefined }),
}));
jest.mock('./leave', () => ({ isLeavingSolo: () => mockLeaving }));

const mockApi = api as unknown as Record<'roomMatches' | 'startGame', jest.Mock>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLeaving = false;
});

describe('a solo session that ended', () => {
  it('goes to Play with the session-ended note, once, when nothing was picked', async () => {
    mockApi.roomMatches.mockResolvedValue([]);
    const { result, rerender } = await renderHook(() => useSoloEnd('r1', 'done', true), {
      wrapper,
    });
    await waitFor(() => expect(mockExit).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith({
      tone: 'info',
      title: 'Your solo session ended.',
      message: 'Your likes are in My films.',
    });
    // The layout keeps holding its route change: this room never shows a winner.
    expect(result.current).toBe(true);
    await rerender({});
    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it("says nothing after the phone's own leave", async () => {
    mockLeaving = true;
    mockApi.roomMatches.mockResolvedValue([]);
    await renderHook(() => useSoloEnd('r1', 'done', true), { wrapper });
    await waitFor(() => expect(mockApi.roomMatches).toHaveBeenCalled());
    await waitFor(() => expect(mockExit).not.toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });

  it('holds the route until the pick has been read, then lets the winner screen show', async () => {
    // The read stays open until the test answers it, so the hold is seen before the pick lands.
    let answer: (rows: unknown) => void = () => {};
    mockApi.roomMatches.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = await renderHook(() => useSoloEnd('r1', 'done', true), { wrapper });
    await waitFor(() => expect(mockApi.roomMatches).toHaveBeenCalled());
    expect(result.current).toBe(true);
    await act(async () => answer([{ title_id: 7, pick_order: 1 }]));
    await waitFor(() => expect(result.current).toBe(false));
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('ends an abandoned solo room with the note, without reading any pick', async () => {
    await renderHook(() => useSoloEnd('r1', 'abandoned', true), { wrapper });
    await waitFor(() => expect(mockExit).toHaveBeenCalledTimes(1));
    expect(mockApi.roomMatches).not.toHaveBeenCalled();
  });

  it('does nothing in a group room', async () => {
    const { result } = await renderHook(() => useSoloEnd('r1', 'done', false), { wrapper });
    expect(result.current).toBe(false);
    expect(mockExit).not.toHaveBeenCalled();
    expect(mockApi.roomMatches).not.toHaveBeenCalled();
  });
});

describe('a solo room that stays dealing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks the server to deal after 8 seconds, once', async () => {
    mockApi.startGame.mockResolvedValue({ status: 'ok' });
    await renderHook(() => useSoloDealFallback('r1', 'dealing', true));
    jest.advanceTimersByTime(DEAL_FALLBACK_MS - 1);
    expect(mockApi.startGame).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(mockApi.startGame).toHaveBeenCalledWith({ room_id: 'r1' });
    jest.advanceTimersByTime(DEAL_FALLBACK_MS * 3);
    expect(mockApi.startGame).toHaveBeenCalledTimes(1);
  });

  it('does not ask once the room is swiping, or for a group room', async () => {
    await renderHook(() => useSoloDealFallback('r1', 'swiping', true));
    await renderHook(() => useSoloDealFallback('r1', 'dealing', false));
    jest.advanceTimersByTime(DEAL_FALLBACK_MS * 2);
    expect(mockApi.startGame).not.toHaveBeenCalled();
  });
});
