import { ANALYTICS_CHOICES, type AnalyticsChoice } from '@flimme/contract';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// Haptics and sound each get a setting to turn them off (groundwork.md#motion-haptics-and-sound).
// The analytics choice (privacy.md#consents) is kept here first, so the switch never waits on the
// network; `analyticsSynced` is the last value the server confirmed (see analytics-sync.ts).
export type SettingsSaved = {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  analyticsChoice: AnalyticsChoice;
  analyticsSynced: AnalyticsChoice;
};

export type SettingsState = SettingsSaved & {
  setHapticsEnabled: (value: boolean) => void;
  setSoundEnabled: (value: boolean) => void;
  setAnalyticsChoice: (choice: AnalyticsChoice) => void;
  markAnalyticsSynced: (choice: AnalyticsChoice) => void;
};

export const SETTINGS_VERSION = 2;

export const settingsDefaults: SettingsSaved = {
  hapticsEnabled: true,
  soundEnabled: true,
  analyticsChoice: 'on',
  analyticsSynced: 'on',
};

function isChoice(value: unknown): value is AnalyticsChoice {
  return (ANALYTICS_CHOICES as readonly unknown[]).includes(value);
}

/** What an older version saved, read into today's shape. Unknown or missing values fall back. */
export function migrateSettings(saved: unknown): SettingsSaved {
  const old = (saved ?? {}) as Partial<Record<keyof SettingsSaved, unknown>>;
  return {
    hapticsEnabled:
      typeof old.hapticsEnabled === 'boolean'
        ? old.hapticsEnabled
        : settingsDefaults.hapticsEnabled,
    soundEnabled:
      typeof old.soundEnabled === 'boolean' ? old.soundEnabled : settingsDefaults.soundEnabled,
    analyticsChoice: isChoice(old.analyticsChoice)
      ? old.analyticsChoice
      : settingsDefaults.analyticsChoice,
    analyticsSynced: isChoice(old.analyticsSynced)
      ? old.analyticsSynced
      : settingsDefaults.analyticsSynced,
  };
}

export function createSettingsStore(kv?: KeyValueStore, version = SETTINGS_VERSION) {
  return create<SettingsState>()(
    persist(
      (set) => ({
        ...settingsDefaults,
        setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
        setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
        setAnalyticsChoice: (analyticsChoice) => set({ analyticsChoice }),
        markAnalyticsSynced: (analyticsSynced) => set({ analyticsSynced }),
      }),
      persistOptions<SettingsState, SettingsSaved>({
        name: 'settings',
        version,
        migrate: migrateSettings,
        sanitize: migrateSettings,
        partialize: ({ hapticsEnabled, soundEnabled, analyticsChoice, analyticsSynced }) => ({
          hapticsEnabled,
          soundEnabled,
          analyticsChoice,
          analyticsSynced,
        }),
        kv,
      }),
    ),
  );
}

type SettingsStore = ReturnType<typeof createSettingsStore>;

/** Pushes the switches into haptics and sound now (hydration) and on every change. */
export function bindSettings(
  store: SettingsStore,
  setters: { haptics: (value: boolean) => void; sound: (value: boolean) => void },
) {
  const apply = (state: SettingsSaved) => {
    setters.haptics(state.hapticsEnabled);
    setters.sound(state.soundEnabled);
  };
  apply(store.getState());
  return store.subscribe(apply);
}
