import { getLocales } from 'expo-localization';

import { useMyProfile } from '@/features/profile';
import { isStrictFor } from '@/lib/analytics-region';

/**
 * Whether the player is in a strict region (the EEA, the UK, Switzerland), by the same rule
 * analytics runs on. Settings shows the detailed stats switch only there.
 */
export function useAnalyticsStrict(): boolean {
  const profile = useMyProfile().data;
  return isStrictFor({
    deviceRegion: getLocales()[0]?.regionCode ?? null,
    profileCountry: profile?.country ?? null,
  });
}
