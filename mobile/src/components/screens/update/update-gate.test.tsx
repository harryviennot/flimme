import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Linking, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import { Text } from '@/components/ui/text';
import { startSession } from '@/features/session';
import i18n from '@/i18n';

import { UpdateGate } from './update-gate';

jest.mock('@/api', () => ({ api: { appConfig: jest.fn() } }));
jest.mock('@/features/session', () => ({ startSession: jest.fn() }));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '0.1.0',
  applicationId: 'com.harryviennot.flimme',
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appStoreId: '42' } } },
}));

const appConfig = jest.mocked(api.appConfig);
const session = jest.mocked(startSession);

const appLabel = 'the app';
const frame = { x: 0, y: 0, width: 375, height: 812 };

let client: QueryClient;
let onAppState: ((state: AppStateStatus) => void) | undefined;

async function renderGate() {
  return await render(
    <SafeAreaProvider
      initialMetrics={{ frame: frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
    >
      <QueryClientProvider client={client}>
        <UpdateGate>
          <Text>{appLabel}</Text>
        </UpdateGate>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** Waits until no read is running, so the query's last update has reached the screen. */
async function settled() {
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

beforeEach(async () => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  session.mockResolvedValue({ status: 'ok', userId: 'u1', isNew: false });
  appConfig.mockResolvedValue({ min_app_version: { ios: '0.0.0', android: '0.0.0' } });
  Platform.OS = 'ios';
  await i18n.changeLanguage('en');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onAppState = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  client.clear();
  onAppState = undefined;
  jest.restoreAllMocks();
});

describe('UpdateGate', () => {
  it('shows the app when the build meets the minimum', async () => {
    await renderGate();
    await settled();
    expect(screen.getByText('the app')).toBeTruthy();
    expect(screen.queryByText('Time for an update')).toBeNull();
  });

  it('shows only the update screen, in English, when the minimum is above the build', async () => {
    appConfig.mockResolvedValue({ min_app_version: { ios: '0.2.0', android: '0.2.0' } });
    await renderGate();
    expect(await screen.findByText('Time for an update')).toBeTruthy();
    expect(screen.getByText('Update Flimme to keep playing.')).toBeTruthy();
    expect(screen.getByText('Update')).toBeTruthy();
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('shows the update screen in French', async () => {
    await i18n.changeLanguage('fr');
    appConfig.mockResolvedValue({ min_app_version: { ios: '1.0.0', android: '1.0.0' } });
    await renderGate();
    expect(await screen.findByText("Une mise à jour t'attend")).toBeTruthy();
    expect(screen.getByText('Mets Flimme à jour pour continuer à jouer.')).toBeTruthy();
    expect(screen.getByText('Mettre à jour')).toBeTruthy();
  });

  it('reads the minimum of the platform it runs on', async () => {
    Platform.OS = 'android';
    appConfig.mockResolvedValue({ min_app_version: { ios: '9.0.0', android: '0.1.0' } });
    await renderGate();
    await settled();
    expect(await screen.findByText('the app')).toBeTruthy();
  });

  it('shows the update screen when the minimum is raised and the app returns to the foreground', async () => {
    await renderGate();
    expect(await screen.findByText('the app')).toBeTruthy();

    appConfig.mockResolvedValue({ min_app_version: { ios: '5.0.0', android: '5.0.0' } });
    await act(async () => onAppState?.('active'));

    expect(await screen.findByText('Time for an update')).toBeTruthy();
    expect(screen.queryByText('the app')).toBeNull();
  });

  it('shows the app when the read fails', async () => {
    appConfig.mockRejectedValue(new Error('offline'));
    await renderGate();
    await settled();
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('shows the app when there is no session yet', async () => {
    session.mockResolvedValue({ status: 'offline' });
    await renderGate();
    await settled();
    expect(appConfig).not.toHaveBeenCalled();
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('shows the app when the minimum is malformed', async () => {
    appConfig.mockResolvedValue({ min_app_version: 'soon' } as never);
    await renderGate();
    await settled();
    expect(screen.getByText('the app')).toBeTruthy();
  });

  it('keeps the update screen when a later read fails', async () => {
    appConfig.mockResolvedValue({ min_app_version: { ios: '5.0.0', android: '5.0.0' } });
    await renderGate();
    expect(await screen.findByText('Time for an update')).toBeTruthy();

    appConfig.mockRejectedValue(new Error('offline'));
    await act(async () => onAppState?.('active'));
    await waitFor(() => expect(appConfig).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Time for an update')).toBeTruthy();
  });

  it("opens the platform's store page when the button is pressed", async () => {
    appConfig.mockResolvedValue({ min_app_version: { ios: '5.0.0', android: '5.0.0' } });
    await renderGate();
    await fireEvent.press(await screen.findByLabelText('Update'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id42');
  });

  it('falls back to the Play Store website when the Play Store app is missing', async () => {
    Platform.OS = 'android';
    appConfig.mockResolvedValue({ min_app_version: { ios: '5.0.0', android: '5.0.0' } });
    jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no handler'))
      .mockResolvedValue(undefined);
    await renderGate();
    await fireEvent.press(await screen.findByLabelText('Update'));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledTimes(2));
    expect(Linking.openURL).toHaveBeenNthCalledWith(
      1,
      'market://details?id=com.harryviennot.flimme',
    );
    expect(Linking.openURL).toHaveBeenNthCalledWith(
      2,
      'https://play.google.com/store/apps/details?id=com.harryviennot.flimme',
    );
  });
});
