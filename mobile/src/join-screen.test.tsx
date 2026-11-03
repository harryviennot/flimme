import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JoinScreen from '@/app/join/index';
import i18n from '@/i18n';
import { keptRoomStore } from '@/features/room/kept-room';

const mockJoinRoom = jest.fn();
const mockLeaveRoom = jest.fn();
jest.mock('@/api', () => ({
  api: {
    joinRoom: (...a: unknown[]) => mockJoinRoom(...a),
    leaveRoom: (...a: unknown[]) => mockLeaveRoom(...a),
  },
}));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
jest.mock('@/features/profile', () => ({ MY_PROFILE_KEY: ['my_profile'] }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('expo-clipboard', () => ({
  isPasteButtonAvailable: false,
  getStringAsync: jest.fn(async () => ''),
  ClipboardPasteButton: () => null,
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const frame = { x: 0, y: 0, width: 375, height: 812 };

async function typeCode() {
  await render(
    <SafeAreaProvider initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={new QueryClient()}>
        <JoinScreen />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await fireEvent.changeText(screen.getByLabelText('Room code, 6 digits'), '482913');
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mockJoinRoom.mockReset();
  jest.mocked(router.push).mockClear();
});

describe('JoinScreen', () => {
  it.each([
    [{ status: 'in_finale' }, "They're voting on the final pick right now. Catch the next game."],
    [{ status: 'full', max_players: 8 }, 'This room is full (8 players).'],
    [{ status: 'locked' }, 'This room is locked. Ask the host to unlock it.'],
  ])('%j shows its message and a Host button that opens /host', async (answer, message) => {
    mockJoinRoom.mockResolvedValue(answer);
    await typeCode();
    expect(await screen.findByText(message)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Host a movie night'));
    expect(router.push).toHaveBeenCalledWith('/host');
  });

  it('shows Retry after a failed call and calls again', async () => {
    mockJoinRoom.mockRejectedValue(new Error('down'));
    await typeCode();
    expect(
      await screen.findByText("We couldn't reach the room. Check your connection."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockJoinRoom).toHaveBeenCalledTimes(2);
  });

  describe('with a kept room', () => {
    beforeEach(() => {
      mockLeaveRoom.mockReset().mockResolvedValue({ status: 'ok' });
      keptRoomStore.getState().keep({ id: 'room-old', code: '654321' });
    });
    afterEach(() => keptRoomStore.getState().forget());

    it('leaves the old seat once after ok for another room, with no line', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: 'room-new', state: 'lobby' });
      await typeCode();
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/room/room-new/lobby'));
      expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
      expect(mockLeaveRoom).toHaveBeenCalledWith({ room_id: 'room-old' });
      expect(screen.queryByText(/You'll leave/)).toBeNull();
    });

    it('still leaves the old room when the new room is kept before the answer is used', async () => {
      mockJoinRoom.mockImplementation(async () => {
        keptRoomStore.getState().keep({ id: 'room-new', code: '482913' });
        return { status: 'ok', room_id: 'room-new', state: 'lobby' };
      });
      await typeCode();
      await waitFor(() => expect(mockLeaveRoom).toHaveBeenCalledWith({ room_id: 'room-old' }));
    });

    it('leaves nothing for the same room', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: 'room-old', state: 'lobby' });
      await typeCode();
      await waitFor(() => expect(router.replace).toHaveBeenCalled());
      expect(mockLeaveRoom).not.toHaveBeenCalled();
    });
  });
});
