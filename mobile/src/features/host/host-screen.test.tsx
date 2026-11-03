import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { api } from '@/api';
import HostScreen from '@/app/host/index';
import { keptRoomStore } from '@/features/room/kept-room';
import { showToast } from '@/components/ui/toast';
import { reportError } from '@/lib/sentry';

jest.mock('@/api', () => ({
  api: {
    myProfile: jest.fn(),
    countryProviders: jest.fn(),
    myProviders: jest.fn(),
    setMyProviders: jest.fn(),
    createRoom: jest.fn(),
    leaveRoom: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline, watchNetwork: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn() },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  haptics: { error: jest.fn(), press: jest.fn() },
}));

type Mocks<K extends string> = Record<K, jest.Mock>;
const mockApi = api as unknown as Mocks<
  'myProfile' | 'countryProviders' | 'myProviders' | 'setMyProviders' | 'createRoom' | 'leaveRoom'
>;
const mockRouter = router as unknown as Mocks<'replace' | 'push' | 'back'>;

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

async function show() {
  await render(<HostScreen />, { wrapper: Providers });
}

const open = () => screen.getByRole('button', { name: 'Open the room' });

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockApi.myProfile.mockResolvedValue(profile);
  mockApi.countryProviders.mockResolvedValue(providers);
  mockApi.myProviders.mockResolvedValue([8]);
  mockApi.setMyProviders.mockResolvedValue({ status: 'ok' });
  mockApi.createRoom.mockResolvedValue({ status: 'ok', room_id: 'r1', code: '123456' });
});

