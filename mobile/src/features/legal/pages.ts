// The legal pages of flimme.com (M8.3): which path shows which text, in which language. No JSX.
// The first four paths are in `app_config.legal_urls` (migration 20261105104801) and in the texts
// themselves, so they never change; the support paths are new.

export type LegalLanguage = 'fr' | 'en';
export type LegalPageId = 'privacy' | 'terms' | 'support' | 'deletion';

export const legalLanguages: readonly LegalLanguage[] = ['fr', 'en'];
/** The order the pages are listed in, in the navigation. */
export const legalPageIds: readonly LegalPageId[] = ['privacy', 'terms', 'support', 'deletion'];

export const legalSlugs: Record<LegalPageId, Record<LegalLanguage, string>> = {
  privacy: { fr: 'confidentialite', en: 'privacy' },
  terms: { fr: 'conditions', en: 'terms' },
  support: { fr: 'assistance', en: 'support' },
  deletion: { fr: 'suppression', en: 'delete-account' },
};

export type LegalLocation = { language: LegalLanguage; page: LegalPageId };

/** The path of a page, such as `/fr/confidentialite`. */
export function legalPath(language: LegalLanguage, page: LegalPageId): string {
  return `/${language}/${legalSlugs[page][language]}`;
}

/** The full address, such as `https://flimme.com/en/privacy`. */
export function legalUrl(origin: string, language: LegalLanguage, page: LegalPageId): string {
  return `${origin}${legalPath(language, page)}`;
}

/** What a path shows, or null when it is not a legal page (a slug of the other language too). */
export function resolveLegalPath(pathname: string): LegalLocation | null {
  const match = /^\/(fr|en)\/([a-z-]+)\/?$/.exec(pathname);
  if (!match) return null;
  const language = match[1] as LegalLanguage;
  const slug = match[2];
  const page = legalPageIds.find((id) => legalSlugs[id][language] === slug);
  return page ? { language, page } : null;
}

export const otherLanguage = (language: LegalLanguage): LegalLanguage =>
  language === 'fr' ? 'en' : 'fr';

/** The same page in the other language. */
export function otherLanguagePath({ language, page }: LegalLocation): string {
  return legalPath(otherLanguage(language), page);
}

/** "5 novembre 2026" or "5 November 2026", from an ISO date, whatever the reader's time zone. */
export function formatUpdated(updated: string, language: LegalLanguage): string {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${updated}T00:00:00Z`));
}
