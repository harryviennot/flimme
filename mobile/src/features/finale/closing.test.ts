import type { CloseRoundStageResult } from '@flimme/contract';

import { createCloser } from './closing';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const notYet: CloseRoundStageResult = { status: 'not_yet', closes_at: 'later' };

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('closing the round', () => {
  it('calls once after the delay, and stops on ok', async () => {
    const call = jest.fn(async (): Promise<CloseRoundStageResult> => ({
      status: 'ok',
      winner_title_id: 1,
    }));
    const closer = createCloser(call);
    closer.start(2_000);
    jest.advanceTimersByTime(1_999);
    expect(call).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flush();
    jest.advanceTimersByTime(10_000);
    await flush();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('stops on closed', async () => {
    const call = jest.fn(async (): Promise<CloseRoundStageResult> => ({
      status: 'closed',
      winner_title_id: 1,
    }));
    createCloser(call).start(0);
    jest.advanceTimersByTime(0);
    await flush();
    jest.advanceTimersByTime(5_000);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('tries again each second on not_yet', async () => {
    const call = jest.fn(async () => notYet);
    createCloser(call).start(0);
    jest.advanceTimersByTime(0);
    await flush();
    for (let i = 2; i <= 4; i++) {
      jest.advanceTimersByTime(1_000);
      await flush();
      expect(call).toHaveBeenCalledTimes(i);
    }
  });

  it('tries again each second when the call fails', async () => {
    const call = jest
      .fn<Promise<CloseRoundStageResult>, []>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ status: 'ok', winner_title_id: 1 });
    createCloser(call).start(0);
    jest.advanceTimersByTime(0);
    await flush();
    jest.advanceTimersByTime(1_000);
    await flush();
    jest.advanceTimersByTime(5_000);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('stops when told to', async () => {
    const call = jest.fn(async () => notYet);
    const closer = createCloser(call);
    closer.start(0);
    jest.advanceTimersByTime(0);
    await flush();
    closer.stop();
    jest.advanceTimersByTime(5_000);
    await flush();
    expect(call).toHaveBeenCalledTimes(1);
  });
});
