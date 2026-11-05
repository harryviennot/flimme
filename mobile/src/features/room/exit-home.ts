import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { releaseRoomGuards } from './leave-guard';

type NavRoute = { name: string; state?: { routes?: readonly NavRoute[] } };

/**
 * How a room screen goes Home without leaving two Homes in the root stack:
 * - `dismissTo`: the root stack already has Home under the room (the player came from Home
 *   through host setup, the code screen or the join sheet), so go back to it.
 * - `replace`: no Home is open (a cold start from a link, or the splash rejoining the kept
 *   room), so the room gives way to Home.
 * `dismissAll` is not enough: called inside the room's own stack it never reaches the root stack.
 */
export type HomeExit = 'dismissTo' | 'replace';

function hasHome(routes: readonly NavRoute[]): boolean {
  return routes.some(
    (route) =>
      route.name === '(tabs)' || route.name === 'play' || hasHome(route.state?.routes ?? []),
  );
}

export function homeExit(routes: readonly NavRoute[]): HomeExit {
  return hasHome(routes) ? 'dismissTo' : 'replace';
}

/** Takes the phone from a room screen to Home, once, with exactly one Home in the stack. */
export function useExitRoomToHome(target: '/play' | '/my-films' = '/play'): () => void {
  const state = useRootNavigationState();
  // Read when the call is made: a leave can outlive renders.
  const routes = useRef<readonly NavRoute[]>([]);
  useEffect(() => {
    routes.current = (state?.routes ?? []) as readonly NavRoute[];
  }, [state]);
  // Two screens can ask at once (Leave, then the room layout seeing the seat is gone): the
  // second finds the phone already on Home and does nothing, so Home is never replaced by Home.
  const pathname = usePathname();
  const onHome = useRef(false);
  useEffect(() => {
    onHome.current = pathname === target;
  }, [pathname, target]);
  return useCallback(() => {
    if (onHome.current) return;
    // Going Home is a way out the player chose (Leave) or was forced into: no confirm.
    releaseRoomGuards();
    if (homeExit(routes.current) === 'dismissTo') router.dismissTo(target);
    else router.replace(target);
    onHome.current = true;
  }, [target]);
}
