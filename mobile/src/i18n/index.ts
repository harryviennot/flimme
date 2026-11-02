import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AppState, type NativeEventSubscription } from 'react-native';

import { resources } from './resources';

export const languages = ['fr', 'en'] as const;
export type Language = (typeof languages)[number];

/** French or English from the device; anything else falls back to English. */
export function deviceLanguage(): Language {
  return getLocales()[0]?.languageCode === 'fr' ? 'fr' : 'en';
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
 * again on every return to the foreground (Expo's localization guide). The root layout calls
 * this once.
 */
export function watchDeviceLanguage(): NativeEventSubscription {
  return AppState.addEventListener('change', (state) => {
    if (state === 'active') applyDeviceLanguage();
  });
}

export default i18n;
