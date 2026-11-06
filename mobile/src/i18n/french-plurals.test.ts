import i18n from './index';

describe('French plurals', () => {
  it('says the singular for 0 and 1 in French, the plural from 2', () => {
    const t = i18n.getFixedT('fr', 'ending');
    expect(t('nothingLeft.liked', { count: 0 })).toMatch(/^0 film aimé/);
    expect(t('nothingLeft.liked', { count: 1 })).toMatch(/^1 film aimé/);
    expect(t('nothingLeft.liked', { count: 2 })).toMatch(/^2 films aimés/);
    expect(t('filters.services', { count: 0 })).toBe('0 plateforme');
    expect(t('filters.services', { count: 2 })).toBe('2 plateformes');
  });

  it('keeps the English plural for 0', () => {
    const t = i18n.getFixedT('en', 'ending');
    expect(t('filters.services', { count: 0 })).toBe('0 services');
    expect(t('filters.services', { count: 1 })).toBe('1 service');
  });

  it('answers the singular for French even when the engine says other', () => {
    const resolver = i18n.services.pluralResolver as unknown as {
      getSuffix: (c: string, n: number) => string;
    };
    expect(resolver.getSuffix('fr', 0)).toBe('_one');
    expect(resolver.getSuffix('fr-FR', 0)).toBe('_one');
    expect(resolver.getSuffix('fr', 2)).toBe('_other');
  });
});
