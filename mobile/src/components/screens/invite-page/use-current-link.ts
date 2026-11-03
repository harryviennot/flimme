import { useGlobalSearchParams, usePathname } from 'expo-router';

/** The path and query of the page being shown, as the invite page reads them. */
export function useCurrentLink(): string {
  const pathname = usePathname();
  const { r } = useGlobalSearchParams<{ r?: string | string[] }>();
  if (r === undefined) return pathname;
  // A repeated `r` is not a link we made: let the parser refuse it.
  const value = Array.isArray(r) ? r.join(',') : r;
  return `${pathname}?r=${value}`;
}
