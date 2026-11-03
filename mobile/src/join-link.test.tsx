import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JoinFromLinkScreen from '@/app/join/[code]';
import i18n from '@/i18n';
import { haptics } from '@/lib/haptics';
import { resetServerTime } from '@/lib/server-time';

const REF = '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41';
const ROOM = 'room-1';

const mockJoinRoom = jest.fn();
const mockUpdateProfile = jest.fn();
jest.mock('@/api', () => ({
  api: {
    joinRoom: (...a: unknown[]) => mockJoinRoom(...a),
    updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
  },
}));

let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));

let mockSession: { status: string } | null = { status: 'ok' };
let mockSessionFailed = false;
const mockStartSession = jest.fn(async () => ({ status: 'ok' }));
jest.mock('@/features/session', () => ({
  startSession: () => mockStartSession(),
  useSession: () => mockSession,
  useSessionFailed: () => mockSessionFailed,
}));

let mockParams: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn(), press: jest.fn() } }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn() },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));

const frame = { x: 0, y: 0, width: 375, height: 812 };
let client: QueryClient;

function Sheet() {
  return (
    <SafeAreaProvider initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <QueryClientProvider client={client}>
        <JoinFromLinkScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function open(params: Record<string, unknown>) {
  mockParams = params;
  const view = await render(<Sheet />);
  // Let the first join call and its answer settle.
  await act(async () => {});
  return view;
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.useRealTimers();
  mockJoinRoom.mockReset();
  mockUpdateProfile.mockReset();
  mockStartSession.mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(haptics.error).mockClear();
  mockOnline = true;
  mockSession = { status: 'ok' };
  mockSessionFailed = false;
  client = new QueryClient();
  resetServerTime();
});

describe('the join sheet', () => {
  it('joins with the code, the reference, via link and the moment the link arrived', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913', r: REF });
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    const args = mockJoinRoom.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).toMatchObject({ code: '482913', ref: REF, via: 'link' });
    expect(new Date(args.link_opened_at as string).toISOString()).toBe(args.link_opened_at);
  });

  it('joins by code alone when the link has no reference', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913' });
    expect(mockJoinRoom.mock.calls[0]?.[0]).not.toHaveProperty('ref');
  });

  it('waits for the session before joining', async () => {
    mockSession = null;
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    const view = await open({ code: '482913', r: REF });
    expect(mockJoinRoom).not.toHaveBeenCalled();
    expect(screen.getByText('Getting you in…')).toBeTruthy();
    mockSession = { status: 'ok' };
    await view.rerender(<Sheet />);
    await act(async () => {});
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
  });

  it('shows the network refusal and Retry when signing in failed, and Retry starts the session', async () => {
    mockSession = null;
    mockSessionFailed = true;
    await open({ code: '482913', r: REF });
    expect(screen.getByText("We couldn't reach the room. Check your connection.")).toBeTruthy();
    expect(haptics.error).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockStartSession).toHaveBeenCalled();
    expect(mockJoinRoom).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: '48291' }],
    [{ code: 'abcdef' }],
    [{ code: '482913', r: 'nope' }],
    [{ code: '482913', r: ['a', 'b'] }],
  ])('%j is malformed: refused, no call, no haptic', async (params) => {
    await open(params);
    expect(screen.getByText('This movie night has ended.')).toBeTruthy();
    expect(mockJoinRoom).not.toHaveBeenCalled();
    expect(haptics.error).not.toHaveBeenCalled();
  });

  it.each([
    ['lobby', '/room/room-1/lobby'],
    ['swiping', '/room/room-1/swipe'],
    ['finale', '/room/room-1/final-cut'],
  ])('ok in %s replaces the sheet with the room', async (state, path) => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state });
    await open({ code: '482913', r: REF });
    expect(router.replace).toHaveBeenCalledWith(path);
  });

  it.each([
    [{ status: 'not_found' }, 'This movie night has ended.'],
    [{ status: 'closed' }, 'This movie night has ended.'],
    [{ status: 'full', max_players: 8 }, 'This room is full (8 players).'],
    [{ status: 'in_finale' }, "They're voting on the final pick right now. Catch the next game."],
    [{ status: 'removed' }, 'The host removed you from this room.'],
    [{ status: 'locked' }, 'This room is locked. Ask the host to unlock it.'],
    [
      { status: 'rate_limited' },
      'Too many tries. Ask the host for the link, or try again in a few minutes.',
    ],
  ])('%j is refused with its message, one haptic, and the two buttons', async (answer, message) => {
    mockJoinRoom.mockResolvedValue(answer);
    await open({ code: '482913', r: REF });
    expect(screen.getByText(message)).toBeTruthy();
    expect(haptics.error).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Host a movie night'));
    expect(router.replace).toHaveBeenCalledWith('/host');
  });

  it('Enter another code goes to /join', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'closed' });
    await open({ code: '482913', r: REF });
    await fireEvent.press(screen.getByLabelText('Enter another code'));
    expect(router.replace).toHaveBeenCalledWith('/join');
  });

  it('a failed call shows the network refusal and Retry joins again', async () => {
    mockJoinRoom.mockRejectedValueOnce(new Error('boom'));
    mockJoinRoom.mockResolvedValueOnce({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913', r: REF });
    expect(screen.getByText("We couldn't reach the room. Check your connection.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    await act(async () => {});
    expect(router.replace).toHaveBeenCalledWith('/room/room-1/lobby');
  });

  describe('first time', () => {
    it('shows the host in the title, and the generic title without a host name', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: 'Harry' });
      await open({ code: '482913', r: REF });
      expect(screen.getByText("Join Harry's movie night")).toBeTruthy();
      expect(screen.getByText('Room 482913')).toBeTruthy();
    });

    it('uses the generic title when the host name is unknown', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: null });
      await open({ code: '482913', r: REF });
      expect(screen.getByText('Join the movie night')).toBeTruthy();
    });

    it('Join saves the profile, then joins again with the same link_opened_at', async () => {
      mockJoinRoom
        .mockResolvedValueOnce({ status: 'name_required', host_name: 'Harry' })
        .mockResolvedValueOnce({ status: 'ok', room_id: ROOM, state: 'lobby' });
      mockUpdateProfile.mockResolvedValue({
        status: 'ok',
        display_name: 'Léa',
        avatar_key: 'blue',
      });
      await open({ code: '482913', r: REF });
      await fireEvent.changeText(screen.getByLabelText(/name/i), 'Léa');
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
      expect(mockJoinRoom).toHaveBeenCalledTimes(2);
      expect(mockJoinRoom.mock.calls[1]?.[0].link_opened_at).toBe(
        mockJoinRoom.mock.calls[0]?.[0].link_opened_at,
      );
      expect(router.replace).toHaveBeenCalledWith('/room/room-1/lobby');
    });

    it('name_not_allowed shows the name error and does not join', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: 'Harry' });
      mockUpdateProfile.mockResolvedValue({ status: 'name_not_allowed' });
      await open({ code: '482913', r: REF });
      await fireEvent.changeText(screen.getByLabelText(/name/i), 'Léa');
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(screen.getByText(i18n.t('onboarding:name.errors.notAllowed'))).toBeTruthy();
      expect(mockJoinRoom).toHaveBeenCalledTimes(1);
      expect(haptics.error).toHaveBeenCalledTimes(1);
    });

    it('unknown_avatar does not join and shows the generic toast', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: 'Harry' });
      mockUpdateProfile.mockResolvedValue({ status: 'unknown_avatar' });
      await open({ code: '482913', r: REF });
      await fireEvent.changeText(screen.getByLabelText(/name/i), 'Léa');
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('starting', () => {
    beforeEach(() => jest.useFakeTimers());

    it('retries every second and gives up after 10 seconds', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'starting' });
      mockParams = { code: '482913', r: REF };
      await render(<Sheet />);
      await act(async () => {});
      expect(screen.getByText('Shuffling the deck…')).toBeTruthy();
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(mockJoinRoom).toHaveBeenCalledTimes(11);
      expect(screen.getByText('The game is starting. Try again in a moment.')).toBeTruthy();
      expect(screen.getByLabelText('Try again')).toBeTruthy();
    });
  });

  describe('offline', () => {
    it('shows the offline refusal without a button and joins when back online', async () => {
      mockOnline = false;
      mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
      const view = await open({ code: '482913', r: REF });
      expect(screen.getByText("You're offline. Connect to join.")).toBeTruthy();
      expect(screen.queryByLabelText('Enter another code')).toBeNull();
      expect(mockJoinRoom).not.toHaveBeenCalled();
      expect(haptics.error).not.toHaveBeenCalled();
      mockOnline = true;
      await view.rerender(<Sheet />);
      await act(async () => {});
      expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    });
  });
});
