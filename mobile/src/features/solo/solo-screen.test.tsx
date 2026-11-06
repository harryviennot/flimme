import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { api } from '@/api';
import SoloSetupScreen from '@/app/solo';
import { showToast } from '@/components/ui/toast';
import { keptRoomStore } from '@/features/room/kept-room';
import { soloCapStore } from '@/features/solo/cap';

jest.mock('@/api', () => ({
  api: {
    myProfile: jest.fn(),
    countryProviders: jest.fn(),
    myProviders: jest.fn(),
    setMyProviders: jest.fn(),
    startSolo: jest.fn(),
    leaveRoom: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
}));
let mockOnline = true;
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://img.test/t/p' } }),
}));
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline, watchNetwork: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn(), press: jest.fn() } }));

type Mocks<K extends string> = Record<K, jest.Mock>;
const mockApi = api as unknown as Mocks<
  'myProfile' | 'countryProviders' | 'myProviders' | 'setMyProviders' | 'startSolo' | 'leaveRoom'
>;
const mockRouter = router as unknown as Mocks<'replace' | 'push' | 'back' | 'dismissTo'>;

const profile = {
  id: 'u1',
  display_name: 'Léa',
  avatar_key: 'blue',
  country: 'FR',
  language: 'en',
  created_at: '2026-11-03T00:00:00Z',
};
const providers = [
  { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
  { provider_id: 119, name: 'Prime Video', logo_path: null, display_priority: 2 },
];

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

const show = () => render(<SoloSetupScreen />, { wrapper: Providers });
const start = () => screen.getByRole('button', { name: 'Start' });

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  soloCapStore.setState({ day: null });
  mockApi.myProfile.mockResolvedValue(profile);
  mockApi.countryProviders.mockResolvedValue(providers);
  mockApi.myProviders.mockResolvedValue([8]);
  mockApi.setMyProviders.mockResolvedValue({ status: 'ok' });
  mockApi.startSolo.mockResolvedValue({
    status: 'ok',
    room_id: 'r1',
    member_id: 'm1',
    state: 'swiping',
  });
});

describe('Play alone setup', () => {
  it('starts on the saved services and opens the swipe screen on ok', async () => {
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/swipe'));
    expect(mockApi.setMyProviders).not.toHaveBeenCalled();
    expect(mockApi.startSolo).toHaveBeenCalledWith({
      settings: { runtime_max: null, max_age: null },
    });
  });

  it('also opens the swipe screen while the deck is still dealing', async () => {
    mockApi.startSolo.mockResolvedValue({ status: 'dealing', room_id: 'r2', member_id: 'm1' });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r2/swipe'));
  });

  it('leaves a kept group seat when the session starts', async () => {
    keptRoomStore.getState().keep({ id: 'old-room', code: '654321' });
    mockApi.leaveRoom.mockResolvedValue({ status: 'ok' });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(mockApi.leaveRoom).toHaveBeenCalledWith({ room_id: 'old-room' }));
    keptRoomStore.getState().forget();
  });

  it('saves the services first when they changed', async () => {
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Prime Video' }));
    await fireEvent.press(start());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(mockApi.setMyProviders).toHaveBeenCalledWith({ provider_ids: [8, 119] });
  });

  it('says how many films fit under Start on too_few_films, and the line goes with a change', async () => {
    mockApi.startSolo.mockResolvedValue({ status: 'too_few_films', eligible: 3 });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() =>
      expect(screen.getByText('Only 3 films fit. Add a service or loosen a filter.')).toBeTruthy(),
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Prime Video' }));
    expect(screen.queryByText(/Only 3 films fit/)).toBeNull();
  });

  it('says no film fits for none, and one film for one', async () => {
    mockApi.startSolo.mockResolvedValueOnce({ status: 'too_few_films', eligible: 0 });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() =>
      expect(screen.getByText('No film fits. Add a service or loosen a filter.')).toBeTruthy(),
    );
    mockApi.startSolo.mockResolvedValueOnce({ status: 'too_few_films', eligible: 1 });
    await fireEvent.press(start());
    await waitFor(() =>
      expect(screen.getByText('Only 1 film fits. Add a service or loosen a filter.')).toBeTruthy(),
    );
  });

  it('shows the cap card on daily_limit and remembers the day', async () => {
    mockApi.startSolo.mockResolvedValue({ status: 'daily_limit' });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(screen.getByText("That's today's solo deck.")).toBeTruthy());
    expect(soloCapStore.getState().day).not.toBeNull();
    await fireEvent.press(screen.getByText('Host a movie night'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/host');
    await fireEvent.press(screen.getByText('My films'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/my-films');
  });

  it('shows the cap card at once on the day of the last daily_limit', async () => {
    soloCapStore.getState().reached();
    await show();
    expect(screen.getByText("That's today's solo deck.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('goes to the name screen when Play needs a name', async () => {
    mockApi.startSolo.mockResolvedValue({ status: 'name_required' });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/name?edit=1'));
  });

  it('shows the unsupported state on country_required', async () => {
    mockApi.startSolo.mockResolvedValue({ status: 'country_required' });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(screen.getByText('Not in your country yet')).toBeTruthy());
  });

  it('says so on rate_limited and when the call fails, and the form stays', async () => {
    mockApi.startSolo.mockResolvedValueOnce({ status: 'rate_limited' });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() =>
      expect(showToast).toHaveBeenLastCalledWith({
        tone: 'warn',
        title: "That's a lot of starts at once. Try again in a few minutes.",
      }),
    );
    mockApi.startSolo.mockRejectedValueOnce(new Error('down'));
    await fireEvent.press(start());
    await waitFor(() =>
      expect(showToast).toHaveBeenLastCalledWith({
        tone: 'warn',
        title: "We couldn't start. Try again.",
      }),
    );
    expect(start()).toBeEnabled();
  });

  it('is offline: a banner, and Start is off', async () => {
    mockOnline = false;
    await show();
    await waitFor(() =>
      expect(screen.getByText("You're offline. Connect to play alone.")).toBeTruthy(),
    );
    expect(start()).toBeDisabled();
  });
});
