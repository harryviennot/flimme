import { ApiError } from '@flimme/contract';

import { reportError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

import { api } from './index';

jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const rpc = supabase.rpc as unknown as jest.Mock;

describe('the app api', () => {
  it('calls the one client', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null, status: 200 });
    await expect(api.joinRoom({ code: '000000' })).resolves.toEqual({ status: 'not_found' });
    expect(rpc).toHaveBeenCalledWith('join_room', { p_code: '000000' });
  });

  it('rejects a bug as an ApiError', async () => {
    rpc.mockResolvedValue({ data: { status: 'teapot' }, error: null, status: 200 });
    await expect(api.joinRoom({ code: '000000' })).rejects.toBeInstanceOf(ApiError);
  });

  it('reports denied and unexpected errors to Sentry, not network ones, and rethrows', async () => {
    (reportError as jest.Mock).mockClear();
    rpc.mockResolvedValue({ data: { status: 'teapot' }, error: null, status: 200 });
    await expect(api.joinRoom({ code: '000000' })).rejects.toBeInstanceOf(ApiError);
    expect(reportError).toHaveBeenCalledTimes(1);

    (reportError as jest.Mock).mockClear();
    rpc.mockRejectedValue(new Error('offline'));
    await expect(api.joinRoom({ code: '000000' })).rejects.toMatchObject({ kind: 'network' });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports a failed people search without its text, its database message or its cause', async () => {
    (reportError as jest.Mock).mockClear();
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'bad input "penelope cruz"', code: 'XX000', details: 'penelope cruz' },
      status: 500,
    });
    await expect(api.searchPeople({ query: 'penelope cruz' })).rejects.toBeInstanceOf(ApiError);
    expect(reportError).toHaveBeenCalledTimes(1);
    const reported = (reportError as jest.Mock).mock.calls[0][0] as ApiError;
    expect(reported).toBeInstanceOf(ApiError);
    expect(reported.kind).toBe('unexpected');
    expect(reported.code).toBe('XX000');
    expect(reported.cause).toBeUndefined();
    expect(JSON.stringify([reported.message, reported.stack])).not.toMatch(/penelope/i);
  });

  it('posts the search term through the call, never in a URL', async () => {
    rpc.mockResolvedValue({ data: { status: 'ok', people: [] }, error: null, status: 200 });
    await api.searchPeople({ query: 'pitt', language: 'fr' });
    expect(rpc).toHaveBeenLastCalledWith('search_people', { p_query: 'pitt', p_language: 'fr' });
  });
});
