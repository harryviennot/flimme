import { usePathname } from 'expo-router';

import { LegalPage } from '@/components/screens/legal-page/legal-page';
import { legalDocuments } from '@/features/legal/documents';
import { resolveLegalPath } from '@/features/legal/pages';

// The policy, terms, support and deletion pages of flimme.com (roadmap M8.3), at /fr/<slug> and
// /en/<slug>. Web only: there is no native file of this name, so the phone app has no such route
// (Settings opens these addresses in the browser). The web root layout only mounts this route
// for a path that resolves to a page, so the null below is a guard.
export default function LegalRoute() {
  const location = resolveLegalPath(usePathname());
  if (!location) return null;
  const { markdown, updated } = legalDocuments[location.page][location.language];
  return <LegalPage location={location} markdown={markdown} updated={updated} />;
}
