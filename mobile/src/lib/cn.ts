/**
 * Joins class names, skipping empty ones. There's no class merging on purpose: a
 * component offers variants instead of letting callers override its classes.
 */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
