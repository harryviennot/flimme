import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { track, trackWhenRoomKnown } from '@/lib/analytics';
import { playSound } from '@/lib/sound';

import { useJoinAttempt } from './use-join-attempt';

jest.mock('@/api', () => ({ api: { joinRoom: jest.fn() } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), trackWhenRoomKnown: jest.fn() }));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
jest.mock('@/features/profile', () => ({ MY_PROFILE_KEY: ['my_profile'] }));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn() } }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('./old-seat', () => ({ keptRoomId: () => null, leaveOldSeat: jest.fn() }));
jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));

const joinRoom = api.joinRoom as unknown as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('the join screen and analytics', () => {
  it('reports the code once the sixth digit is in, never the digits', async () => {
    joinRoom.mockResolvedValue({ status: 'not_found' });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => view.result.current.setCode('48291'));
    expect(track).not.toHaveBeenCalled();
    await act(async () => view.result.current.setCode('482913'));
    expect(track).toHaveBeenCalledWith('join:code_submit', { via: 'code' });
    expect(JSON.stringify(jest.mocked(track).mock.calls)).not.toContain('482913');
  });

  it('sends a refusal at once, with its status', async () => {
    joinRoom.mockResolvedValue({ status: 'full', max_players: 10 });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => view.result.current.setCode('482913'));
    expect(track).toHaveBeenCalledWith('join:attempt_finish', { via: 'code', status: 'full' });
  });

  it('holds a seat taken until the room is known', async () => {
    joinRoom.mockResolvedValue({ status: 'ok', room_id: 'r1', state: 'lobby' });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => view.result.current.setCode('482913'));
    expect(trackWhenRoomKnown).toHaveBeenCalledWith('join:attempt_finish', {
      via: 'code',
      status: 'ok',
    });
  });

  it('counts a pasted invite link as a link join', async () => {
    joinRoom.mockResolvedValue({ status: 'closed' });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () =>
      view.result.current.paste(
        'https://flimme.com/join/482913?r=3f2c0b1e-8d4a-4c1e-9b7a-1a2b3c4d5e6f',
      ),
    );
    expect(track).toHaveBeenCalledWith('join:attempt_finish', { via: 'link', status: 'closed' });
  });
});

describe('the join sound (sounds.md#joining-a-room)', () => {
  it('tears the ticket when the join answers ok', async () => {
    joinRoom.mockResolvedValue({ status: 'ok', room_id: 'r1', state: 'lobby' });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => view.result.current.setCode('482913'));
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('join');
  });

  it('plays the error sound, not the join, on a refusal or a failed call', async () => {
    joinRoom.mockResolvedValueOnce({ status: 'full', max_players: 10 });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => view.result.current.setCode('482913'));
    joinRoom.mockRejectedValueOnce(new Error('offline'));
    await act(async () => view.result.current.setCode('48291'));
    await act(async () => view.result.current.setCode('482914'));
    expect(jest.mocked(playSound).mock.calls).toEqual([['error'], ['error']]);
  });

  it('asks for a name without a sound', async () => {
    joinRoom.mockResolvedValue({ status: 'name_required', host_name: 'Sam' });
    const view = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => view.result.current.setCode('482913'));
    expect(playSound).not.toHaveBeenCalled();
  });
});
