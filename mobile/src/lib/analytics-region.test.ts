import { isStrictFor, isStrictRegion, resolveMode } from './analytics-region';

describe('strict regions', () => {
  it.each(['FR', 'DE', 'NO', 'IS', 'LI', 'GB', 'CH', 'fr', ' es '])('%s is strict', (code) => {
    expect(isStrictRegion(code)).toBe(true);
  });

  it.each(['US', 'CA', 'BR'])('%s is not strict', (code) => {
    expect(isStrictRegion(code)).toBe(false);
  });

  it('treats a missing or odd code as strict', () => {
    expect(isStrictRegion(null)).toBe(true);
    expect(isStrictRegion(undefined)).toBe(true);
    expect(isStrictRegion('')).toBe(true);
    expect(isStrictRegion('USA')).toBe(true);
  });

  it('is strict when either the device or the profile is strict, or one is missing', () => {
    expect(isStrictFor({ deviceRegion: 'US', profileCountry: 'US' })).toBe(false);
    expect(isStrictFor({ deviceRegion: 'US', profileCountry: 'FR' })).toBe(true);
    expect(isStrictFor({ deviceRegion: 'FR', profileCountry: 'US' })).toBe(true);
    expect(isStrictFor({ deviceRegion: 'US', profileCountry: null })).toBe(true);
    expect(isStrictFor({ deviceRegion: null, profileCountry: 'US' })).toBe(true);
  });
});

describe('the mode for a choice', () => {
  it('sends nothing when off', () => {
    expect(resolveMode('off', true)).toBe('off');
    expect(resolveMode('off', false)).toBe('off');
  });

  it('is anonymous in strict regions and identified elsewhere', () => {
    expect(resolveMode('on', true)).toBe('anonymous');
    expect(resolveMode('on', false)).toBe('identified');
  });

  it('identifies on detailed, and reads detailed as on outside strict regions', () => {
    expect(resolveMode('detailed', true)).toBe('identified');
    expect(resolveMode('detailed', false)).toBe('identified');
  });
});
