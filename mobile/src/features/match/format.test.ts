import { matchMeta } from './format';

describe('the match meta line', () => {
  it('joins the year and the runtime', () => {
    expect(matchMeta({ year: 2021, runtime_min: 112 }, 'en')).toMatch(/^2021 · 1h 52m/);
  });
  it('leaves out what the film lacks', () => {
    expect(matchMeta({ year: 2021, runtime_min: null }, 'fr')).toBe('2021');
    expect(matchMeta({ year: null, runtime_min: 45 }, 'fr')).toMatch(/45/);
    expect(matchMeta({ year: null, runtime_min: null }, 'fr')).toBe('');
  });
});
