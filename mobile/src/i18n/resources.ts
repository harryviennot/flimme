// One JSON file per feature and language. French is written first; every key exists in
// both languages (scripts/check-i18n.mjs fails otherwise). Add a namespace here and in
// i18next.d.ts when a feature gets its file.
import enCommon from './locales/en/common.json';
import enCountry from './locales/en/country.json';
import enEnding from './locales/en/ending.json';
import enFinale from './locales/en/finale.json';
import enHome from './locales/en/home.json';
import enHost from './locales/en/host.json';
import enJoin from './locales/en/join.json';
import enLobby from './locales/en/lobby.json';
import enMatch from './locales/en/match.json';
import enMyFilms from './locales/en/myFilms.json';
import enOnboarding from './locales/en/onboarding.json';
import enPlayAgain from './locales/en/playAgain.json';
import enRecap from './locales/en/recap.json';
import enReport from './locales/en/report.json';
import enSettings from './locales/en/settings.json';
import enSolo from './locales/en/solo.json';
import enSwipe from './locales/en/swipe.json';
import enWeb from './locales/en/web.json';
import enWinner from './locales/en/winner.json';
import frCommon from './locales/fr/common.json';
import frCountry from './locales/fr/country.json';
import frEnding from './locales/fr/ending.json';
import frFinale from './locales/fr/finale.json';
import frHome from './locales/fr/home.json';
import frHost from './locales/fr/host.json';
import frJoin from './locales/fr/join.json';
import frLobby from './locales/fr/lobby.json';
import frMatch from './locales/fr/match.json';
import frMyFilms from './locales/fr/myFilms.json';
import frOnboarding from './locales/fr/onboarding.json';
import frPlayAgain from './locales/fr/playAgain.json';
import frRecap from './locales/fr/recap.json';
import frReport from './locales/fr/report.json';
import frSettings from './locales/fr/settings.json';
import frSolo from './locales/fr/solo.json';
import frSwipe from './locales/fr/swipe.json';
import frWeb from './locales/fr/web.json';
import frWinner from './locales/fr/winner.json';

export const resources = {
  fr: {
    common: frCommon,
    country: frCountry,
    ending: frEnding,
    finale: frFinale,
    home: frHome,
    host: frHost,
    join: frJoin,
    lobby: frLobby,
    match: frMatch,
    myFilms: frMyFilms,
    onboarding: frOnboarding,
    playAgain: frPlayAgain,
    recap: frRecap,
    report: frReport,
    settings: frSettings,
    solo: frSolo,
    swipe: frSwipe,
    web: frWeb,
    winner: frWinner,
  },
  en: {
    common: enCommon,
    country: enCountry,
    ending: enEnding,
    finale: enFinale,
    home: enHome,
    host: enHost,
    join: enJoin,
    lobby: enLobby,
    match: enMatch,
    myFilms: enMyFilms,
    onboarding: enOnboarding,
    playAgain: enPlayAgain,
    recap: enRecap,
    report: enReport,
    settings: enSettings,
    solo: enSolo,
    swipe: enSwipe,
    web: enWeb,
    winner: enWinner,
  },
} as const;
