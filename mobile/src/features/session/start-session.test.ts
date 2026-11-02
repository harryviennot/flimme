import { createApiClient } from '@/lib/supabase';

import { startSessionWith } from './start-session';

// The real Supabase client, a fake network and a session store that survives "restarts".
const mockStore = new Map<string, string>();

jest.mock('@/lib/session-storage', () => ({
  sessionStorage: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => void mockStore.delete(k),
  },
}));

const URL = 'http://127.0.0.1:54321';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function guestSession(id: string) {
  return {
    access_token: 'a.b.c',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'r1',
    user: { id, aud: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {} },
  };
}

function newClient() {
  const { sessionStorage } = jest.requireMock('@/lib/session-storage');
  return createApiClient(URL, 'sb_publishable_test', sessionStorage);
}

let fetchMock: jest.Mock;

beforeEach(() => {
  mockStore.clear();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('startSessionWith', () => {
  it('signs in once as a guest when nothing is stored', async () => {
    fetchMock.mockResolvedValue(json(200, guestSession('guest-1')));
    const client = newClient();

    const answer = await startSessionWith(client);

    expect(answer).toEqual({ status: 'ok', userId: 'guest-1', isNew: true });
    const signUps = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/v1/signup'));
    expect(signUps).toHaveLength(1);
    await client.auth.stopAutoRefresh();
  });

  it('keeps the same guest after a restart without signing in again', async () => {
    fetchMock.mockResolvedValue(json(200, guestSession('guest-1')));
    const first = newClient();
    await startSessionWith(first);
    await first.auth.stopAutoRefresh();
    fetchMock.mockClear();

    // "Restart": a new client over the same stored session.
    const second = newClient();
    const answer = await startSessionWith(second);

    expect(answer).toEqual({ status: 'ok', userId: 'guest-1', isNew: false });
    expect(fetchMock).not.toHaveBeenCalled();
    await second.auth.stopAutoRefresh();
  });

  it('signs in as a new guest when the stored session cannot be read', async () => {
    mockStore.clear(); // what the encrypted storage leaves behind for an unreadable value
    fetchMock.mockResolvedValue(json(200, guestSession('guest-2')));
    const client = newClient();
    expect(await startSessionWith(client)).toEqual({
      status: 'ok',
      userId: 'guest-2',
      isNew: true,
    });
    await client.auth.stopAutoRefresh();
  });

  it('answers offline when there is no network, without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const client = newClient();
    expect(await startSessionWith(client)).toEqual({ status: 'offline' });
    await client.auth.stopAutoRefresh();
  });

  it('answers offline when Auth is down', async () => {
    fetchMock.mockResolvedValue(json(503, { message: 'unavailable' }));
    const client = newClient();
    expect(await startSessionWith(client)).toEqual({ status: 'offline' });
    await client.auth.stopAutoRefresh();
  });

  it('answers refused on the sign-in limit (429), without throwing', async () => {
    fetchMock.mockResolvedValue(
      json(429, { error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }),
    );
    const client = newClient();
    expect(await startSessionWith(client)).toEqual({ status: 'refused' });
    await client.auth.stopAutoRefresh();
  });

  it('answers refused when the bot check fails', async () => {
    fetchMock.mockResolvedValue(json(400, { error_code: 'captcha_failed', msg: 'captcha' }));
    const client = newClient();
    expect(await startSessionWith(client)).toEqual({ status: 'refused' });
    await client.auth.stopAutoRefresh();
  });

  it('lets a real error through (a misconfigured project is not a status)', async () => {
    fetchMock.mockResolvedValue(
      json(422, {
        error_code: 'anonymous_provider_disabled',
        msg: 'Anonymous sign-ins are disabled',
      }),
    );
    const client = newClient();
    await expect(startSessionWith(client)).rejects.toBeDefined();
    await client.auth.stopAutoRefresh();
  });
});
