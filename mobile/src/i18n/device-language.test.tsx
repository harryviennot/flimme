import { act, render, screen } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { Text } from '@/components/ui/text';

import i18n, { applyDeviceLanguage, deviceLanguage, watchDeviceLanguage } from './index';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

/** The device's preferred languages, most preferred first. A full Locale has a dozen more fields. */
function deviceIn(...languageCodes: string[]) {
  jest
    .mocked(getLocales)
    .mockReturnValue(
      languageCodes.map((languageCode) => ({ languageCode })) as unknown as ReturnType<
        typeof getLocales
      >,
    );
}

function Like() {
  const { t } = useTranslation();
  return <Text>{t('answers.like')}</Text>;
}

let subscription: NativeEventSubscription | undefined;

afterEach(async () => {
  subscription?.remove();
  subscription = undefined;
  deviceIn('en');
  await i18n.changeLanguage('en');
  jest.restoreAllMocks();
});

describe('deviceLanguage', () => {
  it('answers French for any French device and English for everything else', () => {
    deviceIn('fr');
    expect(deviceLanguage()).toBe('fr');
    deviceIn('de');
    expect(deviceLanguage()).toBe('en');
  });

  it('takes the first of French or English in the preferred languages, as the system does', () => {
    deviceIn('de', 'fr');
    expect(deviceLanguage()).toBe('fr');
    deviceIn('de', 'en', 'fr');
    expect(deviceLanguage()).toBe('en');
  });
});

describe('applyDeviceLanguage', () => {
  it('switches the app when the device language changed', () => {
    deviceIn('fr');
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
    subscription = watchDeviceLanguage();
    expect(addListener).toHaveBeenCalledTimes(1);
    const [event, onChange] = addListener.mock.calls[0]!;
    expect(event).toBe('change');
    return {
      returned: addListener.mock.results[0]?.value as unknown,
      onChange: onChange as (state: AppStateStatus) => void,
    };
  }

  it('shows French once the app comes back to the foreground on a French device', async () => {
    const { onChange } = watch();
    await render(<Like />);
    expect(screen.getByText('Like')).toBeOnTheScreen();

    deviceIn('fr');
    await act(() => onChange('background'));
    expect(screen.getByText('Like')).toBeOnTheScreen();

    await act(() => onChange('active'));
    expect(screen.getByText("J'aime")).toBeOnTheScreen();
  });

  it('checks once when it starts, for a change made while the app was starting', () => {
    deviceIn('fr');
    watch();
    expect(i18n.language).toBe('fr');
  });

  it("gives back AppState's own subscription, so removing it stops the watch", () => {
    const { returned } = watch();
    expect(subscription).toBe(returned);
  });
});
