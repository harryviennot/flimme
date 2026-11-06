import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { api } from '@/api';

import { useHeartbeat, useRefreshOnForeground } from './heartbeat';

jest.mock('@/api', () => ({ api: { touchRoom: jest.fn() } }));

const touch = api.touchRoom as jest.Mock;
let listeners: ((state: string) => void)[] = [];
let appState = 'active';

beforeEach(() => {
  jest.useFakeTimers();
  touch.mockReset().mockResolvedValue(undefined);
  listeners = [];
  appState = 'active';
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => appState });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: never) => {
    listeners.push(fn);
    return { remove: () => (listeners = listeners.filter((l) => l !== fn)) };
  }) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const emit = async (state: string) => {
  appState = state;
  await act(async () => listeners.forEach((l) => l(state)));
};

describe('useHeartbeat', () => {
  it('touches at mount, at 30 s and at 60 s', async () => {
    await renderHook(() => useHeartbeat('r1'));
    expect(touch).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledWith({ room_id: 'r1' });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(touch).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(touch).toHaveBeenCalledTimes(3);
  });

  it('stops in the background and resumes at once on return', async () => {
    await renderHook(() => useHeartbeat('r1'));
    await emit('background');
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(touch).toHaveBeenCalledTimes(1);
    await emit('active');
    expect(touch).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(touch).toHaveBeenCalledTimes(3);
  });

  it('does not run when disabled, and stops on unmount', async () => {
    await renderHook(() => useHeartbeat('r1', false));
    expect(touch).not.toHaveBeenCalled();
    const { unmount } = await renderHook(() => useHeartbeat('r1'));
    await unmount();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(touch).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected call and ticks again', async () => {
    touch.mockRejectedValue(new Error('offline'));
    await renderHook(() => useHeartbeat('r1'));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(touch).toHaveBeenCalledTimes(2);
  });
});

describe('useRefreshOnForeground', () => {
  it('re-reads the room and its seats when the app returns', async () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await renderHook(() => useRefreshOnForeground('r1'), { wrapper });
    await emit('background');
    expect(spy).not.toHaveBeenCalled();
    await emit('active');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['room', 'r1'] });
  });

  it('marks the genre counts stale too: they sit under the room key', async () => {
    const client = new QueryClient();
    client.setQueryData(['room', 'r1', 'genres'], { status: 'ok', options: [], mine: [] });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await renderHook(() => useRefreshOnForeground('r1'), { wrapper });
    await emit('background');
    await emit('active');
    expect(client.getQueryState(['room', 'r1', 'genres'])?.isInvalidated).toBe(true);
  });
});
