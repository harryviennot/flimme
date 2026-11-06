import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import CountryScreen from '@/app/settings/country';
import { showToast } from '@/components/ui/toast';
import { haptics } from '@/lib/haptics';

jest.mock('@/api', () => ({
  api: { myProfile: jest.fn(), catalogCountries: jest.fn(), updateProfile: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn(), press: jest.fn() } }));

const mockApi = api as unknown as Record<
  'myProfile' | 'catalogCountries' | 'updateProfile',
  jest.Mock
>;
const profile = {
  id: 'u1',
  display_name: 'Léa',
  avatar_key: 'blue',
  country: 'FR',
  language: 'en',
  created_at: '2026-11-03T00:00:00Z',
};

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 812 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
const show = () => render(<CountryScreen />, { wrapper: Providers });

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.myProfile.mockResolvedValue(profile);
  mockApi.catalogCountries.mockResolvedValue([
    { code: 'FR', default_language: 'fr' },
    { code: 'BE', default_language: 'fr' },
  ]);
  mockApi.updateProfile.mockResolvedValue({ status: 'ok' });
});

describe('the country screen', () => {
  it('lists the catalog countries and marks the current one', async () => {
    await show();
    expect(await screen.findByLabelText('Belgium')).toBeTruthy();
    expect(screen.getByLabelText('France').props.accessibilityHint).toBe('Selected');
    expect(screen.getByLabelText('Belgium').props.accessibilityHint).toBeUndefined();
  });

  it('saves the tapped country and goes back', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('Belgium'));
    await waitFor(() => expect(mockApi.updateProfile).toHaveBeenCalledWith({ country: 'BE' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('shows the toast and the error haptic when the save is refused, and stays', async () => {
    mockApi.updateProfile.mockResolvedValue({ status: 'unknown_avatar' });
    await show();
    await fireEvent.press(await screen.findByLabelText('Belgium'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "Couldn't change the country. Try again.",
      }),
    );
    expect(haptics.error).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows an error state when the list fails, and Try again asks again', async () => {
    mockApi.catalogCountries.mockRejectedValueOnce(new Error('boom'));
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Belgium')).toBeTruthy();
    expect(mockApi.catalogCountries).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the current country is tapped', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('France'));
    expect(mockApi.updateProfile).not.toHaveBeenCalled();
  });
});
