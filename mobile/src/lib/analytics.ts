import type { AnalyticsChoice } from '@flimme/contract';

import { ANALYTICS_HOST, createAnalytics, type AnalyticsDeps, type Client } from './analytics-core';
import { getAnalyticsKey } from './config';
import { storage } from './storage';

export {
  ANALYTICS_EVENTS,
  ANALYTICS_HOST,
  INSTALL_ID_MONTHS,
  KIDS_AGE,
  createAnalytics,
  type AnalyticsEvent,
  type AnalyticsProps,
  type LogEntry,
  type RoomCap,
} from './analytics-core';
export { isStrictFor, isStrictRegion, resolveMode, type AnalyticsMode } from './analytics-region';

// The PostHog client, built when the first event could leave: its module is only loaded then.
function createPostHog(key: string, personProfiles: 'never' | 'identified_only'): Client {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
  return new PostHog(key, {
    host: ANALYTICS_HOST,
    personProfiles,
    // Nothing the screens did not ask for: no lifecycle events, replay, flags, surveys or crashes.
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableSurveys: true,
    errorTracking: { autocapture: false },
    disableGeoip: true,
    // Sent at once, so an event is never waiting on the phone when a capped room opens.
    flushAt: 1,
  }) as unknown as Client;
}

const deps: AnalyticsDeps = {
  key: getAnalyticsKey(),
  createClient: createPostHog,
  store: {
    get: (key) => storage.getItemSync(key),
    set: (key, value) => storage.setItemSync(key, value),
    remove: (key) => storage.removeItemSync(key),
  },
  now: () => Date.now(),
  dev: __DEV__,
};

export const analytics = createAnalytics(deps);

export const track = analytics.track;
export const screen = analytics.screen;
export const setRoomCap = analytics.setRoomCap;
export const clearRoomCap = analytics.clearRoomCap;
export const applyChoice: (choice: AnalyticsChoice) => void = analytics.applyChoice;
export const configure = analytics.configure;
export const forget = analytics.forget;
