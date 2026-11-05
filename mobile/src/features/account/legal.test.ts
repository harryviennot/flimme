import { legalLinks, supportMailto } from './legal';

const good = {
  privacy: { fr: 'https://flimme.com/fr/confidentialite', en: 'https://flimme.com/en/privacy' },
  terms: { fr: 'https://flimme.com/fr/conditions', en: 'https://flimme.com/en/terms' },
  deletion: { fr: 'https://flimme.com/fr/suppression', en: 'https://flimme.com/en/delete-account' },
  support_email: 'support@flimme.com',
};

describe('legal links', () => {
  it('opens the French links in French and the English ones in English', () => {
    expect(legalLinks(good, 'fr')).toEqual({
      privacy: 'https://flimme.com/fr/confidentialite',
      terms: 'https://flimme.com/fr/conditions',
      supportEmail: 'support@flimme.com',
    });
    expect(legalLinks(good, 'en').privacy).toBe('https://flimme.com/en/privacy');
  });

  it('falls back to the other language when one link is empty', () => {
    const links = legalLinks(
      { ...good, terms: { fr: '', en: 'https://flimme.com/en/terms' } },
      'fr',
    );
    expect(links.terms).toBe('https://flimme.com/en/terms');
  });

  it('hides every row when the value is missing or malformed', () => {
    for (const bad of [undefined, null, 'x', {}, { ...good, privacy: 'nope' }]) {
      expect(legalLinks(bad, 'fr')).toEqual({ privacy: null, terms: null, supportEmail: null });
    }
  });

  it('refuses links that are not https, and an address that is not an address', () => {
    const links = legalLinks(
      {
        ...good,
        privacy: { fr: 'javascript:alert(1)', en: 'http://x.test' },
        support_email: 'nope',
      },
      'en',
    );
    expect(links.privacy).toBeNull();
    expect(links.supportEmail).toBeNull();
    expect(links.terms).toBe('https://flimme.com/en/terms');
  });

  it('builds the mail with the subject and two blank lines before the build', () => {
    const url = supportMailto({
      email: 'support@flimme.com',
      subject: 'Support Flimme',
      build: 'Version 1.0.0 (7), iOS 18.1',
    });
    expect(url.startsWith('mailto:support@flimme.com?subject=Support%20Flimme&body=')).toBe(true);
    expect(decodeURIComponent(url.split('body=')[1] ?? '')).toBe('\n\nVersion 1.0.0 (7), iOS 18.1');
  });
});
