import type { KeyValueStore } from '@/lib/storage';

import { createDevStore } from './store';

function memoryKv(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
    getItemSync: (k) => map.get(k) ?? null,
    setItemSync: (k, v) => void map.set(k, v),
    removeItemSync: (k) => void map.delete(k),
  };
}

describe('dev store', () => {
  it('starts on the local backend', () => {
    expect(createDevStore(memoryKv()).getState().backend).toBe('local');
  });

  it('brings the choice back when recreated over the same kv store', () => {
    const kv = memoryKv();
    createDevStore(kv).getState().setBackend('staging');
    expect(createDevStore(kv).getState().backend).toBe('staging');
    expect(kv.getItemSync('flimme.dev')).not.toBeNull();
  });

  it('reads an unknown saved value as local', () => {
    const kv = memoryKv();
    kv.setItemSync('flimme.dev', JSON.stringify({ state: { backend: 'moon' }, version: 1 }));
    expect(createDevStore(kv).getState().backend).toBe('local');
  });
});
