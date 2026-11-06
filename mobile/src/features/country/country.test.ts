import '@/i18n';

import { countryName } from './queries';

jest.mock('@/api', () => ({ api: {} }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

describe('countryName', () => {
  it('names a launch country in the asked language, without Intl', () => {
    expect(countryName('FR', 'fr')).toBe('France');
    expect(countryName('US', 'fr')).toBe('États-Unis');
    expect(countryName('US', 'en')).toBe('United States');
  });

  it('falls back to Intl, then to the code, for a country the table lacks', () => {
    expect(countryName('JP', 'en').length).toBeGreaterThan(0);
    const original = Object.getOwnPropertyDescriptor(Intl, 'DisplayNames');
    // Hermes has no Intl.DisplayNames: the code is what is left.
    Object.defineProperty(Intl, 'DisplayNames', { value: undefined, configurable: true });
    try {
      expect(countryName('JP', 'en')).toBe('JP');
    } finally {
      if (original) Object.defineProperty(Intl, 'DisplayNames', original);
    }
  });
});
