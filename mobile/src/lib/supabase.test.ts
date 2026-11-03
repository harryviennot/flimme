import { AppState } from 'react-native';

import { createApiClient } from './supabase';

jest.mock('./session-storage', () => ({
  sessionStorage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

const noStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

describe('one session per backend', () => {
  it('keeps the local and staging sessions under different storage keys', async () => {
    const local = createApiClient('http://127.0.0.1:54321', 'sb_publishable_test', noStorage);
    const staging = createApiClient('https://abcd.supabase.co', 'sb_publishable_test', noStorage);
    const keyOf = (client: typeof local) =>
      (client.auth as unknown as { storageKey: string }).storageKey;
    expect(keyOf(local)).not.toBe(keyOf(staging));
    await local.auth.stopAutoRefresh();
    await staging.auth.stopAutoRefresh();
  });
});

describe('the Supabase client', () => {
  it('reads the api schema', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createApiClient('http://127.0.0.1:54321', 'sb_publishable_test', noStorage);
    await client.from('app_config').select('key');

    const [, init] = fetchMock.mock.calls[0] as [
      unknown,
      { headers: Headers | Record<string, string> },
    ];
    const headers = new Headers(init.headers);
    expect(headers.get('Accept-Profile')).toBe('api');
    await client.auth.stopAutoRefresh();
  });

  it('never looks in the URL for a session', async () => {
    const client = createApiClient('http://127.0.0.1:54321', 'sb_publishable_test', noStorage);
    expect((client.auth as any).detectSessionInUrl).toBe(false);
    await client.auth.stopAutoRefresh();
  });

  it('registers one AppState listener that follows the app to the front and the back', () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: () => {} };
    });

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy of the module
      const fresh = require('./supabase') as typeof import('./supabase');
      const start = jest.spyOn(fresh.supabase.auth, 'startAutoRefresh').mockResolvedValue();
      const stop = jest.spyOn(fresh.supabase.auth, 'stopAutoRefresh').mockResolvedValue();

      // Loading the module registered it; asking again adds nothing.
      fresh.watchAppStateForAuth(fresh.supabase);
      fresh.watchAppStateForAuth(fresh.supabase);
      expect(listeners).toHaveLength(1);

      listeners[0]?.('active');
      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
      listeners[0]?.('background');
      expect(stop).toHaveBeenCalledTimes(1);
      listeners[0]?.('inactive');
      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(1);
    });

    spy.mockRestore();
  });
});
