import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AppState, type NativeEventSubscription } from 'react-native';

import { patchFrenchPlurals } from './french-plurals';
import { resources } from './resources';

export const languages = ['fr', 'en'] as const;
export type Language = (typeof languages)[number];

function isLanguage(code: string | null): code is Language {
  return (languages as readonly (string | null)[]).includes(code);
}

/**
 * The first of French or English in the device's preferred languages, as the system picks for
 * the app since both are declared in `supportedLocales`; English when neither is there.
 */
export function deviceLanguage(): Language {
  return (
    getLocales()
      .map((locale) => locale.languageCode)
      .find(isLanguage) ?? 'en'
  );
}

// i18next's default export is the instance; `use` registers the React binding.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(resources.en),
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Hermes answers "other" for French 0; French takes the singular (copy skill, Keys).
patchFrenchPlurals(i18n.services.pluralResolver as Parameters<typeof patchFrenchPlurals>[0]);

/** Switches the app to the device's language when it changed, and answers the language. */
export function applyDeviceLanguage(): Language {
  const language = deviceLanguage();
  // The instance's own method, so a test can spy on it (the named export is bound at import).
  // eslint-disable-next-line import/no-named-as-default-member
  if (i18n.language !== language) void i18n.changeLanguage(language);
  return language;
}

/**
 * iOS restarts the app when its language changes; Android doesn't, so the language is checked
 * again on every return to the foreground (Expo's localization guide), and once now, in case it
 * changed while the app was starting. The root layout calls this once.
 */
export function watchDeviceLanguage(): NativeEventSubscription {
  applyDeviceLanguage();
  return AppState.addEventListener('change', (state) => {
    if (state === 'active') applyDeviceLanguage();
  });
}

export default i18n;
