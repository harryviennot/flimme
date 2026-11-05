import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactNode } from 'react';
import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';

import RoomInviteScreen from './app/room/[id]/invite';

// The invite sheet (M4.12): the link from the room and `app_config`, the QR, copy and share.
const ID = '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41';
const mockQr = jest.fn();

jest.mock('@/api', () => ({
  api: { room: jest.fn(), roomSeats: jest.fn(), appConfig: jest.fn(), setRoomLocked: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
jest.mock('@/features/session', () => ({
  startSession: jest.fn(async () => ({ status: 'ok', userId: 'u1', isNew: false })),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41' }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
// The build's scheme and variant (app.config.ts), switched per test. A getter, because the mock
// factory runs before this file's constants exist.
const mockExpoConfig = { scheme: 'flimme-dev', extra: { variant: 'development' } };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: (props: { value: string }) => {
    mockQr(props);
    return null;
  },
}));

const room = api.room as jest.Mock;
const appConfig = api.appConfig as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 700 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

function buildIs(variant: 'development' | 'preview' | 'production') {
  const schemes = { development: 'flimme-dev', preview: 'flimme-preview', production: 'flimme' };
  mockExpoConfig.scheme = schemes[variant];
  mockExpoConfig.extra.variant = variant;
}

beforeEach(() => {
  jest.clearAllMocks();
  buildIs('development');
  room.mockResolvedValue({ id: ID, code: '482913', state: 'lobby' });
  appConfig.mockResolvedValue({});
  (api.roomSeats as jest.Mock).mockResolvedValue([]);
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
});

describe('the invite sheet', () => {
  it('draws the scheme link as a QR labelled for a screen reader', async () => {
    await render(<RoomInviteScreen />, { wrapper });
    const link = `flimme-dev://join/482913?r=${ID}`;
    await waitFor(() => expect(mockQr).toHaveBeenCalled());
    expect(mockQr.mock.calls[0][0].value).toBe(link);
    expect(screen.getByLabelText(/Invite QR code/)).toBeTruthy();
    expect(screen.getByText(`flimme-dev://join/482913?r=${ID}`)).toBeTruthy();
  });

  it.each(['preview', 'production'] as const)(
    'a %s build uses the https base, shown without the scheme in the row',
    async (variant) => {
      buildIs(variant);
      appConfig.mockResolvedValue({ invite_base_url: 'https://flimme.com/' });
      await render(<RoomInviteScreen />, { wrapper });
      expect(await screen.findByText(`flimme.com/join/482913?r=${ID}`)).toBeTruthy();
      expect(mockQr.mock.calls[0][0].value).toBe(`https://flimme.com/join/482913?r=${ID}`);
    },
  );

  // Universal links only reach preview and production builds (decisions.md, Q14.5), so a
  // development build shares its own scheme even when its database has the base.
  it('a development build keeps its scheme when the config has the https base', async () => {
    appConfig.mockResolvedValue({ invite_base_url: 'https://flimme.com' });
    await render(<RoomInviteScreen />, { wrapper });
    expect(await screen.findByText(`flimme-dev://join/482913?r=${ID}`)).toBeTruthy();
    expect(mockQr.mock.calls[0][0].value).toBe(`flimme-dev://join/482913?r=${ID}`);
  });

  it('copies the full link and shows the toast call', async () => {
    buildIs('preview');
    appConfig.mockResolvedValue({ invite_base_url: 'https://flimme.com' });
    await render(<RoomInviteScreen />, { wrapper });
    fireEvent.press(await screen.findByLabelText('Copy the link'));
    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        `https://flimme.com/join/482913?r=${ID}`,
      ),
    );
  });

  it('shares the message', async () => {
    await render(<RoomInviteScreen />, { wrapper });
    await screen.findByLabelText('Copy the link');
    fireEvent.press(screen.getByLabelText('Share invite'));
    await waitFor(() =>
      expect(Share.share).toHaveBeenCalledWith({
        message: `Join my room: flimme-dev://join/482913?r=${ID} (code 482 913)`,
      }),
    );
  });

  it('shows skeletons with sharing disabled while the config loads', async () => {
    appConfig.mockReturnValue(new Promise(() => {}));
    await render(<RoomInviteScreen />, { wrapper });
    expect(screen.queryByLabelText('Copy the link')).toBeNull();
    fireEvent.press(screen.getByLabelText('Share invite'));
    expect(Share.share).not.toHaveBeenCalled();
    expect(mockQr).not.toHaveBeenCalled();
  });

  it('shows the error with a retry that reads the config again', async () => {
    appConfig.mockRejectedValueOnce(new Error('down'));
    await render(<RoomInviteScreen />, { wrapper });
    fireEvent.press(await screen.findByLabelText('Try again'));
    await waitFor(() => expect(appConfig).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Copy the link')).toBeTruthy();
  });
});
