import type { MyProfile } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { saveCachedProfile } from './cache';
import { useDeviceProfileSync } from './use-device-profile-sync';

const mockMyProfile = jest.fn();
const mockUpdateProfile = jest.fn();

jest.mock('@/api', () => ({
  api: {
    myProfile: (...args: unknown[]) => mockMyProfile(...args),
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
  },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'FR' }] }));
jest.mock('@/i18n', () => ({ deviceLanguage: () => 'fr' }));

const profile: MyProfile = {
  id: 'u1',
  display_name: 'Léa',
  avatar_key: 'teal',
  country: null,
  language: 'fr',
  created_at: '2026-11-03T00:00:00Z',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateProfile.mockResolvedValue({ status: 'ok' });
});

describe('useDeviceProfileSync', () => {
  it('saves the country on a cold start with a cached profile, with no launch screen mounted', async () => {
    // The launch screen is gone by the time the read finishes: only this hook is mounted.
    saveCachedProfile(profile);
    let finishRead: (p: MyProfile) => void = () => {};
    mockMyProfile.mockReturnValue(new Promise<MyProfile>((resolve) => (finishRead = resolve)));
    const { wrapper } = setup();
    await renderHook(() => useDeviceProfileSync(true), { wrapper });

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    await act(async () => finishRead(profile));
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({ country: 'FR' }));
  });

  it('syncs once per launch, not on every render', async () => {
    mockMyProfile.mockResolvedValue(profile);
    const { wrapper } = setup();
    const { rerender } = await renderHook(() => useDeviceProfileSync(true), { wrapper });
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    await rerender({});
    await rerender({});
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });

  it('saves nothing when the profile already matches the device', async () => {
    mockMyProfile.mockResolvedValue({ ...profile, country: 'FR' });
    const { wrapper } = setup();
    await renderHook(() => useDeviceProfileSync(true), { wrapper });
    await waitFor(() => expect(mockMyProfile).toHaveBeenCalled());
    await act(async () => {});
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('sends the language when it differs from the app', async () => {
    mockMyProfile.mockResolvedValue({ ...profile, country: 'FR', language: 'en' });
    const { wrapper } = setup();
    await renderHook(() => useDeviceProfileSync(true), { wrapper });
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({ language: 'fr' }));
  });

  it('waits for the session before reading anything', async () => {
    mockMyProfile.mockResolvedValue(profile);
    const { wrapper } = setup();
    await renderHook(() => useDeviceProfileSync(false), { wrapper });
    await act(async () => {});
    expect(mockMyProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['a refusal', () => mockUpdateProfile.mockResolvedValue({ status: 'invalid_name' })],
    ['an error', () => mockUpdateProfile.mockRejectedValue(new Error('down'))],
  ])('does not retry after %s', async (_name, arrange) => {
    arrange();
    mockMyProfile.mockResolvedValue(profile);
    const { wrapper } = setup();
    const { rerender } = await renderHook(() => useDeviceProfileSync(true), { wrapper });
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    await rerender({});
    await act(async () => {});
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });
});
