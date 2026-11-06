// French takes the singular for 0 and for anything under 2 ("0 film", "1,5 film"). Hermes'
// `Intl.PluralRules` answered "other" for 0, so the app said "0 films". This patches i18next's
// resolver so French is right whatever the engine's Intl does; every other language is untouched.
type Resolver = {
  getSuffix: (code: string, count: number, options?: { ordinal?: boolean }) => string;
  options?: { prepend?: string };
};

export function isFrenchSingular(code: string, count: number, ordinal = false): boolean {
  return !ordinal && code.toLowerCase().startsWith('fr') && Math.abs(count) < 2;
}

export function patchFrenchPlurals(resolver: Resolver | undefined): void {
  if (!resolver) return;
  const original = resolver.getSuffix.bind(resolver);
  resolver.getSuffix = (code, count, options = {}) =>
    isFrenchSingular(code, count, options.ordinal)
      ? `${resolver.options?.prepend ?? '_'}one`
      : original(code, count, options);
}
