import type { AvatarColor } from '@/components/ui/avatar';

// The store screenshots' fixtures (docs/store/screenshots.md). Fictional films, fictional
// players, a fictional room code. No TMDB data, no service logos: the posters are the design's
// own (`assets/posters/`), and services show as text.

export const STORE_SCENES = ['swipe', 'match', 'lobby', 'card-back', 'final-cut', 'recap'] as const;
export type StoreScene = (typeof STORE_SCENES)[number];

export function isStoreScene(value: unknown): value is StoreScene {
  return typeof value === 'string' && (STORE_SCENES as readonly string[]).includes(value);
}

export type StoreLanguage = 'fr' | 'en';

export function storeLanguage(value: unknown): StoreLanguage {
  return value === 'en' ? 'en' : 'fr';
}

/** A fixture code, shown on the store page; rooms expire, so no live room is exposed. */
export const STORE_ROOM_CODE = '123456';
export const STORE_SITE = 'flimme.com';

export type StorePlayer = { id: string; name: string; color: AvatarColor; count: number };

export const STORE_PLAYERS: readonly StorePlayer[] = [
  { id: 'lea', name: 'Léa', color: 'blue', count: 14 },
  { id: 'sam', name: 'Sam', color: 'green', count: 12 },
  { id: 'jo', name: 'Jo', color: 'gold', count: 15 },
  { id: 'maya', name: 'Maya', color: 'red', count: 11 },
];

export type StoreFilm = {
  id: number;
  title: string;
  year: number;
  /** A key of `fixturePosters`, and the file it loads from `assets/posters/`. */
  poster: 'neonHarbor' | 'paperComet' | 'midnightMatinee' | 'southboundSummer';
  posterFile: string;
  runtime: { h: number; min: number };
  rating: string;
  genre: Record<StoreLanguage, string>;
  synopsis: Record<StoreLanguage, string>;
  director: string;
  cast: string;
};

export const STORE_FILMS: readonly StoreFilm[] = [
  {
    id: 1,
    title: 'Neon Harbor',
    year: 2021,
    poster: 'neonHarbor',
    posterFile: 'neon-harbor.png',
    runtime: { h: 1, min: 52 },
    rating: '7.8',
    genre: { fr: 'Drame', en: 'Drama' },
    synopsis: {
      fr: 'Une nuit de pluie dans une petite ville portuaire, un phare qui ne s’éteint plus: trois amis cherchent qui garde la lumière allumée. Chaque indice les mène un peu plus près du quai, où quelqu’un les attend depuis des années.',
      en: 'One rainy night in a small harbor town, a lighthouse that will not go dark: three friends set out to find who keeps the light on. Every clue leads them closer to the pier, where someone has been waiting for years.',
    },
    director: 'Ana Moreau',
    cast: 'Lou Perrin, Tom Aldana, Iris Vale',
  },
  {
    id: 2,
    title: 'The Paper Comet',
    year: 2019,
    poster: 'paperComet',
    posterFile: 'the-paper-comet.png',
    runtime: { h: 1, min: 38 },
    rating: '7.4',
    genre: { fr: 'Aventure', en: 'Adventure' },
    synopsis: { fr: '', en: '' },
    director: 'Sam Okafor',
    cast: 'Mia Torres, Jun Park',
  },
  {
    id: 3,
    title: 'Midnight Matinee',
    year: 2023,
    poster: 'midnightMatinee',
    posterFile: 'midnight-matinee.png',
    runtime: { h: 2, min: 4 },
    rating: '8.1',
    genre: { fr: 'Comédie', en: 'Comedy' },
    synopsis: { fr: '', en: '' },
    director: 'Eli Brandt',
    cast: 'Noa Lindqvist, Ravi Menon',
  },
  {
    id: 4,
    title: 'Southbound Summer',
    year: 2018,
    poster: 'southboundSummer',
    posterFile: 'southbound-summer.png',
    runtime: { h: 1, min: 47 },
    rating: '7.2',
    genre: { fr: 'Road movie', en: 'Road movie' },
    synopsis: { fr: '', en: '' },
    director: 'Nina Castell',
    cast: 'Leo Marchetti, Ada Njoku',
  },
];

/** Service names as text (store-listing.md: no logos in store images). */
export const STORE_SERVICES = ['Service A', 'Service B'] as const;

export function metaOf(film: StoreFilm, language: StoreLanguage): string {
  const rating = new Intl.NumberFormat(language).format(Number(film.rating));
  const time =
    language === 'fr'
      ? `${film.runtime.h} h ${film.runtime.min}`
      : `${film.runtime.h}h ${film.runtime.min}m`;
  return `${film.year} · ${time} · ${film.genre[language]} · ★ ${rating}`;
}

/** The recap scene's numbers (a movie night of four, 3 min 42 s). */
export const STORE_RECAP = { people: 4, swipes: 47, seconds: 222 } as const;
