const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

function parts(version: string): [number, number, number] | null {
  const match = versionPattern.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Whether `value` reads as major.minor.patch. */
export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && parts(value) !== null;
}

/**
 * Whether `current` is older than `minimum`, comparing major, minor and patch as numbers
 * (1.10.0 is newer than 1.9.0). A version that doesn't read as major.minor.patch is never
 * below: the app must not lock out players over a typo on either side.
 */
export function isBelowMinimum(current: string, minimum: string): boolean {
  const a = parts(current);
  const b = parts(minimum);
  if (!a || !b) return false;
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}
