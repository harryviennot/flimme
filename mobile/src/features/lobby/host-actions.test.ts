import { ApiError, REMOVE_MEMBER_ANSWERS, SET_ROOM_LOCKED_ANSWERS } from '@flimme/contract';

import { LOCK_OUTCOMES, REMOVE_OUTCOMES, runRemove, runSetLocked } from './host-actions';

describe('runRemove', () => {
  it('has a behaviour for every answer of remove_member', async () => {
    for (const status of REMOVE_MEMBER_ANSWERS) {
      expect(REMOVE_OUTCOMES[status]).toBeDefined();
      const call = jest.fn(async () => ({ status }));
      await expect(runRemove(call, { roomId: 'r1', memberId: 'm2' })).resolves.toEqual(
        REMOVE_OUTCOMES[status],
      );
    }
  });

  it.each([
    ['ok', 'seats'],
    ['not_in_room', 'seats'],
    ['closed', 'room'],
  ] as const)('turns %s into %s', async (status, kind) => {
    const call = jest.fn(async () => ({ status }));
    await expect(runRemove(call, { roomId: 'r1', memberId: 'm2' })).resolves.toEqual({ kind });
  });

  it('sends the room and the seat once', async () => {
    const call = jest.fn(async () => ({ status: 'ok' as const }));
    await runRemove(call, { roomId: 'r1', memberId: 'm2' });
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith({ room_id: 'r1', member_id: 'm2' });
  });

  it('turns a thrown call into failed', async () => {
    const call = jest.fn(async () => {
      throw new ApiError('network', 'remove_member', 'offline');
    });
    await expect(runRemove(call, { roomId: 'r1', memberId: 'm2' })).resolves.toEqual({
      kind: 'failed',
    });
  });
});

describe('runSetLocked', () => {
  it('has a behaviour for every answer of set_room_locked', () => {
    for (const status of SET_ROOM_LOCKED_ANSWERS) {
      expect(LOCK_OUTCOMES[status]).toBeDefined();
    }
  });

  it('turns ok into saved and closed into room', async () => {
    const ok = jest.fn(async () => ({ status: 'ok' as const, locked: true }));
    await expect(runSetLocked(ok, { roomId: 'r1', locked: true })).resolves.toEqual({
      kind: 'saved',
    });
    expect(ok).toHaveBeenCalledWith({ room_id: 'r1', locked: true });
    const closed = jest.fn(async () => ({ status: 'closed' as const }));
    await expect(runSetLocked(closed, { roomId: 'r1', locked: false })).resolves.toEqual({
      kind: 'room',
    });
  });

  it('turns a thrown call into failed', async () => {
    const call = jest.fn(async () => {
      throw new Error('denied');
    });
    await expect(runSetLocked(call, { roomId: 'r1', locked: true })).resolves.toEqual({
      kind: 'failed',
    });
  });
});
