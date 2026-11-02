import { ApiError } from '@flimme/contract';

import { supabase } from '@/lib/supabase';

import { api } from './index';

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
});
