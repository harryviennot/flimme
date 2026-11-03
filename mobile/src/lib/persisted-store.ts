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
  /** Which part of the state is saved: never the actions. */
  partialize: (state: State) => Saved;
  /** Reads saved values into the state on every start, so a wrong value never gets in. */
  sanitize?: (saved: unknown) => Partial<State>;
  /** Tests pass their own; the app uses the SQLite store. */
  kv?: KeyValueStore;
};

export function persistOptions<State, Saved = State>({
  name,
  version,
  migrate,
  partialize,
  sanitize,
  kv = storage,
}: PersistedStoreConfig<State, Saved>): PersistOptions<State, Saved> {
  return {
    name: `flimme.${name}`,
    version,
    // A storage failure (a full disk, private browsing) must not crash the app or a tap:
    // the store then works in memory for this run.
    storage: createJSONStorage<Saved>(() => ({
      getItem: (key) => attempt(() => kv.getItemSync(key), null),
      setItem: (key, value) => attempt(() => kv.setItemSync(key, value), undefined),
      removeItem: (key) => attempt(() => kv.removeItemSync(key), undefined),
    })),
    partialize,
    ...(sanitize && {
      merge: (saved, current) => ({ ...current, ...sanitize(saved) }),
    }),
    migrate: (saved, fromVersion) => migrate(saved, fromVersion),
  };
}

function attempt<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}
