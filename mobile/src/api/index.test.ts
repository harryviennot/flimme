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
});
