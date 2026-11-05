import type { CastBallotResult } from '@flimme/contract';

import { createLockIn } from './lock-in';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const BALLOT = { ranking: [1, 2, 3], veto: 4 };
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function setup(answers: (CastBallotResult | Error)[]) {
  const queue = [...answers];
  const send = jest.fn(async () => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return next as CastBallotResult;
  });
  const report = jest.fn();
  const onNoVeto = jest.fn();
  const lockIn = createLockIn({ send, report, onNoVeto });
  return { lockIn, send, report, onNoVeto };
}

describe('locking in', () => {
  it('sends one ballot for a double tap', async () => {
    const { lockIn, send } = setup([{ status: 'ok', locked: ['a'], of: 2 }]);
    lockIn.submit(BALLOT);
    lockIn.submit(BALLOT);
    await flush();
    lockIn.submit(BALLOT);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(BALLOT);
  });

  it('is sending until the answer, then locked with the seats that locked', async () => {
    const { lockIn } = setup([{ status: 'ok', locked: ['a', 'b'], of: 2 }]);
    lockIn.submit(BALLOT);
    expect(lockIn.get()).toEqual({ kind: 'sending' });
    await flush();
    expect(lockIn.get()).toEqual({ kind: 'locked', locked: ['a', 'b'], of: 2 });
  });

  it('reads already_voted as locked', async () => {
    const { lockIn } = setup([{ status: 'already_voted' }]);
    lockIn.submit(BALLOT);
    await flush();
    expect(lockIn.get()).toEqual({ kind: 'locked', locked: [], of: null });
  });

  it('reads closed as counting, and not_in_room as a seat that left', async () => {
    const closed = setup([{ status: 'closed' }]);
    closed.lockIn.submit(BALLOT);
    await flush();
    expect(closed.lockIn.get()).toEqual({ kind: 'closed' });
    const left = setup([{ status: 'not_in_room' }]);
    left.lockIn.submit(BALLOT);
    await flush();
    expect(left.lockIn.get()).toEqual({ kind: 'left' });
  });

  it('reports invalid and unfreezes with an error', async () => {
    const { lockIn, report } = setup([{ status: 'invalid' }]);
    lockIn.submit(BALLOT);
    await flush();
    expect(report).toHaveBeenCalledWith('invalid');
    expect(lockIn.get()).toEqual({ kind: 'idle', error: true });
  });

  it('reports no_veto, re-reads the seat and unfreezes', async () => {
    const { lockIn, report, onNoVeto } = setup([{ status: 'no_veto' }]);
    lockIn.submit(BALLOT);
    await flush();
    expect(report).toHaveBeenCalledWith('no_veto');
    expect(onNoVeto).toHaveBeenCalled();
    expect(lockIn.get()).toEqual({ kind: 'idle', error: true });
  });

  it('stays sending and sends again each second when the call fails', async () => {
    const { lockIn, send } = setup([
      new Error('offline'),
      new Error('offline'),
      { status: 'ok', locked: ['a'], of: 2 },
    ]);
    lockIn.submit(BALLOT);
    await flush();
    expect(lockIn.get()).toEqual({ kind: 'sending' });
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(lockIn.get()).toEqual({ kind: 'sending' });
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(lockIn.get()).toEqual({ kind: 'locked', locked: ['a'], of: 2 });
  });

  it('sends nothing more once stopped', async () => {
    const { lockIn, send } = setup([new Error('offline')]);
    lockIn.submit(BALLOT);
    await flush();
    lockIn.stop();
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
