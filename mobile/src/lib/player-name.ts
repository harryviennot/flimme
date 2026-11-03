// What makes a player name sendable (onboarding.md#first-launch): 1 to 24 characters once
// trimmed, counted in code points as the database does.
export const NAME_MAX = 24;

/** The first code point of the trimmed name, so an emoji is never split. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? '';
}

export function isNameValid(name: string): boolean {
  const length = Array.from(name.trim()).length;
  return length >= 1 && length <= NAME_MAX;
}
