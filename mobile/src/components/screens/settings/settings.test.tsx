import i18n from '@/i18n';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import SettingsDeleteRoute from '@/app/settings/delete';
import SettingsScreen from '@/app/settings/index';
import { showToast } from '@/components/ui/toast';
import { wipeLocalData } from '@/features/account/wipe-app';
import { ANALYTICS_WORDING_VERSION } from '@/features/settings/analytics-sync';
import { useSettingsStore } from '@/features/settings';

jest.mock('@/api', () => ({
  api: { exportMyData: jest.fn(), setAnalyticsChoice: jest.fn(async () => ({ status: 'ok' })) },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
      refreshSession: jest.fn(async () => ({ data: { session: { access_token: 'fresh' } } })),
    },
  },
}));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  haptics: { error: jest.fn(), press: jest.fn() },
  setHapticsEnabled: jest.fn(),
}));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/account/wipe-app', () => ({ wipeLocalData: jest.fn(async () => undefined) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.3',
  nativeBuildVersion: '45',
}));
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    create() {}
    write(contents: string) {
      mockFiles.set(this.uri, contents);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));

jest.mock('@/features/profile', () => ({
  useMyProfile: () => ({ data: { country: 'FR' } }),
}));

let mockStrict = true;
jest.mock('@/features/analytics', () => ({ useAnalyticsStrict: () => mockStrict }));

let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));
let mockConfig: { data?: { legal_urls?: unknown }; isPending: boolean } = { isPending: false };
jest.mock('@/features/app-config/use-app-config', () => ({ useAppConfig: () => mockConfig }));

const legal = {
  privacy: { fr: 'https://flimme.test/fr/confidentialite', en: 'https://flimme.test/en/privacy' },
  terms: { fr: 'https://flimme.test/fr/conditions', en: 'https://flimme.test/en/terms' },
  deletion: { fr: 'https://flimme.test/fr/suppression', en: 'https://flimme.test/en/delete' },
  support_email: 'support@flimme.test',
};

const frame = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};
async function renderScreen(element: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={frame}>{element}</SafeAreaProvider>);
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockOnline = true;
  mockStrict = true;
  mockConfig = { data: { legal_urls: legal }, isPending: false };
  useSettingsStore.setState({ analyticsChoice: 'on', analyticsSynced: 'on' });
  await i18n.changeLanguage('en');
});

const dataOk = {
  status: 'ok',
  profile: null,
  services: [],
  consents: [],
  linked_accounts: [],
  letterboxd_diary: [],
  film_history: [],
  taste: null,
  games: [],
};

describe('the Settings rows', () => {
  it('shows every row in English and in French', async () => {
    await renderScreen(<SettingsScreen />);
    for (const label of [
      'Language, English',
      'Vibration',
      'Sound',
      'Help improve the app',
      'Download my data',
      'Privacy policy',
      'Terms of use',
      'Contact support',
      'Delete my data',
    ]) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    for (const label of [
      'Langue, Français',
      'Vibrations',
      'Sons',
      "Aider à améliorer l'appli",
      'Télécharger mes données',
      'Politique de confidentialité',
      "Conditions d'utilisation",
      'Contacter le support',
      'Supprimer mes données',
    ]) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
  });

  it('shows the chosen country and opens the country list', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Country, France'));
    expect(router.push).toHaveBeenCalledWith('/settings/country');
    await i18n.changeLanguage('fr');
    await renderScreen(<SettingsScreen />);
    expect(screen.getAllByLabelText('Pays, France').length).toBeGreaterThan(0);
  });

  it('opens the phone settings from Language', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Language, English'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps the analytics choice on the phone first, then sends it with the wording version', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Help improve the app' }));
    expect(useSettingsStore.getState().analyticsChoice).toBe('off');
    await waitFor(() =>
      expect(api.setAnalyticsChoice).toHaveBeenCalledWith({
        choice: 'off',
        version: ANALYTICS_WORDING_VERSION,
      }),
    );
  });

  describe('detailed stats', () => {
    it('is hidden outside strict regions', async () => {
      mockStrict = false;
      await renderScreen(<SettingsScreen />);
      expect(screen.queryByRole('switch', { name: 'Detailed stats' })).toBeNull();
    });

    it('is shown in strict regions: on moves to detailed, off moves back to on', async () => {
      await renderScreen(<SettingsScreen />);
      const row = () => screen.getByRole('switch', { name: 'Detailed stats' });
      await fireEvent.press(row());
      expect(useSettingsStore.getState().analyticsChoice).toBe('detailed');
      await fireEvent.press(row());
      expect(useSettingsStore.getState().analyticsChoice).toBe('on');
    });

    it('is disabled while analytics are off, and turning analytics off takes detailed with it', async () => {
      useSettingsStore.setState({ analyticsChoice: 'detailed' });
      await renderScreen(<SettingsScreen />);
      await fireEvent.press(screen.getByRole('switch', { name: 'Help improve the app' }));
      expect(useSettingsStore.getState().analyticsChoice).toBe('off');
      const row = screen.getByRole('switch', { name: 'Detailed stats' });
      expect(row).toBeDisabled();
      await fireEvent.press(row);
      expect(useSettingsStore.getState().analyticsChoice).toBe('off');
    });
  });

  it('shows the exact TMDB notice, the JustWatch credit and the version', async () => {
    await renderScreen(<SettingsScreen />);
    expect(
      screen.getByText(
        'This app uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeOnTheScreen();
    expect(screen.getByText('Version 1.2.3 (45)')).toBeOnTheScreen();
  });

  it('hides the policy, terms and support rows when legal_urls is missing or malformed', async () => {
    for (const bad of [undefined, 'nope', { privacy: 1 }]) {
      mockConfig = { data: { legal_urls: bad }, isPending: false };
      const view = await renderScreen(<SettingsScreen />);
      expect(screen.queryByLabelText('Privacy policy')).toBeNull();
      expect(screen.queryByLabelText('Terms of use')).toBeNull();
      expect(screen.queryByLabelText('Contact support')).toBeNull();
      expect(screen.getByLabelText('Delete my data')).toBeOnTheScreen();
      await view.unmount();
    }
  });

  it('opens the link in the app language', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Privacy policy'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://flimme.test/en/privacy');
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    await fireEvent.press(screen.getByLabelText("Conditions d'utilisation"));
    expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith(
      'https://flimme.test/fr/conditions',
    );
  });

  it('opens a mail to support, or copies the address with a toast when there is no mail app', async () => {
    const can = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Contact support'));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(String(open.mock.calls[0]?.[0])).toMatch(
      /^mailto:support@flimme\.test\?subject=Flimme%20support/,
    );

    can.mockResolvedValue(false);
    await fireEvent.press(screen.getByLabelText('Contact support'));
    await waitFor(() =>
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('support@flimme.test'),
    );
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Address copied' }));
  });
});

