import { ApiError, JOIN_ROOM_ANSWERS, PLANNED_JOIN_ROOM_ANSWERS } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { createElement, type ReactNode } from 'react';

import { haptics } from '@/lib/haptics';

import { JOIN_ROWS } from './rows';
import { useJoinAttempt } from './use-join-attempt';

const REF = '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41';

const mockJoinRoom = jest.fn();
jest.mock('@/api', () => ({ api: { joinRoom: (...args: unknown[]) => mockJoinRoom(...args) } }));

let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));

jest.mock('@/features/profile', () => ({ MY_PROFILE_KEY: ['my_profile'] }));

let mockFocus: (() => void) | undefined;
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...a: unknown[]) => mockReplace(...a),
    push: (...a: unknown[]) => mockPush(...a),
  },
  useFocusEffect: (cb: () => void) => {
    mockFocus = cb;
  },
}));

jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn() } }));

let client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

beforeEach(() => {
  jest.useFakeTimers();
  mockJoinRoom.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
  (haptics.error as jest.Mock).mockReset();
  mockOnline = true;
  client = new QueryClient();
  client.setQueryData(['my_profile'], { display_name: '' });
  mockFocus = undefined;
});
afterEach(() => jest.useRealTimers());

async function type(result: { current: ReturnType<typeof useJoinAttempt> }, text: string) {
  for (let i = 1; i <= text.length; i += 1) {
    await act(async () => result.current.setCode(text.slice(0, i)));
  }
}

describe('the answer rows', () => {
  it('has a row for every answer, planned ones included', () => {
    for (const answer of [...JOIN_ROOM_ANSWERS, ...PLANNED_JOIN_ROOM_ANSWERS]) {
      expect(JOIN_ROWS[answer]).toBeDefined();
    }
  });
});

