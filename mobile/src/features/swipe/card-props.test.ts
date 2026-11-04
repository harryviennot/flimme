import type { NextCard } from '@flimme/contract';

import { cardMeta, cardServices, formatRuntime, toMovieCard } from './card-props';

const base: NextCard = {
  title_id: 1,
  tmdb_id: 11,
  title: 'Paddington 2',
  overview: 'A bear in prison.',
  year: 2017,
  runtime_min: 103,
  genre_ids: [],
  tmdb_score: 7.44,
  tmdb_votes: 1000,
  poster_path: '/abc.jpg',
  poster_placeholder: 'hash',
  backdrop_path: null,
  trailer_key: null,
  directors: ['Paul King'],
  cast: ['Ben Whishaw', 'Hugh Grant', 'Hugh Bonneville', 'Sally Hawkins'],
  providers: [
    { provider_id: 8, kind: 'subscription', name: 'Netflix', logo_path: null },
    { provider_id: 8, kind: 'subscription', name: 'Netflix', logo_path: null },
    { provider_id: 9, kind: 'rent', name: 'Apple TV', logo_path: null },
    { provider_id: 10, kind: 'free', name: 'Arte', logo_path: null },
  ],
  watch_link: null,
  deck_source: 'opening',
  reason_code: null,
  reason_params: {},
  member_ratings: [],
};

describe('formatRuntime', () => {
  it('writes hours and two-digit minutes', () => {
    expect(formatRuntime(103, 'en')).toBe('1 h 43');
    expect(formatRuntime(124, 'fr')).toBe('2 h 04');
    expect(formatRuntime(120, 'fr')).toBe('2 h 00');
  });

  it('writes minutes alone under an hour', () => {
    expect(formatRuntime(45, 'en')).toBe('45 min');
  });
});

describe('cardMeta', () => {
  it('joins the year, the runtime and the score', () => {
    expect(cardMeta(base, 'en')).toBe('2017 · 1 h 43 · ★ 7.4');
  });

  it('writes the score with the language decimal mark', () => {
    expect(cardMeta(base, 'fr')).toBe('2017 · 1 h 43 · ★ 7,4');
  });

  it('leaves out what the film does not have', () => {
    expect(cardMeta({ ...base, year: null, runtime_min: null, tmdb_score: null }, 'en')).toBe('');
    expect(cardMeta({ ...base, tmdb_score: null }, 'en')).toBe('2017 · 1 h 43');
  });
});

describe('cardServices', () => {
  it('lists services included with a subscription or free, once each', () => {
    expect(cardServices(base)).toEqual(['Netflix', 'Arte']);
  });

  it('keeps three at most', () => {
    const many = ['A', 'B', 'C', 'D'].map((name, i) => ({
      provider_id: i,
      kind: 'subscription' as const,
      name,
      logo_path: null,
    }));
    expect(cardServices({ ...base, providers: many })).toEqual(['A', 'B', 'C']);
  });
});

describe('toMovieCard', () => {
  const text = { noSynopsis: 'No synopsis' };

  it('maps a card to the movie card', () => {
    const props = toMovieCard(base, {
      language: 'en',
      imageBase: 'https://img.test/t/p',
      screenWidth: 393,
      ...text,
    });
    expect(props.title).toBe('Paddington 2');
    expect(props.meta).toBe('2017 · 1 h 43 · ★ 7.4');
    expect(props.poster).toEqual({ uri: 'https://img.test/t/p/w500/abc.jpg' });
    expect(props.thumbhash).toBe('hash');
    expect(props.services).toEqual(['Netflix', 'Arte']);
    expect(props.back.synopsis).toBe('A bear in prison.');
    expect(props.back.tmdbRating).toBe('7.4');
    expect(props.back.director).toBe('Paul King');
    expect(props.back.cast).toBe('Ben Whishaw, Hugh Grant, and Hugh Bonneville');
  });

  it('shows the placeholder text for a missing synopsis and hides a missing score', () => {
    const props = toMovieCard(
      { ...base, overview: null, tmdb_score: null, directors: [], cast: [] },
      { language: 'en', imageBase: undefined, screenWidth: 393, ...text },
    );
    expect(props.back.synopsis).toBe('No synopsis');
    expect(props.back.tmdbRating).toBeUndefined();
    expect(props.back.director).toBeUndefined();
    expect(props.back.cast).toBeUndefined();
    expect(props.poster).toBeNull();
  });
});