describe('Download my data', () => {
  it('writes the file, opens the share sheet and deletes the file after', async () => {
    (api.exportMyData as jest.Mock).mockResolvedValue(dataOk);
    (Sharing.shareAsync as jest.Mock).mockImplementation(async (uri: string) => {
      expect(JSON.parse(mockFiles.get(uri) ?? '{}')).not.toHaveProperty('status');
    });
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Download my data'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFiles.size).toBe(0));
    expect(String((Sharing.shareAsync as jest.Mock).mock.calls[0]?.[0])).toMatch(
      /flimme-data-\d{4}-\d{2}-\d{2}\.json$/,
    );
  });

  it('sends one request for a double tap', async () => {
    let finish: (value: unknown) => void = () => {};
    (api.exportMyData as jest.Mock).mockReturnValue(new Promise((r) => (finish = r)));
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Download my data'));
    await fireEvent.press(screen.getByLabelText('Preparing your data'));
    await fireEvent.press(screen.getByLabelText('Preparing your data'));
    expect(api.exportMyData).toHaveBeenCalledTimes(1);
    await act(async () => finish({ status: 'rate_limited' }));
  });

  it('tells the player when the hour is not over, and writes nothing', async () => {
    (api.exportMyData as jest.Mock).mockResolvedValue({ status: 'rate_limited' });
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Download my data'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'One download an hour' }),
      ),
    );
    expect(mockFiles.size).toBe(0);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('shows the offline toast and sends nothing when offline', async () => {
    mockOnline = false;
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Download my data'));
    expect(api.exportMyData).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You're offline. Connect to download your data." }),
    );
  });
});

describe('the delete sheet', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('opens from the Delete row', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Delete my data'));
    expect(router.push).toHaveBeenCalledWith('/settings/delete');
  });

  it('wipes and goes back to the splash once the server says ok', async () => {
    fetchMock.mockResolvedValue(reply(200, { status: 'ok' }));
    await renderScreen(<SettingsDeleteRoute />);
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(wipeLocalData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8000/v1/account/delete');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Your data is deleted' }),
    );
  });

  it('wipes nothing on try_again and lets the player try again', async () => {
    fetchMock.mockResolvedValueOnce(reply(503, { status: 'try_again' }));
    await renderScreen(<SettingsDeleteRoute />);
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    await screen.findByText(
      "We couldn't delete your data just now. Nothing changed, so try again.",
    );
    expect(wipeLocalData).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(reply(200, { status: 'ok' }));
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    await waitFor(() => expect(wipeLocalData).toHaveBeenCalledTimes(1));
  });

  it('refreshes the session once after unauthorized, then wipes', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { status: 'unauthorized' }))
      .mockResolvedValueOnce(reply(200, { status: 'ok' }));
    await renderScreen(<SettingsDeleteRoute />);
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    await waitFor(() => expect(wipeLocalData).toHaveBeenCalledTimes(1));
    const second = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((second[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('sends one request for a double tap', async () => {
    let finish: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (finish = r)));
    await renderScreen(<SettingsDeleteRoute />);
    const button = screen.getByLabelText('Delete everything');
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(reply(200, { status: 'ok' })));
  });

  it('says it is offline, disables the button and sends nothing', async () => {
    mockOnline = false;
    await renderScreen(<SettingsDeleteRoute />);
    expect(screen.getByText("You're offline. Nothing was deleted.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Delete everything'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels back to Settings', async () => {
    await renderScreen(<SettingsDeleteRoute />);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(router.back).toHaveBeenCalled();
  });
});
