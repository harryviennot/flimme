import { act, render, screen } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus } from 'react-native';

import { Text } from '@/components/ui/text';

import i18n, { applyDeviceLanguage, deviceLanguage, watchDeviceLanguage } from './index';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', regionCode: 'GB' }]),
}));

// Only the fields deviceLanguage reads; a full Locale has a dozen more.
function deviceIn(languageCode: string, regionCode: string | null = null) {
  jest
    .mocked(getLocales)
    .mockReturnValue([{ languageCode, regionCode }] as unknown as ReturnType<typeof getLocales>);
}

function Like() {
  const { t } = useTranslation();
  return <Text>{t('answers.like')}</Text>;
}

afterEach(async () => {
  deviceIn('en', 'GB');
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

describe('deviceLanguage', () => {
  it('answers French for any French device and English for everything else', () => {
    deviceIn('fr', 'CA');
    expect(deviceLanguage()).toBe('fr');
    deviceIn('de', 'DE');
    expect(deviceLanguage()).toBe('en');
  });
});

describe('applyDeviceLanguage', () => {
  it('switches the app when the device language changed', () => {
    deviceIn('fr', 'FR');
    expect(applyDeviceLanguage()).toBe('fr');
    expect(i18n.language).toBe('fr');
  });

  it('leaves the app alone when the language is the same', () => {
    const change = jest.spyOn(i18n, 'changeLanguage');
    expect(applyDeviceLanguage()).toBe('en');
    expect(change).not.toHaveBeenCalled();
  });
});

describe('watchDeviceLanguage', () => {
  function watch() {
    // React Native's Jest setup already mocks it, so earlier calls are cleared first.
    const addListener = jest.spyOn(AppState, 'addEventListener').mockClear();
    const subscription = watchDeviceLanguage();
    expect(addListener).toHaveBeenCalledTimes(1);
    const [event, onChange] = addListener.mock.calls[0]!;
    expect(event).toBe('change');
    return { subscription, onChange: onChange as (state: AppStateStatus) => void };
  }

  it('shows French once the app comes back to the foreground on a French device', async () => {
    const { onChange } = watch();
    await render(<Like />);
    expect(screen.getByText('Like')).toBeOnTheScreen();

    deviceIn('fr', 'FR');
    await act(() => onChange('background'));
    expect(screen.getByText('Like')).toBeOnTheScreen();

    await act(() => onChange('active'));
    expect(screen.getByText("J'aime")).toBeOnTheScreen();
  });

  it('gives back the subscription so the listener can be removed', () => {
    const { subscription } = watch();
    expect(typeof subscription.remove).toBe('function');
  });
});