describe('host setup', () => {
  it('starts on the saved services the country lists, ignoring the others', async () => {
    mockApi.myProviders.mockResolvedValue([8, 999]);
    await show();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Netflix' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Prime Video' })).not.toBeChecked();
  });

  it('disables Open the room with the reason while nothing is selected', async () => {
    mockApi.myProviders.mockResolvedValue([]);
    await show();
    await waitFor(() => expect(screen.getByText('Pick at least one service')).toBeTruthy());
    expect(open()).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Netflix' }));
    expect(open()).toBeEnabled();
  });

  it('leaves the kept room once after the new room opens, and a failed leave changes nothing', async () => {
    keptRoomStore.getState().keep({ id: 'old-room', code: '654321' });
    mockApi.leaveRoom.mockRejectedValue(new Error('down'));
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby'));
    expect(mockApi.leaveRoom).toHaveBeenCalledTimes(1);
    expect(mockApi.leaveRoom).toHaveBeenCalledWith({ room_id: 'old-room' });
    keptRoomStore.getState().forget();
  });

  it('still leaves the old room when the new room is kept before the answer is used', async () => {
    keptRoomStore.getState().keep({ id: 'old-room', code: '654321' });
    mockApi.createRoom.mockImplementation(async () => {
      keptRoomStore.getState().keep({ id: 'r1', code: '123456' });
      return { status: 'ok', room_id: 'r1', code: '123456' };
    });
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await waitFor(() => expect(mockApi.leaveRoom).toHaveBeenCalledWith({ room_id: 'old-room' }));
    keptRoomStore.getState().forget();
  });

  it('leaves nothing when no room is kept', async () => {
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(mockApi.leaveRoom).not.toHaveBeenCalled();
  });

  it('opens with the defaults, without saving an unchanged selection', async () => {
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby'));
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/invite');
    expect(mockApi.setMyProviders).not.toHaveBeenCalled();
    expect(mockApi.createRoom).toHaveBeenCalledWith({
      mode: 'quick_match',
      settings: { runtime_max: null, max_age: null },
    });
  });

  it('sends the chosen time budget and age cap, and saves a changed selection first', async () => {
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(screen.getByRole('radio', { name: 'Under 1 h 45' }));
    await fireEvent.press(screen.getByRole('radio', { name: '12+' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Prime Video' }));
    await fireEvent.press(open());
    await waitFor(() => expect(mockApi.createRoom).toHaveBeenCalled());
    expect(mockApi.setMyProviders).toHaveBeenCalledWith({ provider_ids: [8, 119] });
    const saved = mockApi.setMyProviders.mock.invocationCallOrder[0] ?? Infinity;
    const created = mockApi.createRoom.mock.invocationCallOrder[0] ?? 0;
    expect(saved).toBeLessThan(created);
    expect(mockApi.createRoom).toHaveBeenCalledWith({
      mode: 'quick_match',
      settings: { runtime_max: 105, max_age: 12 },
    });
  });

  it('sends under 2 h and All ages as 120 and 0', async () => {
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(screen.getByRole('radio', { name: 'Under 2 h' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'All ages' }));
    await fireEvent.press(open());
    await waitFor(() => expect(mockApi.createRoom).toHaveBeenCalled());
    expect(mockApi.createRoom).toHaveBeenCalledWith({
      mode: 'quick_match',
      settings: { runtime_max: 120, max_age: 0 },
    });
  });

  it('shows the chip rows as radio groups labelled by their eyebrow', async () => {
    await show();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Netflix' })).toBeTruthy());
    expect(screen.getByLabelText('Time budget').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByLabelText('Youngest viewer').props.accessibilityRole).toBe('radiogroup');
  });

  it('makes no room and shows the network toast when the save throws', async () => {
    mockApi.setMyProviders.mockRejectedValue(new Error('offline'));
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Prime Video' }));
    await fireEvent.press(open());
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "We couldn't open the room. Try again." }),
    );
    expect(mockApi.createRoom).not.toHaveBeenCalled();
  });

  it('shows the generic toast and reports too_many', async () => {
    mockApi.setMyProviders.mockResolvedValue({ status: 'too_many', max: 50 });
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Prime Video' }));
    await fireEvent.press(open());
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warn' }));
    expect(mockApi.createRoom).not.toHaveBeenCalled();
  });

  it.each(['unknown_mode', 'invalid_settings'])('toasts and reports %s', async (status) => {
    mockApi.createRoom.mockResolvedValue({ status, field: 'max_age' });
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('pushes the name screen on name_required and keeps the choices', async () => {
    mockApi.createRoom.mockResolvedValue({ status: 'name_required' });
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(screen.getByRole('radio', { name: 'Under 2 h' }));
    await fireEvent.press(open());
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/name?edit=1'));
    expect(screen.getByRole('radio', { name: 'Under 2 h' })).toBeSelected();
    expect(screen.getByRole('checkbox', { name: 'Netflix' })).toBeChecked();
  });

  it('shows the unsupported state on country_required, with the join action', async () => {
    mockApi.createRoom.mockResolvedValue({ status: 'country_required' });
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await waitFor(() => expect(screen.getByText('Not in your country yet')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Join with a code' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/join');
  });

  it('shows the unsupported state for an empty list', async () => {
    mockApi.countryProviders.mockResolvedValue([]);
    await show();
    await waitFor(() => expect(screen.getByText('Not in your country yet')).toBeTruthy());
  });

  it('shows the unsupported state without asking for services when the profile has no country', async () => {
    mockApi.myProfile.mockResolvedValue({ ...profile, country: null });
    await show();
    await waitFor(() => expect(screen.getByText('Not in your country yet')).toBeTruthy());
    expect(mockApi.countryProviders).not.toHaveBeenCalled();
  });

  it('shows an error state when the services fail, and Retry asks again', async () => {
    mockApi.countryProviders.mockRejectedValueOnce(new Error('boom'));
    await show();
    await waitFor(() => expect(screen.getByText("We couldn't load the services.")).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Netflix' })).toBeTruthy());
    expect(mockApi.countryProviders).toHaveBeenCalledTimes(2);
  });

  it('shows the offline banner and disables Open the room', async () => {
    mockOnline = false;
    await show();
    await waitFor(() => expect(screen.getByText(/You're offline/)).toBeTruthy());
    expect(open()).toBeDisabled();
  });

  it('sends nothing on a second tap while opening', async () => {
    let finish: (v: unknown) => void = () => {};
    mockApi.createRoom.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await show();
    await waitFor(() => expect(open()).toBeEnabled());
    await fireEvent.press(open());
    await fireEvent.press(open());
    expect(mockApi.createRoom).toHaveBeenCalledTimes(1);
    finish({ status: 'ok', room_id: 'r1', code: '123456' });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
  });
});
