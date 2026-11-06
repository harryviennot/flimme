import type { MyProfile } from '@flimme/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import i18n from '@/i18n';
import { MY_PROFILE_KEY, saveCachedProfile } from '@/features/profile';

export const CATALOG_COUNTRIES_KEY = ['catalog_countries'] as const;

/** The countries that have a catalog, by code. Rarely changes: kept for the session. */
export function useCatalogCountries() {
  return useQuery({
    queryKey: CATALOG_COUNTRIES_KEY,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => (await api.catalogCountries()).map((c) => c.code),
  });
}

export type ChooseOutcome = 'ok' | 'failed';

/**
 * Saves a chosen country on the profile. `ok` once saved (the profile in the cache changes, so
 * the setup screens carry on); `failed` for a refusal or a network error (nothing changed).
 */
export function useChooseCountry() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (country: string): Promise<ChooseOutcome> => {
      try {
        const answer = await api.updateProfile({ country });
        if (answer.status !== 'ok') return 'failed';
      } catch {
        return 'failed';
      }
      const profile = client.getQueryData<MyProfile | null>(MY_PROFILE_KEY);
      if (profile) {
        const saved = { ...profile, country };
        saveCachedProfile(saved);
        client.setQueryData(MY_PROFILE_KEY, saved);
      }
      return 'ok';
    },
  });
  return { choose: mutation.mutateAsync, busy: mutation.isPending };
}

/**
 * A country's name in the app's language: the `country:names` table first (Hermes has no
 * `Intl.DisplayNames`, so the phone would show "FR"), then `Intl` where it exists, then the code.
 */
export function countryName(code: string, language: string): string {
  const listed = i18n.t(`country:names.${code}`, { lng: language, defaultValue: '' });
  if (listed) return listed;
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
