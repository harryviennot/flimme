import type { SetAnalyticsChoiceResult } from '@flimme/contract';

import type { KeyValueStore } from '@/lib/storage';

import { ANALYTICS_WORDING_VERSION, createAnalyticsSync } from './analytics-sync';
import { createSettingsStore } from './store';

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

const ok = (choice: 'on' | 'off' | 'detailed'): SetAnalyticsChoiceResult => ({
  status: 'ok',
  choice,
});

describe('the analytics choice', () => {
  it('starts on, and sends nothing while the server already agrees', async () => {
    const store = createSettingsStore(memoryKv());
    const send = jest.fn();
    await createAnalyticsSync({ store, send, report: jest.fn() }).sync();
    expect(store.getState().analyticsChoice).toBe('on');
    expect(send).not.toHaveBeenCalled();
  });

  it('is saved first, then sent with the wording version', async () => {
    const store = createSettingsStore(memoryKv());
    const send = jest.fn(async () => ok('off'));
    store.getState().setAnalyticsChoice('off');
    expect(store.getState().analyticsChoice).toBe('off');
    await createAnalyticsSync({ store, send, report: jest.fn() }).sync();
    expect(send).toHaveBeenCalledWith({ choice: 'off', version: ANALYTICS_WORDING_VERSION });
    expect(store.getState().analyticsSynced).toBe('off');
  });

  it('is sent again at the next launch when the call failed', async () => {
    const kv = memoryKv();
    const first = createSettingsStore(kv);
    first.getState().setAnalyticsChoice('off');
    const failing = jest.fn(async () => {
      throw new Error('offline');
    });
    await createAnalyticsSync({ store: first, send: failing, report: jest.fn() }).sync();
    expect(first.getState().analyticsChoice).toBe('off');

    const relaunched = createSettingsStore(kv);
    const send = jest.fn(async () => ok('off'));
    await createAnalyticsSync({ store: relaunched, send, report: jest.fn() }).sync();
    expect(send).toHaveBeenCalledTimes(1);
    expect(relaunched.getState().analyticsSynced).toBe('off');
  });

  it('keeps the phone value on rate_limited and reports invalid with the answer only', async () => {
    const store = createSettingsStore(memoryKv());
    store.getState().setAnalyticsChoice('off');
    const report = jest.fn();
    await createAnalyticsSync({
      store,
      send: async () => ({ status: 'rate_limited' }),
      report,
    }).sync();
    expect(store.getState().analyticsChoice).toBe('off');
    expect(report).not.toHaveBeenCalled();

    await createAnalyticsSync({ store, send: async () => ({ status: 'invalid' }), report }).sync();
    expect(report).toHaveBeenCalledWith(new Error('set_analytics_choice: invalid'));
    expect(store.getState().analyticsChoice).toBe('off');
  });

  it('sends the latest value after quick taps, one call at a time', async () => {
    const store = createSettingsStore(memoryKv());
    const resolvers: (() => void)[] = [];
    const send = jest.fn(
      ({ choice }: { choice: 'on' | 'off' | 'detailed' }) =>
        new Promise<SetAnalyticsChoiceResult>((resolve) => {
          resolvers.push(() => resolve(ok(choice)));
        }),
    );
    const sync = createAnalyticsSync({ store, send, report: jest.fn() });
    store.getState().setAnalyticsChoice('off');
    const done = sync.sync();
    store.getState().setAnalyticsChoice('on');
    void sync.sync();
    store.getState().setAnalyticsChoice('detailed');
    resolvers[0]?.();
    await new Promise((r) => setImmediate(r));
    resolvers[1]?.();
    await done;
    expect(send.mock.calls.map(([a]) => a.choice)).toEqual(['off', 'detailed']);
    expect(store.getState().analyticsSynced).toBe('detailed');
  });

  it('reads an unknown saved choice as on, and keeps older saves', () => {
    const kv = memoryKv();
    kv.setItemSync(
      'flimme.settings',
      '{"state":{"hapticsEnabled":false,"analyticsChoice":"maybe"},"version":1}',
    );
    const store = createSettingsStore(kv);
    expect(store.getState().hapticsEnabled).toBe(false);
    expect(store.getState().analyticsChoice).toBe('on');
  });
});