describe('useJoinAttempt', () => {
  it('joins once on the sixth digit, not before', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'not_found' });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '48291');
    expect(mockJoinRoom).not.toHaveBeenCalled();
    await type(result, '482913');
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    expect(mockJoinRoom).toHaveBeenCalledWith({ code: '482913', via: 'code' });
  });

  it('shakes on not_found with a haptic, then clears when the shake ends', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'not_found' });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.view).toMatchObject({ kind: 'message', message: 'errors.notFound' });
    expect(result.current.shaking).toBe(true);
    expect(result.current.error).toBe(true);
    expect(haptics.error).toHaveBeenCalledTimes(1);
    expect(result.current.code).toBe('482913');
    await act(async () => result.current.finishShake());
    expect(result.current.code).toBe('');
    expect(result.current.shaking).toBe(false);
    expect(result.current.view).toMatchObject({ message: 'errors.notFound' });
  });

  it('keeps the digits on full and carries the maximum', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'full', max_players: 8 });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.view).toEqual({
      kind: 'message',
      message: 'errors.full',
      params: { max: 8 },
      next: 'host',
    });
    expect(result.current.code).toBe('482913');
    expect(result.current.shaking).toBe(false);
  });

  it.each([
    ['in_finale', 'errors.inFinale', 'host', '482913'],
    ['locked', 'errors.locked', 'host', '482913'],
    ['closed', 'errors.closed', 'host', ''],
    ['removed', 'errors.removed', 'host', ''],
    ['rate_limited', 'errors.rateLimited', null, ''],
  ])('%s shows its message', async (status, message, next, digits) => {
    mockJoinRoom.mockResolvedValue({ status });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.view).toMatchObject({ kind: 'message', message, next });
    expect(result.current.code).toBe(digits);
    expect(result.current.shaking).toBe(false);
    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it('retries every second while starting, then gives up after 10 seconds', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'starting' });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.view).toEqual({ kind: 'shuffling' });
    expect(haptics.error).not.toHaveBeenCalled();
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
    }
    expect(mockJoinRoom).toHaveBeenCalledTimes(11);
    expect(result.current.view).toEqual({
      kind: 'message',
      message: 'errors.starting',
      next: 'retry',
    });
    expect(result.current.code).toBe('482913');

    mockJoinRoom.mockResolvedValue({
      status: 'ok',
      room_id: 'r1',
      member_id: 'm',
      state: 'swiping',
      rejoined: false,
    });
    await act(async () => result.current.retry());
    expect(mockReplace).toHaveBeenCalledWith('/room/r1/swipe');
  });

  it('joins when the game finishes starting', async () => {
    mockJoinRoom.mockResolvedValueOnce({ status: 'starting' }).mockResolvedValue({
      status: 'ok',
      room_id: 'r1',
      member_id: 'm',
      state: 'lobby',
      rejoined: true,
    });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(mockReplace).toHaveBeenCalledWith('/room/r1/lobby');
  });

  it.each([
    ['lobby', '/room/r1/lobby'],
    ['dealing', '/room/r1/lobby'],
    ['swiping', '/room/r1/swipe'],
    ['finale', '/room/r1/final-cut'],
  ])('ok in %s replaces to %s', async (state, route) => {
    mockJoinRoom.mockResolvedValue({
      status: 'ok',
      room_id: 'r1',
      member_id: 'm',
      state,
      rejoined: false,
    });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(mockReplace).toHaveBeenCalledWith(route);
    expect(haptics.error).not.toHaveBeenCalled();
  });

  it('goes to the name screen on name_required and joins again only with a name', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: 'Camille' });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/name', params: { code: '482913' } });
    expect(result.current.view).toEqual({ kind: 'idle' });

    // Backed out without a name: the digits stay, nothing happens.
    await act(async () => mockFocus?.());
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    expect(result.current.code).toBe('482913');

    // Saved a name, then came back.
    mockJoinRoom.mockResolvedValue({
      status: 'ok',
      room_id: 'r1',
      member_id: 'm',
      state: 'lobby',
      rejoined: false,
    });
    await act(async () => result.current.setCode('48291'));
    await act(async () => result.current.setCode('482913'));
    expect(mockJoinRoom).toHaveBeenCalledTimes(2);
  });

  it('joins again on refocus when the profile now has a name', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: null });
    const { result, rerender } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    client.setQueryData(['my_profile'], { display_name: 'Coco' });
    mockJoinRoom.mockResolvedValue({
      status: 'ok',
      room_id: 'r1',
      member_id: 'm',
      state: 'lobby',
      rejoined: false,
    });
    await rerender({});
    await act(async () => mockFocus?.());
    expect(mockJoinRoom).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledWith('/room/r1/lobby');
  });

  it('waits offline, then joins by itself when the connection is back', async () => {
    mockOnline = false;
    mockJoinRoom.mockResolvedValue({ status: 'not_found' });
    const { result, rerender } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.view).toMatchObject({ message: 'errors.offline' });
    expect(result.current.error).toBe(false);
    expect(mockJoinRoom).not.toHaveBeenCalled();
    mockOnline = true;
    await rerender({});
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
  });

  it('shows the network message when the call is rejected, and Retry calls again', async () => {
    mockJoinRoom.mockRejectedValue(new ApiError('network', 'join_room', 'down'));
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.view).toEqual({
      kind: 'message',
      message: 'errors.network',
      next: 'retry',
    });
    expect(haptics.error).toHaveBeenCalledTimes(1);
    expect(result.current.code).toBe('482913');
    mockJoinRoom.mockResolvedValue({ status: 'full', max_players: 10 });
    await act(async () => result.current.retry());
    expect(mockJoinRoom).toHaveBeenCalledTimes(2);
    expect(mockJoinRoom).toHaveBeenLastCalledWith({ code: '482913', via: 'code' });
  });

  it('clears the message and the red boxes on a keystroke', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'full', max_players: 10 });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await type(result, '482913');
    expect(result.current.error).toBe(true);
    await act(async () => result.current.setCode('48291'));
    expect(result.current.view).toEqual({ kind: 'idle' });
    expect(result.current.error).toBe(false);
  });

  it('sends a pasted link with its reference, and again on retry', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'closed' });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => result.current.paste(`https://x.y/join/482913?r=${REF}`));
    expect(mockJoinRoom).toHaveBeenCalledWith({ code: '482913', ref: REF, via: 'link' });
    expect(mockJoinRoom.mock.calls[0]?.[0]).not.toHaveProperty('link_opened_at');
    mockJoinRoom.mockRejectedValue(new ApiError('network', 'join_room', 'down'));
    await act(async () => result.current.paste(`https://x.y/join/482913?r=${REF}`));
    await act(async () => result.current.retry());
    expect(mockJoinRoom).toHaveBeenLastCalledWith({ code: '482913', ref: REF, via: 'link' });
    // A digit changes: the reference is gone.
    await act(async () => result.current.setCode('48291'));
    await act(async () => result.current.setCode('482914'));
    expect(mockJoinRoom).toHaveBeenLastCalledWith({ code: '482914', via: 'code' });
  });

  it('keeps only the digits of pasted text, and joins when there are six', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'not_found' });
    const { result } = await renderHook(() => useJoinAttempt(), { wrapper });
    await act(async () => result.current.paste('code 482 913'));
    expect(mockJoinRoom).toHaveBeenCalledWith({ code: '482913', via: 'code' });
  });
});
