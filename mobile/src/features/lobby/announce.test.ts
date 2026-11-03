import { createAnnouncer } from './announce';
import { runLeave } from './leave';

jest.mock('@/features/room/leave', () => ({ leaveRoom: jest.fn() }));

describe('createAnnouncer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('says the first message at once and spaces the rest by a second', () => {
    const say = jest.fn();
    const announcer = createAnnouncer(say);
    announcer.announce('Sam is here');
    announcer.announce('Jo is here');
    announcer.announce('Max left');
    expect(say).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(999);
    expect(say).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(say).toHaveBeenLastCalledWith('Jo is here');
    jest.advanceTimersByTime(1000);
    expect(say.mock.calls.map((c) => c[0])).toEqual(['Sam is here', 'Jo is here', 'Max left']);
  });

  it('speaks at once again after a quiet second', () => {
    const say = jest.fn();
    const announcer = createAnnouncer(say);
    announcer.announce('a');
    jest.advanceTimersByTime(1500);
    announcer.announce('b');
    expect(say).toHaveBeenCalledTimes(2);
  });
});

describe('runLeave', () => {
  it('does not call while offline', async () => {
    const leave = jest.fn();
    await expect(runLeave('r1', false, leave)).resolves.toBe('offline');
    expect(leave).not.toHaveBeenCalled();
  });

  it('leaves, and says failed when the call throws', async () => {
    const leave = jest.fn().mockResolvedValueOnce({ status: 'not_in_room' });
    await expect(runLeave('r1', true, leave)).resolves.toBe('left');
    expect(leave).toHaveBeenCalledWith('r1');
    leave.mockRejectedValueOnce(new Error('x'));
    await expect(runLeave('r1', true, leave)).resolves.toBe('failed');
  });
});
