import { api } from '@/api';

import { keptRoomStore } from './kept-room';
import { leaveRoom } from './leave';

jest.mock('@/api', () => ({ api: { leaveRoom: jest.fn() } }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

const leave = api.leaveRoom as jest.Mock;

beforeEach(() => {
  keptRoomStore.getState().keep({ id: 'r1', code: '482913' });
});

describe('leaveRoom', () => {
  it.each(['ok', 'not_in_room'])('forgets the kept room on %s', async (status) => {
    leave.mockResolvedValueOnce({ status });
    await expect(leaveRoom('r1')).resolves.toEqual({ status });
    expect(keptRoomStore.getState().room).toBeNull();
  });

  it('rethrows a failed call and keeps the room', async () => {
    leave.mockRejectedValueOnce(new Error('network'));
    await expect(leaveRoom('r1')).rejects.toThrow('network');
    expect(keptRoomStore.getState().room).toEqual({ id: 'r1', code: '482913' });
  });
});
