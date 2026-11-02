import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

import { storage, type KeyValueStore } from './storage';

// The convention for every persisted Zustand store (app-structure.md#where-state-lives):
// `persist` over the on-device key-value store, `name: 'flimme.<store>'`, a `version` and a
// `migrate` function. Reads are synchronous, so the first render already has the values.
// Only the card stack and session/UI stores stay in memory.
export type PersistedStoreConfig<State, Saved = State> = {
  /** Without the prefix: `settings` is stored as `flimme.settings`. */
  name: string;
  version: number;
  /** Turns what an older version saved into the current shape. */
  migrate: (saved: unknown, fromVersion: number) => Saved;
  /** Which part of the state is saved. Defaults to all of it. */
  partialize?: (state: State) => Saved;
  /** Tests pass their own; the app uses the SQLite store. */
  kv?: KeyValueStore;
};

export function persistOptions<State, Saved = State>({
  name,
  version,
  migrate,
  partialize,
  kv = storage,
}: PersistedStoreConfig<State, Saved>): PersistOptions<State, Saved> {
  return {
    name: `flimme.${name}`,
    version,
    storage: createJSONStorage<Saved>(() => ({
      getItem: (key) => kv.getItemSync(key),
      setItem: (key, value) => kv.setItemSync(key, value),
      removeItem: (key) => kv.removeItemSync(key),
    })),
    partialize: partialize ?? ((state) => state as unknown as Saved),
    migrate: (saved, fromVersion) => migrate(saved, fromVersion),
  };
}
