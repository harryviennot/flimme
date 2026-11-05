import { useSyncExternalStore } from 'react';

import { analytics, type AnalyticsMode, type LogEntry } from '@/lib/analytics';

/** The dev menu's analytics log (development builds record it) and the mode now running. */
export function useAnalyticsLog(): { entries: LogEntry[]; mode: AnalyticsMode } {
  return useSyncExternalStore(analytics.subscribe, analytics.getSnapshot);
}
