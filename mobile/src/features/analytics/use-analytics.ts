import { getLocales } from 'expo-localization';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useMyProfile } from '@/features/profile';
import { useAnalyticsChoice } from '@/features/settings';
import { analytics } from '@/lib/analytics';
import { screenPattern } from '@/lib/screen-pattern';

import { useGamesPlayed } from './games';

const readDeviceRegion = () => getLocales()[0]?.regionCode ?? null;

/**
 * Keeps analytics in step with the choice, the device region and the profile (country and id),
 * and looks at the device region again whenever the app comes back to the foreground
 * (analytics.md#analytics-consent). Everything goes in one call, so a launch applies the mode once.
 */
export function useAnalyticsSetup(enabled: boolean): void {
  const choice = useAnalyticsChoice();
  const profile = useMyProfile(enabled).data;
  const [deviceRegion, setDeviceRegion] = useState(readDeviceRegion);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDeviceRegion(readDeviceRegion());
    });
    return () => subscription.remove();
  }, []);

  const profileId = profile?.id ?? null;
  const profileCountry = profile?.country ?? null;

  // What every event carries and the person is set with (analytics.md#events). Before `configure`
  // below, so the first identify already has them. No account or Letterboxd link exists yet.
  const { i18n } = useTranslation();
  const language = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const gamesPlayed = useGamesPlayed();
  const country = profileCountry && /^[A-Z]{2}$/.test(profileCountry) ? profileCountry : undefined;
  useEffect(() => {
    analytics.setRegistered({
      language,
      ...(country ? { country } : {}),
      has_account: false,
      has_letterboxd: false,
      games_played: gamesPlayed,
    });
  }, [language, country, gamesPlayed]);
  useEffect(() => {
    analytics.configure({ choice, region: { deviceRegion, profileCountry }, profileId });
  }, [choice, deviceRegion, profileCountry, profileId]);
}

/** One screen event per route change, named by the route pattern. Mount it after the stack. */
export function useScreenTracking(): void {
  const pattern = screenPattern(useSegments() as string[]);
  useEffect(() => {
    if (pattern) analytics.screen(pattern);
  }, [pattern]);
}
