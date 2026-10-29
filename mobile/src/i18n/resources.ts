// One JSON file per feature and language. French is written first; every key exists in
// both languages (scripts/check-i18n.mjs fails otherwise). Add a namespace here and in
// i18next.d.ts when a feature gets its file.
import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';

export const resources = {
  fr: { common: frCommon },
  en: { common: enCommon },
} as const;
