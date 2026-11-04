// What the match overlay says about the film, in the app's language with `Intl`.

function runtime(minutes: number, language: string): string {
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(language, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(
      value,
    );
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return unit(rest, 'minute');
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
}

/** "2021 · 1 h 52", or whatever part the film has; an empty string with neither. */
export function matchMeta(
  film: { year: number | null; runtime_min: number | null },
  language: string,
): string {
  const parts: string[] = [];
  if (film.year !== null) parts.push(String(film.year));
  if (film.runtime_min !== null && film.runtime_min > 0) {
    parts.push(runtime(film.runtime_min, language));
  }
  return parts.join(' · ');
}
