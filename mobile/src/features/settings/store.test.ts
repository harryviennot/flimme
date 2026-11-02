import { haptics, setHapticsEnabled } from '@/lib/haptics';
import type { KeyValueStore } from '@/lib/storage';

import { bindSettings, createSettingsStore } from './store';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

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

describe('settings store', () => {
  it('brings the values back when the store is recreated over the same kv store', () => {
    const kv = memoryKv();
    const first = createSettingsStore(kv);
    first.getState().setHapticsEnabled(false);
    first.getState().setSoundEnabled(false);

    const second = createSettingsStore(kv);
    expect(second.getState().hapticsEnabled).toBe(false);
    expect(second.getState().soundEnabled).toBe(false);
    expect(kv.getItemSync('flimme.settings')).not.toBeNull();
  });

  it('starts with both on', () => {
    const store = createSettingsStore(memoryKv());
    expect(store.getState().hapticsEnabled).toBe(true);
    expect(store.getState().soundEnabled).toBe(true);
  });

  it('keeps the values across a version bump', () => {
    const kv = memoryKv();
    createSettingsStore(kv, 1).getState().setHapticsEnabled(false);

    const bumped = createSettingsStore(kv, 2);
    expect(bumped.getState().hapticsEnabled).toBe(false);
    expect(bumped.getState().soundEnabled).toBe(true);
  });

  it('survives a corrupted saved value', () => {
    const kv = memoryKv();
    kv.setItemSync('flimme.settings', '{not json');
    expect(createSettingsStore(kv).getState().hapticsEnabled).toBe(true);
  });

  it('ignores a saved value of the wrong type, even at the current version', () => {
    const kv = memoryKv();
    kv.setItemSync('flimme.settings', '{"state":{"hapticsEnabled":"false"},"version":1}');
    expect(createSettingsStore(kv).getState().hapticsEnabled).toBe(true);
  });

  it('works in memory when the kv store throws', () => {
    const broken: KeyValueStore = {
      ...memoryKv(),
      getItemSync: () => {
        throw new Error('disk');
      },
      setItemSync: () => {
        throw new Error('disk');
      },
    };
    const store = createSettingsStore(broken);
    expect(() => store.getState().setHapticsEnabled(false)).not.toThrow();
    expect(store.getState().hapticsEnabled).toBe(false);
  });

  it('pushes the saved values and every change to the setters', () => {
    const kv = memoryKv();
    createSettingsStore(kv).getState().setSoundEnabled(false);

    const store = createSettingsStore(kv);
    const setters = { haptics: jest.fn(), sound: jest.fn() };
    bindSettings(store, setters);
    expect(setters.haptics).toHaveBeenLastCalledWith(true);
    expect(setters.sound).toHaveBeenLastCalledWith(false);

    store.getState().setHapticsEnabled(false);
    expect(setters.haptics).toHaveBeenLastCalledWith(false);
  });
});

describe('haptics switch', () => {
  afterEach(() => setHapticsEnabled(true));

  it('does not call expo-haptics when haptics are off', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the mock above
    const Haptics = require('expo-haptics') as { impactAsync: jest.Mock };
    Haptics.impactAsync.mockClear();

    setHapticsEnabled(false);
    haptics.press();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    setHapticsEnabled(true);
    haptics.press();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});
