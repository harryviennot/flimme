import type { KeyValueStore } from '@/lib/storage';

import { createKeptRoomStore, readKeptRoom } from './kept-room';

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

describe('the kept room', () => {
  it('survives a restart', () => {
    const kv = memoryKv();
    createKeptRoomStore(kv).getState().keep({ id: 'r1', code: '482913' });
    expect(createKeptRoomStore(kv).getState().room).toEqual({ id: 'r1', code: '482913' });
  });

  it('reads a malformed saved value as no room', () => {
    for (const bad of [
      '{"state":{"room":{"id":1}},"version":1}',
      '{"state":{"room":"x"},"version":1}',
      '{"state":null,"version":1}',
      'not json',
    ]) {
      const kv = memoryKv({ 'flimme.room': bad });
      expect(createKeptRoomStore(kv).getState().room).toBeNull();
    }
    expect(readKeptRoom(undefined)).toEqual({ room: null });
  });

  it('forgets everything, or only the room it is asked about', () => {
    const store = createKeptRoomStore(memoryKv());
    store.getState().keep({ id: 'r1', code: '482913' });
    store.getState().forget('other');
    expect(store.getState().room).toEqual({ id: 'r1', code: '482913' });
    store.getState().forget('r1');
    expect(store.getState().room).toBeNull();
    store.getState().keep({ id: 'r2', code: '111111' });
    store.getState().forget();
    expect(store.getState().room).toBeNull();
  });
});
