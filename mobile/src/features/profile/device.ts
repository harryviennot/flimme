import type { MyProfile } from '@flimme/contract';

import type { AvatarColor } from '@/components/ui/avatar';

const REGION = /^[A-Z]{2}$/;

/**
 * What the device knows that the profile doesn't: the app's language whenever it differs
 * (decisions.md, 2 Nov 2026: the profile's language mirrors the app's), and the country only
 * while the profile has none, so a later choice is never overwritten. `null` when nothing
 * needs saving.
 */
export function deviceProfileChanges(
  profile: Pick<MyProfile, 'country' | 'language'>,
  device: { regionCode: string | null; language: string },
): { country?: string; language?: string } | null {
  const changes: { country?: string; language?: string } = {};
  if (profile.language !== device.language) changes.language = device.language;
  if (profile.country === null && device.regionCode !== null && REGION.test(device.regionCode)) {
    changes.country = device.regionCode;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

const PICKED_COLORS: readonly AvatarColor[] = ['blue', 'green', 'gold', 'red', 'violet', 'teal'];

/** The avatar color for a profile's `avatar_key`; `default`, `fox` and anything else draw blue. */
export function toAvatarColor(key: string): AvatarColor {
  return PICKED_COLORS.find((color) => color === key) ?? 'blue';
}
