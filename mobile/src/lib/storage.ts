// The one handle on the on-device key-value store (expo-sqlite). Persisted Zustand stores
// and the encrypted session both use it. The web build has its own file, `storage.web.ts`,
// so expo-sqlite (and its wasm) stays out of the invite page's bundle.
import { Storage } from 'expo-sqlite/kv-store';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const storage: KeyValueStore = {
  getItem: (key) => Storage.getItemAsync(key),
  setItem: (key, value) => Storage.setItemAsync(key, value),
  removeItem: async (key) => {
    await Storage.removeItemAsync(key);
  },
};
