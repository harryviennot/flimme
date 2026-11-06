import type { MyProfile } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useDeviceSync } from './use-device-sync';

const mockUpdateProfile = jest.fn(async () => ({ status: 'ok' }));
const mockCatalog = jest.fn(async () => [{ code: 'FR' }]);
jest.mock('@/api', () => ({
  api: {
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...(args as [])),
    catalogCountries: () => mockCatalog(),
  },
}));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'FR' }] }));
jest.mock('@/i18n', () => ({ deviceLanguage: () => 'fr' }));

const profileOf = (id: string): MyProfile => ({
  id,
  display_name: 'Léa',
  avatar_key: 'teal',
  country: null,
  language: 'en',
  created_at: '2026-11-03T00:00:00Z',
});

describe('useDeviceSync', () => {
  it('runs again for the new guest after a deletion, once per profile', async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { rerender } = await renderHook(
      ({ profile }: { profile: MyProfile }) => useDeviceSync(profile, true),
      { wrapper, initialProps: { profile: profileOf('u1') } },
    );
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));

    await rerender({ profile: profileOf('u1') });
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);

    await rerender({ profile: profileOf('u2') });
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(2));
  });

  it('mends a saved country without a catalog with the region, which has one', async () => {
    mockUpdateProfile.mockClear();
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await renderHook(
      () => useDeviceSync({ ...profileOf('m1'), country: 'US', language: 'fr' }, true),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({ country: 'FR' }));
  });

  it('keeps a saved country that has a catalog, and a country when the list fails', async () => {
    mockUpdateProfile.mockClear();
    mockCatalog.mockResolvedValueOnce([{ code: 'FR' }, { code: 'BE' }]);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    await renderHook(
      () => useDeviceSync({ ...profileOf('k1'), country: 'BE', language: 'fr' }, true),
      {
        wrapper,
      },
    );
    await waitFor(() => expect(mockCatalog).toHaveBeenCalled());
    mockCatalog.mockRejectedValueOnce(new Error('offline'));
    const other = new QueryClient();
    await renderHook(
      () => useDeviceSync({ ...profileOf('k2'), country: 'US', language: 'fr' }, true),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={other}>{children}</QueryClientProvider>
        ),
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
