import {
  formatUpdated,
  legalLanguages,
  legalPageIds,
  legalPath,
  legalUrl,
  otherLanguagePath,
  resolveLegalPath,
} from './pages';

// The addresses the app already links to (app_config.legal_urls, migration 20261105104801):
// the texts link to each other with them, so they must never move.
const FIXED: [string, string][] = [
  ['https://flimme.com/fr/confidentialite', 'privacy'],
  ['https://flimme.com/en/privacy', 'privacy'],
  ['https://flimme.com/fr/conditions', 'terms'],
  ['https://flimme.com/en/terms', 'terms'],
  ['https://flimme.com/fr/suppression', 'deletion'],
  ['https://flimme.com/en/delete-account', 'deletion'],
];

describe('the legal paths', () => {
  it.each(FIXED)('keeps %s', (url, page) => {
    const { pathname } = new URL(url);
    expect(resolveLegalPath(pathname)?.page).toBe(page);
    const language = pathname.startsWith('/fr/') ? 'fr' : 'en';
    expect(legalUrl('https://flimme.com', language, page as never)).toBe(url);
  });

  it('has the support page, one path per language', () => {
    expect(legalPath('fr', 'support')).toBe('/fr/assistance');
    expect(legalPath('en', 'support')).toBe('/en/support');
  });

  it('resolves every page in every language, with or without a trailing slash', () => {
    for (const language of legalLanguages) {
      for (const page of legalPageIds) {
        const path = legalPath(language, page);
        expect(resolveLegalPath(path)).toEqual({ language, page });
        expect(resolveLegalPath(`${path}/`)).toEqual({ language, page });
      }
    }
  });

  it('gives every page a different path', () => {
    const paths = legalLanguages.flatMap((l) => legalPageIds.map((p) => legalPath(l, p)));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it.each([
    '/',
    '/fr',
    '/fr/',
    '/en/confidentialite',
    '/fr/privacy',
    '/de/privacy',
    '/en/privacy/extra',
    '/join/482913',
    '/EN/privacy',
  ])('does not resolve %s', (pathname) => {
    expect(resolveLegalPath(pathname)).toBeNull();
  });

  it('links to the same page in the other language', () => {
    expect(otherLanguagePath({ language: 'fr', page: 'deletion' })).toBe('/en/delete-account');
    expect(otherLanguagePath({ language: 'en', page: 'support' })).toBe('/fr/assistance');
  });
});

describe('formatUpdated', () => {
  it('writes the date in the page language', () => {
    expect(formatUpdated('2026-11-05', 'fr')).toBe('5 novembre 2026');
    expect(formatUpdated('2026-11-05', 'en')).toBe('5 November 2026');
  });
});
