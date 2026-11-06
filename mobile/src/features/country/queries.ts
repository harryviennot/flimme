import type { MyProfile } from '@flimme/contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
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

/** A country's name in the app's language (`Intl`), the code itself when the runtime has none. */
export function countryName(code: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
