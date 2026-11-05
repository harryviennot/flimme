// The Markdown text and date of every legal page, per language (src/content/legal).
import deletionEn, { updated as deletionEnUpdated } from '@/content/legal/delete-account.en';
import deletionFr, { updated as deletionFrUpdated } from '@/content/legal/delete-account.fr';
import privacyEn, { updated as privacyEnUpdated } from '@/content/legal/privacy.en';
import privacyFr, { updated as privacyFrUpdated } from '@/content/legal/privacy.fr';
import supportEn, { updated as supportEnUpdated } from '@/content/legal/support.en';
import supportFr, { updated as supportFrUpdated } from '@/content/legal/support.fr';
import termsEn, { updated as termsEnUpdated } from '@/content/legal/terms.en';
import termsFr, { updated as termsFrUpdated } from '@/content/legal/terms.fr';

import type { LegalLanguage, LegalPageId } from './pages';

export type LegalDocument = { markdown: string; updated: string };

export const legalDocuments: Record<LegalPageId, Record<LegalLanguage, LegalDocument>> = {
  privacy: {
    fr: { markdown: privacyFr, updated: privacyFrUpdated },
    en: { markdown: privacyEn, updated: privacyEnUpdated },
  },
  terms: {
    fr: { markdown: termsFr, updated: termsFrUpdated },
    en: { markdown: termsEn, updated: termsEnUpdated },
  },
  support: {
    fr: { markdown: supportFr, updated: supportFrUpdated },
    en: { markdown: supportEn, updated: supportEnUpdated },
  },
  deletion: {
    fr: { markdown: deletionFr, updated: deletionFrUpdated },
    en: { markdown: deletionEn, updated: deletionEnUpdated },
  },
};
