import { useQuery } from '@tanstack/react-query';

import { api } from '@/api';

export const MY_PROVIDERS_KEY = ['my_providers'] as const;
export const countryProvidersKey = (country: string | null) =>
  ['country_providers', country] as const;

/** The country's listed services, in display order. Not asked while the profile has no country. */
export function useCountryProviders(country: string | null | undefined) {
  return useQuery({
    queryKey: countryProvidersKey(country ?? null),
    enabled: Boolean(country),
    queryFn: () => api.countryProviders({ country: country as string }),
  });
}

/** The service ids saved on the profile. */
export function useMyProviders(enabled = true) {
  return useQuery({ queryKey: MY_PROVIDERS_KEY, enabled, queryFn: () => api.myProviders() });
}
