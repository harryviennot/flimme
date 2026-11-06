import { api } from '@/api';

export const CATALOG_COUNTRIES_KEY = ['catalog_countries'] as const;

/** The codes of the countries that have a catalog (shared by the launch sync and the screens). */
export async function fetchCatalogCodes(): Promise<string[]> {
  return (await api.catalogCountries()).map((c) => c.code);
}
