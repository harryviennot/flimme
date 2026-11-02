// Crash reports (app-structure.md#analytics-and-crash-reports). Errors only: no performance
// tracing, no console breadcrumbs (decisions.md). No user, ever: nothing here or anywhere in the
// app calls `setUser`, and a test keeps it that way (privacy.md#crash-reports).
import * as Sentry from '@sentry/react-native';

import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';
import { variant } from './variant';

type Env = Record<string, string | undefined>;

/**
 * Sentry's options for one build. Without a DSN (development builds have none) the SDK is
 * disabled and sends nothing.
 */
export function sentryOptions(env: Env, build: string): Sentry.ReactNativeOptions {
  const dsn = env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  return {
    dsn: dsn || undefined,
    enabled: Boolean(dsn),
    environment: build,
    sendDefaultPii: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: (event) => scrubEvent(event),
  };
}

let started = false;

/** Starts the SDK once, at the top of the root layout. */
export function initSentry(): void {
  if (started) return;
  started = true;
  // Expo inlines EXPO_PUBLIC_* only when written out in full.
  Sentry.init(
    sentryOptions({ EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN }, variant()),
  );
}

/** Sends a real error (never an answer) to Sentry. A no-op while the SDK is disabled. */
export function reportError(error: unknown): void {
  Sentry.captureException(error);
}

/** Wraps the root component so Sentry sees what React and the native side throw. */
export const wrapRoot = Sentry.wrap;
