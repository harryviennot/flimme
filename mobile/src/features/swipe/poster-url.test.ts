import { LARGE_SCREEN_WIDTH, posterSize, posterUrl } from './poster-url';

describe('posterSize', () => {
  it('is w500 on phones and w780 from 600 points wide', () => {
    expect(posterSize(375)).toBe('w500');
    expect(posterSize(LARGE_SCREEN_WIDTH - 1)).toBe('w500');
    expect(posterSize(LARGE_SCREEN_WIDTH)).toBe('w780');
    expect(posterSize(834)).toBe('w780');
  });
});

describe('posterUrl', () => {
  it('joins the base, the size and the path with exactly one slash each', () => {
    expect(posterUrl('https://image.tmdb.org/t/p/', '/abc.jpg', 375)).toBe(
      'https://image.tmdb.org/t/p/w500/abc.jpg',
    );
    expect(posterUrl('https://image.tmdb.org/t/p', 'abc.jpg', 700)).toBe(
      'https://image.tmdb.org/t/p/w780/abc.jpg',
    );
  });

  it('is null without a base or a path, and never the original size', () => {
    expect(posterUrl(undefined, '/abc.jpg', 375)).toBeNull();
    expect(posterUrl('https://image.tmdb.org/t/p/', null, 375)).toBeNull();
    expect(posterUrl('https://image.tmdb.org/t/p/', '/abc.jpg', 375)).not.toContain('original');
  });
});
