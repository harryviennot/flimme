import type { KeyValueStore } from '@/lib/storage';

import { createPendingSaves, readSavedSaves } from './pending';

function memoryKv(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
    getItemSync: (k) => data.get(k) ?? null,
    setItemSync: (k, v) => void data.set(k, v),
    removeItemSync: (k) => void data.delete(k),
  };
}

describe('pending saves', () => {
  it('keeps the last wish for a film, in the order films were first asked', () => {
    const store = createPendingSaves(memoryKv());
    store.getState().put(1, true);
    store.getState().put(2, true);
    store.getState().put(1, false);
    expect(store.getState().items).toEqual([
      { title_id: 1, saved: false },
      { title_id: 2, saved: true },
    ]);
  });

  it('removes a wish only if it is still the same one', () => {
    const store = createPendingSaves(memoryKv());
    store.getState().put(1, true);
    const sent = store.getState().items[0]!;
    store.getState().put(1, false);
    store.getState().settle(sent);
    expect(store.getState().items).toEqual([{ title_id: 1, saved: false }]);
    store.getState().settle(store.getState().items[0]!);
    expect(store.getState().items).toEqual([]);
  });

  it('survives a restart', () => {
    const kv = memoryKv();
    createPendingSaves(kv).getState().put(7, true);
    expect(createPendingSaves(kv).getState().items).toEqual([{ title_id: 7, saved: true }]);
  });

  it('reads anything but well-formed items as nothing', () => {
    expect(readSavedSaves(null)).toEqual({ items: [] });
    expect(readSavedSaves({ items: 'x' })).toEqual({ items: [] });
    expect(
      readSavedSaves({
        items: [{ title_id: 3, saved: true }, { title_id: 'a', saved: true }, { saved: false }, 4],
      }),
    ).toEqual({ items: [{ title_id: 3, saved: true }] });
  });
});
