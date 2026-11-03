import { renderHook } from '@testing-library/react-native';

import type { RoomRealtime } from './realtime/controller';
import { removedExit, useRemovedListener } from './removed';

function deps(kept: boolean) {
  return {
    isKept: jest.fn(() => kept),
    forget: jest.fn(),
    goHome: jest.fn(),
    say: jest.fn(),
  };
}

describe('removedExit', () => {
  it('forgets the room, goes Home and says it once', () => {
    const d = deps(true);
    const told = { current: false };
    removedExit('r1', told, d, false);
    removedExit('r1', told, d, true);
    expect(d.forget).toHaveBeenCalledWith('r1');
    expect(d.goHome).toHaveBeenCalled();
    expect(d.say).toHaveBeenCalledTimes(1);
  });

  it('says nothing for a null read of a room the phone does not keep', () => {
    const d = deps(false);
    removedExit('r1', { current: false }, d, true);
    expect(d.goHome).toHaveBeenCalled();
    expect(d.say).not.toHaveBeenCalled();
  });

  it('says it when the event names the seat, kept or not', () => {
    const d = deps(false);
    removedExit('r1', { current: false }, d, false);
    expect(d.say).toHaveBeenCalledTimes(1);
  });
});

describe('useRemovedListener', () => {
  it('reacts only to its own seat', async () => {
    let handler: (payload: unknown) => void = () => {};
    const realtime = {
      listen: jest.fn((_event: string, h: (payload: unknown) => void) => {
        handler = h;
        return () => {};
      }),
    } as unknown as RoomRealtime;
    const onRemoved = jest.fn();
    await renderHook(() => useRemovedListener(realtime, 'm1', onRemoved));
    expect(realtime.listen).toHaveBeenCalled();
    handler({ member_id: 'm2' });
    expect(onRemoved).not.toHaveBeenCalled();
    handler({ member_id: 'm1' });
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });
});
