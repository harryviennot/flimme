import type { MyProfile } from '@flimme/contract';

import type { AvatarColor } from '@/components/ui/avatar';

const REGION = /^[A-Z]{2}$/;

/**
 * What the device knows that the profile doesn't: the app's language whenever it differs
 * (decisions.md, 2 Nov 2026: the profile's language mirrors the app's), and the country only
 * while the profile has none, so a later choice is never overwritten. `null` when nothing
 * needs saving. With the list of countries that have a catalog, a saved country without one is
 * replaced by the phone's region when that has one (a missed or early first sync). A country with a
 * catalog is never replaced: it may be the player's own choice.
 */
export function deviceProfileChanges(
  profile: Pick<MyProfile, 'country' | 'language'>,
  device: { regionCode: string | null; language: string },
  catalog?: readonly string[] | null,
): { country?: string; language?: string } | null {
  const changes: { country?: string; language?: string } = {};
  if (profile.language !== device.language) changes.language = device.language;
  const region =
    device.regionCode !== null && REGION.test(device.regionCode) ? device.regionCode : null;
  if (region !== null) {
    const mend =
      profile.country !== null &&
      catalog != null &&
      !catalog.includes(profile.country) &&
      catalog.includes(region);
    if (profile.country === null || mend) changes.country = region;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

const PICKED_COLORS: readonly AvatarColor[] = ['blue', 'green', 'gold', 'red', 'violet', 'teal'];

/** The avatar color for a profile's `avatar_key`; `default`, `fox` and anything else draw blue. */
export function toAvatarColor(key: string): AvatarColor {
  return PICKED_COLORS.find((color) => color === key) ?? 'blue';
}
