// One JSON file per feature and language. French is written first; every key exists in
// both languages (scripts/check-i18n.mjs fails otherwise). Add a namespace here and in
// i18next.d.ts when a feature gets its file.
import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import enHost from './locales/en/host.json';
import enOnboarding from './locales/en/onboarding.json';
import frCommon from './locales/fr/common.json';
import frHome from './locales/fr/home.json';
import frHost from './locales/fr/host.json';
import frOnboarding from './locales/fr/onboarding.json';

export const resources = {
  fr: { common: frCommon, home: frHome, host: frHost, onboarding: frOnboarding },
  en: { common: enCommon, home: enHome, host: enHost, onboarding: enOnboarding },
} as const;
