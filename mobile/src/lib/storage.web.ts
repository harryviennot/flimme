// Web build (the invite page): the browser's own storage, no expo-sqlite.
import type { KeyValueStore } from './storage';

export type { KeyValueStore } from './storage';

function local(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const storage: KeyValueStore = {
  getItem: async (key) => local()?.getItem(key) ?? null,
  setItem: async (key, value) => {
    local()?.setItem(key, value);
  },
  removeItem: async (key) => {
    local()?.removeItem(key);
  },
  getItemSync: (key) => local()?.getItem(key) ?? null,
  setItemSync: (key, value) => {
    local()?.setItem(key, value);
  },
  removeItemSync: (key) => {
    local()?.removeItem(key);
  },
};
