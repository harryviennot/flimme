import { act, renderHook } from '@testing-library/react-native';

import { DEAL_RETRY_MS, DEAL_SLOW_MS, runStart, tooFewFromEvent, useDealingTimers } from './start';

describe('runStart', () => {
  it('re-reads the room after ok, dealing and closed', async () => {
    for (const answer of [
      { status: 'ok' as const },
      { status: 'dealing' as const },
      { status: 'closed' as const },
    ]) {
      await expect(runStart(async () => answer)).resolves.toEqual({ kind: 'reread' });
    }
  });

  it('carries the count from too_few_films, with and without fallback', async () => {
    await expect(
      runStart(async () => ({ status: 'too_few_films' as const, eligible: 12 })),
    ).resolves.toEqual({ kind: 'too_few', eligible: 12 });
    await expect(
      runStart(async () => ({ status: 'too_few_films' as const, eligible: 0, fallback: true })),
    ).resolves.toEqual({ kind: 'too_few', eligible: 0 });
  });

  it('carries the need from not_enough_players', async () => {
    await expect(
      runStart(async () => ({ status: 'not_enough_players' as const, need: 2 })),
    ).resolves.toEqual({ kind: 'need_players', need: 2 });
  });

  it('says failed when the call throws', async () => {
    await expect(
      runStart(async () => {
        throw new Error('network');
      }),
    ).resolves.toEqual({ kind: 'failed' });
  });
});

describe('tooFewFromEvent', () => {
  it('reads the count from a state_changed that went back to the lobby', () => {
    expect(tooFewFromEvent({ state: 'lobby', reason: 'too_few_films', eligible: 7 })).toBe(7);
    expect(tooFewFromEvent({ state: 'lobby', reason: 'too_few_films', eligible: 0 })).toBe(0);
  });

  it('ignores every other state change and malformed payloads', () => {
    expect(tooFewFromEvent({ state: 'swiping' })).toBeNull();
    expect(tooFewFromEvent({ state: 'lobby', reason: 'too_few_films' })).toBeNull();
    expect(tooFewFromEvent(null)).toBeNull();
    expect(tooFewFromEvent('lobby')).toBeNull();
  });
});

describe('useDealingTimers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks again at 8 seconds on the host and turns slow at 20', async () => {
    const again = jest.fn();
    const { result } = await renderHook(() => useDealingTimers(true, true, again));
    await act(async () => {
      jest.advanceTimersByTime(DEAL_RETRY_MS - 1);
    });
    expect(again).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(again).toHaveBeenCalledTimes(1);
    expect(result.current.slow).toBe(false);
    await act(async () => {
      jest.advanceTimersByTime(DEAL_SLOW_MS - DEAL_RETRY_MS);
    });
    expect(result.current.slow).toBe(true);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it('never asks again on a guest, but still turns slow', async () => {
    const again = jest.fn();
    const { result } = await renderHook(() => useDealingTimers(true, false, again));
    await act(async () => {
      jest.advanceTimersByTime(DEAL_SLOW_MS);
    });
    expect(again).not.toHaveBeenCalled();
    expect(result.current.slow).toBe(true);
  });

  it('does nothing while the room is not dealing', async () => {
    const again = jest.fn();
    const { result } = await renderHook(() => useDealingTimers(false, true, again));
    await act(async () => {
      jest.advanceTimersByTime(DEAL_SLOW_MS * 2);
    });
    expect(again).not.toHaveBeenCalled();
    expect(result.current.slow).toBe(false);
  });
});
