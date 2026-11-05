import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { track, type EventProps } from './analytics';
import { screenPattern } from './screen-pattern';

/**
 * `error:view`, once each time `code` appears (null: nothing is shown), with the route pattern of
 * the screen it shows on, never its path. For an error screen or a banner.
 */
export function useTrackErrorView(code: EventProps<'error:view'>['code'] | null): void {
  const screen = screenPattern(useSegments() as string[]) ?? '/';
  useEffect(() => {
    if (code) track('error:view', { code, screen });
  }, [code, screen]);
}
