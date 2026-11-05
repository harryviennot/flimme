// The screen name sent to analytics: the route pattern from the router's segments
// (`/join/[code]`), never the path (`/join/482913`). Groups like `(tabs)` are not part of it.
// Development screens and anything unusual (`+not-found`) are not tracked.
export function screenPattern(segments: readonly string[]): string | null {
  const parts = segments.filter((segment) => !/^\(.*\)$/.test(segment));
  if (parts[0] === 'dev') return null;
  if (parts.some((part) => !/^([a-z-]+|\[[a-zA-Z]+\])$/.test(part))) return null;
  return `/${parts.join('/')}`;
}
