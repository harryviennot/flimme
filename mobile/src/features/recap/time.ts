import type { TFunction } from 'i18next';

// "3 min 42 s" in both languages (Q21.7): seconds under a minute, minutes and seconds under an
// hour (just minutes when the seconds are 0), hours and minutes from an hour, seconds dropped.
// No zero padding; the numbers go through `Intl` in the app's language.

export function formatRecapTime(
  totalSeconds: number,
  t: TFunction<'recap'>,
  language: string,
): string {
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const total = Math.max(0, Math.round(totalSeconds));
  if (total < 60) return t('time.seconds', { seconds: number(total) });
  if (total < 3600) {
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return seconds === 0
      ? t('time.minutes', { minutes: number(minutes) })
      : t('time.minutesSeconds', { minutes: number(minutes), seconds: number(seconds) });
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return t('time.hoursMinutes', { hours: number(hours), minutes: number(minutes) });
}
