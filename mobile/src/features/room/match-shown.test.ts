import type { KeyValueStore } from '@/lib/storage';

import { createMatchShownStore, MATCH_SHOWN_KEEP, readMatchShown } from './match-shown';

function memoryKv(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItemSync: (key: string) => data[key] ?? null,
    setItemSync: (key: string, value: string) => {
      data[key] = value;
    },
    removeItemSync: (key: string) => {
      delete data[key];
    },
  } as KeyValueStore;
}

describe('the rooms whose match overlay played', () => {
  it('survives a restart', () => {
    const kv = memoryKv();
    createMatchShownStore(kv).getState().mark('r1');
    expect(createMatchShownStore(kv).getState().has('r1')).toBe(true);
    expect(createMatchShownStore(kv).getState().has('r2')).toBe(false);
  });

  it('marking a room twice keeps one entry', () => {
    const store = createMatchShownStore(memoryKv());
    store.getState().mark('r1');
    store.getState().mark('r1');
    expect(store.getState().rooms).toEqual(['r1']);
  });

  it('keeps only the last 20 rooms', () => {
    const store = createMatchShownStore(memoryKv());
    for (let i = 0; i < MATCH_SHOWN_KEEP + 5; i++) store.getState().mark(`r${i}`);
    expect(store.getState().rooms).toHaveLength(MATCH_SHOWN_KEEP);
    expect(store.getState().has('r0')).toBe(false);
    expect(store.getState().has(`r${MATCH_SHOWN_KEEP + 4}`)).toBe(true);
  });

  it('reads a malformed saved value as no rooms', () => {
    for (const bad of [
      '{"state":{"rooms":"x"},"version":1}',
      '{"state":null,"version":1}',
      'not json',
    ]) {
      const kv = memoryKv({ 'flimme.match-shown': bad });
      expect(createMatchShownStore(kv).getState().rooms).toEqual([]);
    }
    expect(readMatchShown({ rooms: ['a', 1, '', 'b'] })).toEqual({ rooms: ['a', 'b'] });
    expect(readMatchShown(undefined)).toEqual({ rooms: [] });
  });
});
