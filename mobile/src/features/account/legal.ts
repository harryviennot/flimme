import { parseLegalUrls } from '@flimme/contract';

import type { Language } from '@/i18n';

export type LegalLinks = { privacy: string; terms: string; supportEmail: string };

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** The link in the app's language, or the other language's when that one is empty or not a link. */
function pick(links: { fr: string; en: string }, language: Language): string | null {
  const order = language === 'fr' ? [links.fr, links.en] : [links.en, links.fr];
  return order.find(isHttps) ?? null;
}

/**
 * The policy, terms and support address from `app_config.legal_urls` (settings.md, rows that
 * hide). A missing or malformed value gives null for that row: the screen hides it.
 */
export function legalLinks(
  raw: unknown,
  language: Language,
): { privacy: string | null; terms: string | null; supportEmail: string | null } {
  const urls = parseLegalUrls(raw);
  if (!urls) return { privacy: null, terms: null, supportEmail: null };
  const email = urls.support_email.trim();
  return {
    privacy: pick(urls.privacy, language),
    terms: pick(urls.terms, language),
    supportEmail: isEmail(email) ? email : null,
  };
}

/**
 * The support mail (settings.md, "Contact support"): the subject, and a body that ends with two
 * blank lines and the build, so support knows which app. No id of any kind.
 */
export function supportMailto(args: { email: string; subject: string; build: string }): string {
  const body = `\n\n${args.build}`;
  return `mailto:${args.email}?subject=${encodeURIComponent(args.subject)}&body=${encodeURIComponent(body)}`;
}
