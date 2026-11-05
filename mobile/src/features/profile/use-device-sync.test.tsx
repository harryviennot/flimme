import type { MyProfile } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useDeviceSync } from './use-device-sync';

const mockUpdateProfile = jest.fn(async () => ({ status: 'ok' }));
jest.mock('@/api', () => ({
  api: { updateProfile: (...args: unknown[]) => mockUpdateProfile(...(args as [])) },
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
});
