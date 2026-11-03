import type { MyProfile } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { useEffect, useRef } from 'react';

import { api } from '@/api';
import { deviceLanguage } from '@/i18n';

import { saveCachedProfile } from './cache';
import { deviceProfileChanges } from './device';
import { MY_PROFILE_KEY } from './use-my-profile';

/**
 * Saves the device's language and country to the profile once per launch, silently
 * (splash.md#what-happens-in-order, step 3). `fresh` is true once the profile was read from
 * the server this launch. A failure or a refusal changes nothing and waits for the next launch.
 */
export function useDeviceSync(profile: MyProfile | null | undefined, fresh: boolean): void {
  const client = useQueryClient();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !fresh || !profile) return;
    done.current = true;
    const changes = deviceProfileChanges(profile, {
      regionCode: getLocales()[0]?.regionCode ?? null,
      language: deviceLanguage(),
    });
    if (!changes) return;
    api
      .updateProfile(changes)
      .then((answer) => {
        if (answer.status !== 'ok') return;
        const saved = { ...profile, ...changes };
        saveCachedProfile(saved);
        client.setQueryData(MY_PROFILE_KEY, saved);
      })
      .catch(() => {
        // Already reported by the api layer; the next launch tries again.
      });
  }, [client, profile, fresh]);
}
