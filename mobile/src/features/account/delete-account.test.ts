import { DELETE_ACCOUNT_ANSWERS } from '@flimme/contract';

import { runDeleteAccount, type DeleteDeps } from './delete-account';
import { postDeleteAccount } from './server';

function deps(answers: ('ok' | 'unauthorized' | 'try_again' | 'failed')[]): DeleteDeps {
  const queue = [...answers];
  return {
    getToken: jest.fn(async () => 'old'),
    refreshToken: jest.fn(async () => 'new'),
    call: jest.fn(async () => queue.shift() ?? 'failed'),
    wipe: jest.fn(async () => undefined),
    report: jest.fn(),
  };
}

describe('deleting the data', () => {
  it('wipes the phone once the server says ok', async () => {
    const d = deps(['ok']);
    expect(await runDeleteAccount(d)).toBe('done');
    expect(d.call).toHaveBeenCalledWith('old');
    expect(d.wipe).toHaveBeenCalledTimes(1);
  });

  it('wipes nothing on try_again or a failed call', async () => {
    for (const answer of ['try_again', 'failed'] as const) {
      const d = deps([answer]);
      expect(await runDeleteAccount(d)).toBe('try_again');
      expect(d.wipe).not.toHaveBeenCalled();
    }
  });

  it('refreshes the session once after unauthorized, then wipes on ok', async () => {
    const d = deps(['unauthorized', 'ok']);
    expect(await runDeleteAccount(d)).toBe('done');
    expect(d.refreshToken).toHaveBeenCalledTimes(1);
    expect(d.call).toHaveBeenNthCalledWith(2, 'new');
    expect(d.wipe).toHaveBeenCalledTimes(1);
  });

  it('shows the generic retry after a second unauthorized, and wipes nothing', async () => {
    const d = deps(['unauthorized', 'unauthorized']);
    expect(await runDeleteAccount(d)).toBe('try_again');
    expect(d.call).toHaveBeenCalledTimes(2);
    expect(d.wipe).not.toHaveBeenCalled();
  });

  it('asks to try again when no session can be had', async () => {
    const d = { ...deps([]), getToken: async () => null, refreshToken: async () => null };
    expect(await runDeleteAccount(d)).toBe('try_again');
    expect(d.call).not.toHaveBeenCalled();
  });
});

describe('the server call', () => {
  const answer = (status: number, body: unknown) =>
    jest.fn(async () => new Response(JSON.stringify(body), { status }));

  it('posts to the delete route with the bearer token and no body', async () => {
    const fetchImpl = answer(200, { status: 'ok' });
    const result = await postDeleteAccount({
      serverUrl: 'https://api.example.test/',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBe('ok');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/account/delete');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBeUndefined();
  });

  it('reads every answer of the contract', async () => {
    for (const status of DELETE_ACCOUNT_ANSWERS) {
      const code = status === 'ok' ? 200 : status === 'unauthorized' ? 401 : 503;
      const result = await postDeleteAccount({
        serverUrl: 'https://x.test',
        token: 't',
        fetchImpl: answer(code, { status }) as unknown as typeof fetch,
      });
      expect(result).toBe(status);
    }
  });

  it('fails on a dropped connection, a timeout and a body it cannot read', async () => {
    const options = { serverUrl: 'https://x.test', token: 't' };
    expect(
      await postDeleteAccount({
        ...options,
        fetchImpl: jest.fn(async () => {
          throw new TypeError('Network request failed');
        }) as unknown as typeof fetch,
      }),
    ).toBe('failed');
    expect(
      await postDeleteAccount({
        ...options,
        fetchImpl: answer(502, { status: 'bad_gateway' }) as unknown as typeof fetch,
      }),
    ).toBe('failed');
    expect(
      await postDeleteAccount({
        ...options,
        timeoutMs: 5,
        fetchImpl: ((_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })) as unknown as typeof fetch,
      }),
    ).toBe('failed');
  });
});
