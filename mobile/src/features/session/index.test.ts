import { act, renderHook } from '@testing-library/react-native';

import { startSession, useSession } from '.';

const mockStart = jest.fn();

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./start-session', () => ({
  startSessionWith: (...args: unknown[]) => mockStart(...args),
}));

beforeEach(() => mockStart.mockReset());

describe('startSession and useSession', () => {
  it('shares one sign-in between callers that overlap', async () => {
    mockStart.mockResolvedValue({ status: 'ok', userId: 'u1', isNew: true });
    const [a, b] = await Promise.all([startSession(), startSession()]);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('tries again when called after a refusal', async () => {
    mockStart.mockResolvedValueOnce({ status: 'refused' });
    mockStart.mockResolvedValueOnce({ status: 'ok', userId: 'u1', isNew: true });
    expect(await startSession()).toEqual({ status: 'refused' });
    expect(await startSession()).toEqual({ status: 'ok', userId: 'u1', isNew: true });
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it('shows the latest answer to screens', async () => {
    mockStart.mockResolvedValue({ status: 'offline' });
    const { result } = await renderHook(() => useSession());
    await act(async () => {
      await startSession();
    });
    expect(result.current).toEqual({ status: 'offline' });
  });

  it('can start again after a real error', async () => {
    mockStart.mockRejectedValueOnce(new Error('boom'));
    await expect(startSession()).rejects.toThrow('boom');
    mockStart.mockResolvedValueOnce({ status: 'offline' });
    expect(await startSession()).toEqual({ status: 'offline' });
  });
});
