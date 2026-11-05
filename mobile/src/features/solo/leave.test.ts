import { ApiError } from '@flimme/contract';

import { createPendingLeaves, settleLeaves } from './leave';

jest.mock('@/api', () => ({ api: { leaveRoom: jest.fn() } }));
jest.mock('@/features/swipe', () => ({ voteQueue: {} }));
jest.mock('@/features/room', () => ({ useExitRoomToHome: jest.fn() }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

function setup(over: { waiting?: number; leave?: jest.Mock } = {}) {
  const store = createPendingLeaves();
  store.getState().add('r1');
  const deps = {
    flush: jest.fn().mockResolvedValue(undefined),
    waitingVotes: jest.fn(() => over.waiting ?? 0),
    leaveRoom: over.leave ?? jest.fn().mockResolvedValue({ status: 'ok' }),
  };
  return { store, deps };
}

describe('settleLeaves', () => {
  it('sends the votes, then leaves, then forgets the leave', async () => {
    const { store, deps } = setup();
    await settleLeaves(store, deps);
    expect(deps.flush.mock.invocationCallOrder[0]).toBeLessThan(
      deps.leaveRoom.mock.invocationCallOrder[0]!,
    );
    expect(store.getState().rooms).toEqual([]);
  });

  it('waits while votes are still queued', async () => {
    const { store, deps } = setup({ waiting: 1 });
    await settleLeaves(store, deps);
    expect(deps.leaveRoom).not.toHaveBeenCalled();
    expect(store.getState().rooms).toEqual(['r1']);
  });

  it('keeps the leave when the network fails and drops it on any other failure', async () => {
    const net = setup({
      leave: jest.fn().mockRejectedValue(new ApiError('network', 'leave_room', 'x')),
    });
    await settleLeaves(net.store, net.deps);
    expect(net.store.getState().rooms).toEqual(['r1']);
    const bad = setup({
      leave: jest.fn().mockRejectedValue(new ApiError('denied', 'leave_room', 'x')),
    });
    await settleLeaves(bad.store, bad.deps);
    expect(bad.store.getState().rooms).toEqual([]);
  });

  it('also tries a leave added while an earlier one is still being settled', async () => {
    const store = createPendingLeaves();
    store.getState().add('r1');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const deps = {
      flush: jest.fn().mockReturnValueOnce(gate).mockResolvedValue(undefined),
      waitingVotes: jest.fn(() => 0),
      leaveRoom: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    const first = settleLeaves(store, deps);
    store.getState().add('r2');
    const second = settleLeaves(store, deps);
    release();
    await Promise.all([first, second]);
    expect(deps.leaveRoom.mock.calls.map((c) => c[0])).toEqual(['r1', 'r2']);
    expect(store.getState().rooms).toEqual([]);
  });
});
