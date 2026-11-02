import type { AppConfig } from '@flimme/contract';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { AppState, type NativeEventSubscription, Platform } from 'react-native';

import { api } from '@/api';
import { startSession } from '@/features/session';

import { parseAppConfig } from './parse';
import { isBelowMinimum } from './version';

export const appConfigKey = ['app_config'] as const;

// A value in the table the app can't read. It must reach Sentry once M3.9 lands; until then
// it goes to the development console.
function reportMalformed(problem: string) {
  if (__DEV__) console.warn(problem);
}

/**
 * Reads `app_config` once the guest session exists. When there is no session (offline, or
 * sign-in refused) it throws, so the query errors and the app is shown; the next foreground
 * tries again.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const session = await startSession();
  if (session.status !== 'ok') throw new Error(`app_config: no session (${session.status})`);
  return parseAppConfig(await api.appConfig(), reportMalformed);
}

/** `app_config`, read at launch and on every return to the foreground (`watchAppConfig`). */
export function useAppConfig() {
  return useQuery({ queryKey: appConfigKey, queryFn: fetchAppConfig, retry: false });
}

/** Reads `app_config` again each time the app comes back to the foreground. */
export function watchAppConfig(client: QueryClient): NativeEventSubscription {
  return AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.refetchQueries({ queryKey: appConfigKey });
  });
}

/**
 * Whether this build is older than the platform's `min_app_version`. False while loading, when
 * the config can't be read, offline, or when the value is missing or malformed (decisions.md:
 * never block on a failed read). Data fetched earlier stays in the cache, so a read that fails
 * on a later foreground doesn't lift an update screen already showing.
 */
export function useUpdateRequired(): boolean {
  const { data } = useAppConfig();
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const minimum = data?.min_app_version?.[Platform.OS];
  if (minimum === undefined) return false;
  return isBelowMinimum(Application.nativeApplicationVersion ?? '', minimum);
}
