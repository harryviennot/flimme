import { describe, expect, it } from 'vitest';

import { parseLegalUrls } from './payloads';

const good = {
  privacy: { fr: 'https://flimme.com/fr/confidentialite', en: 'https://flimme.com/en/privacy' },
  terms: { fr: 'https://flimme.com/fr/conditions', en: 'https://flimme.com/en/terms' },
  deletion: { fr: 'https://flimme.com/fr/suppression', en: 'https://flimme.com/en/delete-account' },
  support_email: 'support@flimme.com',
};

describe('parseLegalUrls', () => {
  it('reads the six links and the address', () => {
    expect(parseLegalUrls(good)).toEqual(good);
  });

  it('returns null when a language is missing', () => {
    expect(
      parseLegalUrls({ ...good, terms: { fr: 'https://flimme.com/fr/conditions' } }),
    ).toBeNull();
  });

  it('returns null for a missing or malformed value', () => {
    expect(parseLegalUrls(undefined)).toBeNull();
    expect(parseLegalUrls('nope')).toBeNull();
  });
});
