import { matchMeta } from './format';

describe('the match meta line', () => {
  it('joins the year and the runtime', () => {
    expect(matchMeta({ year: 2021, runtime_min: 112 }, 'en')).toBe('2021 · 1 h 52');
    expect(matchMeta({ year: 1999, runtime_min: 107 }, 'fr')).toBe('1999 · 1 h 47');
  });
  it('leaves out what the film lacks', () => {
    expect(matchMeta({ year: 2021, runtime_min: null }, 'fr')).toBe('2021');
    expect(matchMeta({ year: null, runtime_min: 45 }, 'fr')).toBe('45 min');
    expect(matchMeta({ year: null, runtime_min: null }, 'fr')).toBe('');
  });
});
