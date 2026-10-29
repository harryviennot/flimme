import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

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

export default i18n;
