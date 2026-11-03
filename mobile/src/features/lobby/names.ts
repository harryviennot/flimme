// Service names and lists (lobby.md#service-names): ids are joined to the country's list, an id
// the list doesn't know is skipped (Q11.1).
import type { CountryProvider } from '@flimme/contract';

export function serviceNames(
  ids: readonly number[],
  providers: readonly CountryProvider[] | undefined,
): string[] {
  const known = new Map((providers ?? []).map((p) => [p.provider_id, p.name]));
  return ids.flatMap((id) => {
    const name = known.get(id);
    return name === undefined ? [] : [name];
  });
}

/** "Netflix, Disney+ and Max" in the app's language (Hermes may lack `Intl.ListFormat`). */
export function formatList(items: readonly string[], language: string): string {
  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(items);
  }
  const and = language === 'fr' ? ' et ' : ' and ';
  if (items.length <= 2) return items.join(and);
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`;
}
