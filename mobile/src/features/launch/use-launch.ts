import { ApiError } from '@flimme/contract';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnline } from '@/features/network';
import { useDeviceSync, useMyProfile } from '@/features/profile';
import { startSession, useSession, useSessionFailed } from '@/features/session';

import { launchStep, type LaunchStep, type ProfileRead } from './launch-step';

/** After this long the splash says it is still working (splash.md, a starting value). */
export const SLOW_AFTER_MS = 3000;

/**
 * Everything the splash decides: waits for the session and the profile, saves the device's
 * language and country on the side, and answers where to go or what to show. `retry` starts
 * again; it also runs by itself when the connection comes back while the offline state shows.
 */
export function useLaunch(): { step: LaunchStep; retry: () => void } {
  const session = useSession();
  const sessionFailed = useSessionFailed();
  const online = useOnline();
  const [slow, setSlow] = useState(false);

  const query = useMyProfile(session?.status === 'ok');
  const { data, error, refetch } = query;

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useDeviceSync(data, query.dataUpdatedAt > 0 && !query.isError);

  let profile: ProfileRead = { state: 'pending' };
  if (data !== undefined) profile = { state: 'ready', profile: data };
  else if (query.isError) {
    profile = { state: 'failed', network: error instanceof ApiError && error.kind === 'network' };
  }

  const step = launchStep({ session, sessionFailed, profile, online, slow });

  const retry = useCallback(() => {
    // A real error is reported inside startSession and kept for the state above.
    startSession().catch(() => {});
    if (session?.status === 'ok') void refetch();
  }, [session, refetch]);

  const wasOnline = useRef(online);
  const offlineShown = 'show' in step && step.show === 'offline';
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameBack && offlineShown) retry();
  }, [online, offlineShown, retry]);

  return { step, retry };
}
