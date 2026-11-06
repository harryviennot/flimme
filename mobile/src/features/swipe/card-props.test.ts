import type { NextCard } from '@flimme/contract';

import {
  backMeta,
  backServices,
  cardMeta,
  cardServices,
  formatRuntime,
  toMovieCard,
  trailerAllowed,
  trailerUrl,
} from './card-props';

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
  seen: false,
  saved: false,
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
    expect(props.back.meta).toBe('2017 · 1 h 43');
    expect(props.back.director).toBe('Paul King');
    expect(props.back.cast).toBe('Ben Whishaw, Hugh Grant, Hugh Bonneville, and Sally Hawkins');
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

describe('backMeta', () => {
  it('is the year and the runtime, without the score', () => {
    expect(backMeta(base, 'en')).toBe('2017 · 1 h 43');
    expect(backMeta(base, 'fr')).toBe('2017 · 1 h 43');
  });

  it('leaves out what the film lacks', () => {
    expect(backMeta({ ...base, runtime_min: null }, 'en')).toBe('2017');
    expect(backMeta({ ...base, year: null, runtime_min: 45 }, 'en')).toBe('45 min');
    expect(backMeta({ ...base, year: null, runtime_min: null }, 'en')).toBe('');
  });
});

describe('backServices', () => {
  const offers = (names: string[]) =>
    names.map((name, i) => ({
      provider_id: i,
      kind: 'subscription' as const,
      name,
      logo_path: i === 0 ? '/logo.png' : null,
    }));

  it('lists the included services once each', () => {
    expect(backServices(base, undefined).map((s) => s.name)).toEqual(['Netflix', 'Arte']);
  });

  it('builds the logo from the image base', () => {
    const [first] = backServices(
      { ...base, providers: offers(['Netflix']) },
      'https://img.test/t/p/',
    );
    expect(first).toEqual({ name: 'Netflix', logo: 'https://img.test/t/p/w92/logo.png' });
  });

  it('has no logo without a base', () => {
    const [first] = backServices({ ...base, providers: offers(['Netflix']) }, undefined);
    expect(first).toEqual({ name: 'Netflix', logo: undefined });
  });

  it('keeps six at most', () => {
    const list = backServices(
      { ...base, providers: offers(['A', 'B', 'C', 'D', 'E', 'F', 'G']) },
      undefined,
    );
    expect(list.map((s) => s.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('trailerUrl', () => {
  it('opens the video on YouTube', () => {
    expect(trailerUrl('abc_DEF-123')).toBe('https://www.youtube.com/watch?v=abc_DEF-123');
  });
  it('escapes what is not a plain key', () => {
    expect(trailerUrl('a b&c')).toBe('https://www.youtube.com/watch?v=a%20b%26c');
  });
});

describe('toMovieCard back', () => {
  const options = {
    language: 'en',
    imageBase: 'https://img.test/t/p/',
    screenWidth: 390,
    noSynopsis: 'No synopsis',
  };

  it('carries the synopsis, the directors, five cast names, the score and the services', () => {
    const cast = ['A', 'B', 'C', 'D', 'E', 'F'];
    const view = toMovieCard({ ...base, cast, directors: ['Paul King', 'Jo Doe'] }, options);
    expect(view.back.synopsis).toBe('A bear in prison.');
    expect(view.back.director).toBe('Paul King and Jo Doe');
    expect(view.back.cast).toBe('A, B, C, D, and E');
    expect(view.back.tmdbRating).toBe('7.4');
    expect(view.back.services?.map((s) => s.name)).toEqual(['Netflix', 'Arte']);
  });

  it('passes the Read more and control touch handlers on', () => {
    const onReadMore = jest.fn();
    const onControlTouch = jest.fn();
    const view = toMovieCard(base, { ...options, onReadMore, onControlTouch });
    view.back.onReadMore?.();
    view.back.onControlTouch?.();
    expect(onReadMore).toHaveBeenCalledTimes(1);
    expect(onControlTouch).toHaveBeenCalledTimes(1);
    expect(toMovieCard(base, options).back.onReadMore).toBeUndefined();
  });

  it('has a trailer button only with a trailer key', () => {
    const open = jest.fn();
    const uncapped = { ...options, onTrailer: open, maxAge: null };
    expect(toMovieCard(base, uncapped).back.onTrailer).toBeUndefined();
    const view = toMovieCard({ ...base, trailer_key: 'xyz' }, uncapped);
    view.back.onTrailer?.();
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/watch?v=xyz');
  });

  it.each([0, 10, 12])('has no trailer button in a room capped at %i', (maxAge) => {
    const view = toMovieCard(
      { ...base, trailer_key: 'xyz' },
      { ...options, onTrailer: jest.fn(), maxAge },
    );
    expect(view.back.onTrailer).toBeUndefined();
  });

  it.each([13, 16, 18, null])('has the trailer button in a room capped at %s', (maxAge) => {
    const view = toMovieCard(
      { ...base, trailer_key: 'xyz' },
      { ...options, onTrailer: jest.fn(), maxAge },
    );
    expect(view.back.onTrailer).toBeDefined();
  });

  it('has no trailer button until the room is known', () => {
    const view = toMovieCard({ ...base, trailer_key: 'xyz' }, { ...options, onTrailer: jest.fn() });
    expect(view.back.onTrailer).toBeUndefined();
  });

  it('has no trailer button when nobody can open it', () => {
    expect(toMovieCard({ ...base, trailer_key: 'xyz' }, options).back.onTrailer).toBeUndefined();
  });
});

describe('trailerAllowed', () => {
  it('allows uncapped rooms and caps of 13 or more only', () => {
    expect(trailerAllowed(null)).toBe(true);
    expect(trailerAllowed(13)).toBe(true);
    expect(trailerAllowed(16)).toBe(true);
    expect(trailerAllowed(12)).toBe(false);
    expect(trailerAllowed(10)).toBe(false);
    expect(trailerAllowed(0)).toBe(false);
    expect(trailerAllowed(undefined)).toBe(false);
  });
});
