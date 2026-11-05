import { render } from '@testing-library/react-native';
import { View } from 'react-native';

import { RoomLeaveGuard } from './leave-guard';

const mockPrevent = jest.fn((enabled: boolean, callback: () => void) => {
  void enabled;
  void callback;
  return () => undefined;
});
const mockAsk = jest.fn();
const mockHome = jest.fn();
jest.mock('expo-router', () => ({
  usePreventRemove: (enabled: boolean, callback: () => void) => mockPrevent(enabled, callback),
}));
jest.mock('@/features/lobby/use-leave-room', () => ({ useLeaveRoom: () => mockAsk }));
jest.mock('@/features/lobby/leave-context', () => ({
  LeaveContext: ({ children }: { children: React.ReactNode }) => children,
}));
const mockLeaveSolo = jest.fn();
jest.mock('@/features/solo/leave', () => ({ useLeaveSolo: () => mockLeaveSolo }));
jest.mock('@/features/room', () => ({
  registerRoomGuard: () => () => undefined,
  useMySeat: () => ({ member_id: 'm1' }),
  useExitRoomToHome: () => mockHome,
}));

const lastCallback = () => mockPrevent.mock.calls[mockPrevent.mock.calls.length - 1]?.[1];

beforeEach(() => jest.clearAllMocks());

describe('the room leave guard', () => {
  it('asks before leaving while the room is on', async () => {
    await render(
      <RoomLeaveGuard roomId="r1">
        <View />
      </RoomLeaveGuard>,
    );
    lastCallback()?.();
    expect(mockAsk).toHaveBeenCalled();
    expect(mockHome).not.toHaveBeenCalled();
  });

  it('goes Home with no alert once the room is over', async () => {
    await render(
      <RoomLeaveGuard roomId="r1" finished>
        <View />
      </RoomLeaveGuard>,
    );
    lastCallback()?.();
    expect(mockHome).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('leaves a solo room at once, with no question', async () => {
    await render(
      <RoomLeaveGuard roomId="r1" solo>
        <View />
      </RoomLeaveGuard>,
    );
    lastCallback()?.();
    expect(mockLeaveSolo).toHaveBeenCalled();
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
