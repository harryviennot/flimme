import type { Card } from '@flimme/contract';

import { sheetCardProps } from './sheet-card';

const card: Card = {
  title_id: 1,
  tmdb_id: 949,
  title: 'Heat',
  overview: 'A crew and a cop.',
  year: 1995,
  runtime_min: 170,
  genre_ids: [],
  tmdb_score: 7.9,
  tmdb_votes: 100,
  poster_path: '/p.jpg',
  poster_placeholder: null,
  backdrop_path: null,
  trailer_key: 'abc',
  directors: ['Michael Mann'],
  cast: ['Al Pacino', 'Robert De Niro'],
  providers: [{ provider_id: 8, kind: 'subscription', name: 'Netflix', logo_path: null }],
  watch_link: null,
};
const options = {
  language: 'en',
  imageBase: 'https://img.test/t/p',
  screenWidth: 375,
  noSynopsis: 'No synopsis',
};

describe('sheetCardProps', () => {
  it('is a still back with the poster, meta, rating and synopsis', () => {
    const props = sheetCardProps(card, options);
    expect(props.still).toBe(true);
    expect(props.poster).toEqual({ uri: 'https://img.test/t/p/w500/p.jpg' });
    expect(props.meta).toBe('1995 · 2 h 50 · ★ 7.9');
    expect(props.back.tmdbRating).toBe('7.9');
    expect(props.back.synopsis).toBe('A crew and a cop.');
    expect(props.back.director).toBe('Michael Mann');
  });

  it('leaves out the trailer, a friend rating, the reason and the service tags', () => {
    const props = sheetCardProps(card, options);
    expect(props.back.onTrailer).toBeUndefined();
    expect(props.back.friendRating).toBeUndefined();
    expect(props.reason).toBeUndefined();
    expect(props.services).toEqual([]);
    expect(props.back.services).toEqual([]);
  });

  it('says there is no synopsis, and has no poster without a path', () => {
    const props = sheetCardProps({ ...card, overview: null, poster_path: null }, options);
    expect(props.back.synopsis).toBe('No synopsis');
    expect(props.poster).toBeNull();
  });
});
