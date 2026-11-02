// The one handle on the on-device key-value store (expo-sqlite). Persisted Zustand stores
// and the encrypted session both use it. The web build has its own file, `storage.web.ts`,
// so expo-sqlite (and its wasm) stays out of the invite page's bundle.
import { Storage } from 'expo-sqlite/kv-store';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  // Synchronous twins, so a persisted store has its values on the first render.
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): void;
};

export const storage: KeyValueStore = {
  getItem: (key) => Storage.getItemAsync(key),
  setItem: (key, value) => Storage.setItemAsync(key, value),
  removeItem: async (key) => {
    await Storage.removeItemAsync(key);
  },
  getItemSync: (key) => Storage.getItemSync(key),
  setItemSync: (key, value) => Storage.setItemSync(key, value),
  removeItemSync: (key) => {
    Storage.removeItemSync(key);
  },
};
