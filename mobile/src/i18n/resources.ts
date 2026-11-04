// One JSON file per feature and language. French is written first; every key exists in
// both languages (scripts/check-i18n.mjs fails otherwise). Add a namespace here and in
// i18next.d.ts when a feature gets its file.
import enCommon from './locales/en/common.json';
import enEnding from './locales/en/ending.json';
import enHome from './locales/en/home.json';
import enHost from './locales/en/host.json';
import enJoin from './locales/en/join.json';
import enLobby from './locales/en/lobby.json';
import enMatch from './locales/en/match.json';
import enOnboarding from './locales/en/onboarding.json';
import enReport from './locales/en/report.json';
import enSwipe from './locales/en/swipe.json';
import enWeb from './locales/en/web.json';
import enWinner from './locales/en/winner.json';
import frCommon from './locales/fr/common.json';
import frEnding from './locales/fr/ending.json';
import frHome from './locales/fr/home.json';
import frHost from './locales/fr/host.json';
import frJoin from './locales/fr/join.json';
import frLobby from './locales/fr/lobby.json';
import frMatch from './locales/fr/match.json';
import frOnboarding from './locales/fr/onboarding.json';
import frReport from './locales/fr/report.json';
import frSwipe from './locales/fr/swipe.json';
import frWeb from './locales/fr/web.json';
import frWinner from './locales/fr/winner.json';

export const resources = {
  fr: {
    common: frCommon,
    ending: frEnding,
    home: frHome,
    host: frHost,
    join: frJoin,
    lobby: frLobby,
    match: frMatch,
    onboarding: frOnboarding,
    report: frReport,
    swipe: frSwipe,
    web: frWeb,
    winner: frWinner,
  },
  en: {
    common: enCommon,
    ending: enEnding,
    home: enHome,
    host: enHost,
    join: enJoin,
    lobby: enLobby,
    match: enMatch,
    onboarding: enOnboarding,
    report: enReport,
    swipe: enSwipe,
    web: enWeb,
    winner: enWinner,
  },
} as const;
