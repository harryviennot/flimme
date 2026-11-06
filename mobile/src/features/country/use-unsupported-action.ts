import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/components/ui/toast';
import { errorFeedback } from '@/lib/feedback';

import { countryName, useCatalogCountries, useChooseCountry } from './queries';

/**
 * The action "Not in your country yet" offers (decisions.md, Q0.4): with one country that has a
 * catalog, one tap uses it; with several, the list opens. `null` while the list loads or when it
 * is empty or failed, so the screen keeps its "Join with a code" way out.
 */
export function useUnsupportedAction(): { label: string; onPress: () => void } | null {
  const { t, i18n } = useTranslation('country');
  const countries = useCatalogCountries();
  const { choose, busy } = useChooseCountry();
  const codes = countries.data ?? [];
  if (codes.length === 0) return null;

  if (codes.length === 1) {
    const code = codes[0] as string;
    return {
      label: t('use', { country: countryName(code, i18n.language) }),
      onPress: () => {
        if (busy) return;
        void choose(code).then((outcome) => {
          if (outcome === 'failed') {
            errorFeedback();
            showToast({ tone: 'warn', title: t('errors.save') });
          }
        });
      },
    };
  }
  return { label: t('choose'), onPress: () => router.push('/settings/country') };
}
