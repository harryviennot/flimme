import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { track, trackWhenRoomKnown } from '@/lib/analytics';

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
