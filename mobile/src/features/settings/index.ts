import type { AnalyticsChoice } from '@flimme/contract';
import { useEffect } from 'react';

import { api } from '@/api';
import { setHapticsEnabled } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';
import { setSoundEnabled } from '@/lib/sound';

import { createAnalyticsSync } from './analytics-sync';
import { bindSettings, createSettingsStore } from './store';

export const useSettingsStore = createSettingsStore();

// Hydration is synchronous, so haptics and sound have the saved values before anything
// renders. Importing this module once at the root is what turns the switches on.
bindSettings(useSettingsStore, { haptics: setHapticsEnabled, sound: setSoundEnabled });

export const analyticsSync = createAnalyticsSync({
  store: useSettingsStore,
  send: (args) => api.setAnalyticsChoice(args),
  report: reportError,
});

/** Sends an analytics choice the server has not confirmed yet, once per launch (settings.md). */
export function useAnalyticsSyncOnLaunch(enabled: boolean): void {
  useEffect(() => {
    if (enabled) void analyticsSync.sync();
  }, [enabled]);
}

/** The stored analytics choice. Named hooks, never the store called in a component (React Compiler). */
export function useAnalyticsChoice(): AnalyticsChoice {
  return useSettingsStore((state) => state.analyticsChoice);
}

/** Saves the choice on the phone at once, then sends it in the background. */
export function chooseAnalytics(choice: AnalyticsChoice): void {
  useSettingsStore.getState().setAnalyticsChoice(choice);
  void analyticsSync.sync();
}

export function useHapticsEnabled(): boolean {
  return useSettingsStore((state) => state.hapticsEnabled);
}

export function useSoundEnabled(): boolean {
  return useSettingsStore((state) => state.soundEnabled);
}
