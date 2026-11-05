import { ApiError } from '@flimme/contract';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useGoneUserRecovery } from './use-gone-user';

const mockCheck = jest.fn();
const mockWipe = jest.fn(async () => undefined);
jest.mock('@/features/session/start-session', () => ({
  checkUserWith: (...args: unknown[]) => mockCheck(...args),
}));
jest.mock('@/features/account/wipe-app', () => ({ wipeLocalData: () => mockWipe() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const stored = { status: 'ok', userId: 'u1', isNew: false } as const;
const profile = (display_name: string) =>
  ({
    id: 'u1',
    display_name,
    avatar_key: 'a',
    country: 'FR',
    language: 'fr',
    created_at: 'x',
  }) as never;

beforeEach(() => {
  mockCheck.mockReset();
  mockWipe.mockClear();
});

describe('a session whose user is gone', () => {
  it('wipes and starts again when the check says gone', async () => {
    mockCheck.mockResolvedValue('gone');
    const { result } = await renderHook(() =>
      useGoneUserRecovery({ session: stored, profile: { data: null, error: null } }),
    );
    await waitFor(() => expect(mockWipe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.checking).toBe(false));
  });

  it('reads a denied profile as a reason to check', async () => {
    mockCheck.mockResolvedValue('gone');
    await renderHook(() =>
      useGoneUserRecovery({
        session: stored,
        profile: { data: undefined, error: new ApiError('denied', 'my_profile', 'x') },
      }),
    );
    await waitFor(() => expect(mockWipe).toHaveBeenCalledTimes(1));
  });

  it('keeps the user for a plain expired token that refreshes (check ok)', async () => {
    mockCheck.mockResolvedValue('ok');
    await renderHook(() =>
      useGoneUserRecovery({ session: stored, profile: { data: profile(''), error: null } }),
    );
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
    expect(mockWipe).not.toHaveBeenCalled();
  });

  it('does not ask for a named player, a new guest or an offline check', async () => {
    await renderHook(() =>
      useGoneUserRecovery({ session: stored, profile: { data: profile('Léa'), error: null } }),
    );
    await renderHook(() =>
      useGoneUserRecovery({
        session: { status: 'ok', userId: 'u2', isNew: true },
        profile: { data: null, error: null },
      }),
    );
    await act(async () => {});
    expect(mockCheck).not.toHaveBeenCalled();

    mockCheck.mockResolvedValue('unknown');
    await renderHook(() =>
      useGoneUserRecovery({ session: stored, profile: { data: null, error: null } }),
    );
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
    expect(mockWipe).not.toHaveBeenCalled();
  });

  it('asks once per launch', async () => {
    mockCheck.mockResolvedValue('ok');
    const { rerender } = await renderHook(() =>
      useGoneUserRecovery({ session: stored, profile: { data: null, error: null } }),
    );
    await waitFor(() => expect(mockCheck).toHaveBeenCalledTimes(1));
    await rerender({});
    await act(async () => {});
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });
});
