import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// Haptics and sound each get a setting to turn them off (groundwork.md#motion-haptics-and-sound).
export type SettingsSaved = { hapticsEnabled: boolean; soundEnabled: boolean };

export type SettingsState = SettingsSaved & {
  setHapticsEnabled: (value: boolean) => void;
  setSoundEnabled: (value: boolean) => void;
};

export const SETTINGS_VERSION = 1;

export const settingsDefaults: SettingsSaved = { hapticsEnabled: true, soundEnabled: true };

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
  };
}

export function createSettingsStore(kv?: KeyValueStore, version = SETTINGS_VERSION) {
  return create<SettingsState>()(
    persist(
      (set) => ({
        ...settingsDefaults,
        setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
        setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      }),
      persistOptions<SettingsState, SettingsSaved>({
        name: 'settings',
        version,
        migrate: migrateSettings,
        sanitize: migrateSettings,
        partialize: ({ hapticsEnabled, soundEnabled }) => ({ hapticsEnabled, soundEnabled }),
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
