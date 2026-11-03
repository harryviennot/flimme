import { api } from '@/api';
import { keptRoomStore } from '@/features/room/kept-room';

import { leaveOldSeat } from './old-seat';

jest.mock('@/api', () => ({ api: { leaveRoom: jest.fn() } }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

const leave = api.leaveRoom as jest.Mock;

beforeEach(() => {
  leave.mockReset().mockResolvedValue({ status: 'ok' });
  keptRoomStore.getState().keep({ id: 'A', code: '482913' });
});

describe('leaveOldSeat', () => {
  it('leaves the kept room once when another room answered ok', () => {
    leaveOldSeat('B');
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledWith({ room_id: 'A' });
  });

  it('leaves nothing for the same room (a rejoin)', () => {
    leaveOldSeat('A');
    expect(leave).not.toHaveBeenCalled();
  });

  it('leaves nothing when no room is kept', () => {
    keptRoomStore.getState().forget();
    leaveOldSeat('B');
    expect(leave).not.toHaveBeenCalled();
  });

  it('swallows a failed call and never retries', async () => {
    leave.mockRejectedValue(new Error('down'));
    expect(() => leaveOldSeat('B')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does not clear a newer room kept meanwhile', async () => {
    leaveOldSeat('B');
    keptRoomStore.getState().keep({ id: 'B', code: '111111' });
    await Promise.resolve();
    await Promise.resolve();
    expect(keptRoomStore.getState().room).toEqual({ id: 'B', code: '111111' });
  });
});
