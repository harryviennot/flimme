import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import JoinFromLinkScreen from '@/app/join/[code]';
import i18n from '@/i18n';
import { keptRoomStore } from '@/features/room/kept-room';
import { haptics } from '@/lib/haptics';
import { resetServerTime } from '@/lib/server-time';

const REF = '0b9a7c3e-6a1d-4f6e-9a55-2b6f1e0c8d41';
const ROOM = 'room-1';

const mockJoinRoom = jest.fn();
const mockRoomPreview = jest.fn();
const mockUpdateProfile = jest.fn();
jest.mock('@/api', () => ({
  api: {
    roomPreview: (...a: unknown[]) => mockRoomPreview(...a),
    joinRoom: (...a: unknown[]) => mockJoinRoom(...a),
    updateProfile: (...a: unknown[]) => mockUpdateProfile(...a),
    room: (...a: unknown[]) => mockRoom(...a),
    roomSeats: (...a: unknown[]) => mockRoomSeats(...a),
    leaveRoom: (...a: unknown[]) => mockLeaveRoom(...a),
  },
}));
const mockRoom = jest.fn();
const mockRoomSeats = jest.fn();
const mockLeaveRoom = jest.fn();

const PREVIEW_OK = {
  status: 'ok',
  state: 'lobby',
  host_name: 'Harry',
  host_avatar_key: 'blue',
  players: 3,
  max_players: 10,
  seated: false,
};
let mockProfile: { display_name: string } | null = { display_name: 'Léa' };
jest.mock('@/features/profile/use-my-profile', () => ({
  MY_PROFILE_KEY: ['my_profile'],
  useMyProfile: () => ({ data: mockProfile, isPending: false }),
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
let mockRoutes: { name: string; params?: object }[] = [];
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
  },
  useRootNavigationState: () => ({ routes: mockRoutes }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn(), press: jest.fn() } }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
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

/** Opens the sheet and lets the first call settle. Nothing is tapped. */
async function openOnly(params: Record<string, unknown>) {
  mockParams = params;
  const view = await render(<Sheet />);
  await act(async () => {});
  return view;
}

/** Opens the sheet; a named player on the confirm layout then taps Join. */
async function open(params: Record<string, unknown>) {
  const view = await openOnly(params);
  if (params.r && mockProfile?.display_name && screen.queryByLabelText('Join')) {
    await fireEvent.press(screen.getByLabelText('Join'));
    await act(async () => {});
  }
  return view;
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  jest.useRealTimers();
  mockJoinRoom.mockReset();
  mockRoomPreview.mockReset();
  mockRoomPreview.mockResolvedValue(PREVIEW_OK);
  mockProfile = { display_name: 'Léa' };
  mockUpdateProfile.mockReset();
  mockStartSession.mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(router.dismissAll).mockClear();
  mockRoutes = [{ name: 'index' }, { name: 'join/[code]' }];
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
    expect(screen.getByText("You're invited")).toBeTruthy();
    expect(screen.queryByLabelText('Join')).toBeNull();
    mockSession = { status: 'ok' };
    await view.rerender(<Sheet />);
    await act(async () => {});
    expect(mockRoomPreview).toHaveBeenCalledTimes(1);
    expect(mockJoinRoom).not.toHaveBeenCalled();
  });

  it('shows the network refusal and Retry when signing in failed, and Retry starts the session', async () => {
    mockSession = null;
    mockSessionFailed = true;
    await open({ code: '482913', r: REF });
    expect(screen.getByText("We couldn't reach the room. Check your connection.")).toBeTruthy();
    expect(haptics.error).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockStartSession).toHaveBeenCalled();
    expect(mockRoomPreview).not.toHaveBeenCalled();
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

  it('goes back to the room screen already open instead of stacking another', async () => {
    mockRoutes = [
      { name: 'index' },
      { name: 'room/[id]', params: { id: ROOM } },
      { name: 'join/[code]' },
    ];
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913', r: REF });
    expect(router.dismissTo).toHaveBeenCalledWith('/room/room-1/lobby');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("drops another room's screens before entering the new one", async () => {
    mockRoutes = [
      { name: 'index' },
      { name: 'room/[id]', params: { id: 'other' } },
      { name: 'join/[code]' },
    ];
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913', r: REF });
    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/room/room-1/lobby');
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
    beforeEach(() => {
      mockProfile = { display_name: '' };
    });

    it('shows the host above the name form, and the generic title without a host name', async () => {
      await openOnly({ code: '482913', r: REF });
      expect(screen.getByText("Join Harry's movie night")).toBeTruthy();
      expect(screen.getByText('Room 482913')).toBeTruthy();
      expect(screen.getByText('3 players in')).toBeTruthy();
      expect(mockJoinRoom).not.toHaveBeenCalled();
    });

    it('uses the generic title when the host name is unknown', async () => {
      mockRoomPreview.mockResolvedValue({ ...PREVIEW_OK, host_name: null });
      await openOnly({ code: '482913', r: REF });
      expect(screen.getByText('Join the movie night')).toBeTruthy();
    });

    it('Join saves the profile, then joins once with the link_opened_at of the arrival', async () => {
      mockJoinRoom.mockResolvedValueOnce({ status: 'ok', room_id: ROOM, state: 'lobby' });
      mockUpdateProfile.mockResolvedValue({
        status: 'ok',
        display_name: 'Léa',
        avatar_key: 'blue',
      });
      await openOnly({ code: '482913', r: REF });
      await fireEvent.changeText(screen.getByLabelText(/name/i), 'Léa');
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
      expect(mockJoinRoom).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/room/room-1/lobby');
    });

    it('name_required from join_room shows this layout with the preview host', async () => {
      mockProfile = { display_name: 'Léa' };
      mockJoinRoom.mockResolvedValue({ status: 'name_required', host_name: 'Harry' });
      await open({ code: '482913', r: REF });
      expect(screen.getByText("Join Harry's movie night")).toBeTruthy();
      expect(screen.getByText('3 players in')).toBeTruthy();
    });

    it('name_not_allowed shows the name error and does not join', async () => {
      mockUpdateProfile.mockResolvedValue({ status: 'name_not_allowed' });
      await openOnly({ code: '482913', r: REF });
      await fireEvent.changeText(screen.getByLabelText(/name/i), 'Léa');
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(screen.getByText(i18n.t('onboarding:name.errors.notAllowed'))).toBeTruthy();
      expect(mockJoinRoom).not.toHaveBeenCalled();
      expect(haptics.error).toHaveBeenCalledTimes(1);
    });

    it('unknown_avatar does not join and shows the generic toast', async () => {
      mockUpdateProfile.mockResolvedValue({ status: 'unknown_avatar' });
      await openOnly({ code: '482913', r: REF });
      await fireEvent.changeText(screen.getByLabelText(/name/i), 'Léa');
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(mockJoinRoom).not.toHaveBeenCalled();
    });
  });

  describe('the preview', () => {
    it('calls roomPreview with the code and the reference, never joinRoom, before the tap', async () => {
      await openOnly({ code: '482913', r: REF });
      expect(mockRoomPreview).toHaveBeenCalledWith({ code: '482913', ref: REF });
      expect(mockJoinRoom).not.toHaveBeenCalled();
    });

    it('shows the ticket, the host, the count and Join', async () => {
      await openOnly({ code: '482913', r: REF });
      expect(screen.getByText("Join Harry's movie night")).toBeTruthy();
      expect(screen.getByText('3 players in')).toBeTruthy();
      expect(screen.getByLabelText('Host: Harry. 3 players in')).toBeTruthy();
      expect(screen.getByLabelText('Join')).toBeTruthy();
    });

    it('says "1 player in" for one', async () => {
      mockRoomPreview.mockResolvedValue({ ...PREVIEW_OK, players: 1 });
      await openOnly({ code: '482913', r: REF });
      expect(screen.getByText('1 player in')).toBeTruthy();
    });

    it('Join sends the link_opened_at of the arrival, however long the tap takes', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-03T10:00:00.000Z') });
      mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
      await openOnly({ code: '482913', r: REF });
      const first = mockRoomPreview.mock.calls.length;
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      await fireEvent.press(screen.getByLabelText('Join'));
      await act(async () => {});
      expect(first).toBe(1);
      const args = mockJoinRoom.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(args).toMatchObject({ code: '482913', ref: REF, via: 'link' });
      expect(Date.parse(args.link_opened_at as string)).toBeLessThan(
        Date.parse('2026-11-03T10:00:30.000Z'),
      );
    });

    it.each([
      [{ status: 'closed' }, 'This movie night has ended.'],
      [{ status: 'full', max_players: 8 }, 'This room is full (8 players).'],
      [{ status: 'in_finale' }, "They're voting on the final pick right now. Catch the next game."],
      [
        { status: 'rate_limited' },
        'Too many tries. Ask the host for the link, or try again in a few minutes.',
      ],
    ])('%j is refused on open with its message and one haptic', async (answer, message) => {
      mockRoomPreview.mockResolvedValue(answer);
      await openOnly({ code: '482913', r: REF });
      expect(screen.getByText(message)).toBeTruthy();
      expect(haptics.error).toHaveBeenCalledTimes(1);
      expect(mockJoinRoom).not.toHaveBeenCalled();
    });

    it('a failed call shows the network refusal and Retry previews again', async () => {
      mockRoomPreview.mockRejectedValueOnce(new Error('boom'));
      await openOnly({ code: '482913', r: REF });
      expect(screen.getByText("We couldn't reach the room. Check your connection.")).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Try again'));
      await act(async () => {});
      expect(mockRoomPreview).toHaveBeenCalledTimes(2);
      expect(screen.getByLabelText('Join')).toBeTruthy();
      expect(mockJoinRoom).not.toHaveBeenCalled();
    });

    it('offline on open previews when back online, and never joins', async () => {
      mockOnline = false;
      const view = await openOnly({ code: '482913', r: REF });
      expect(screen.getByText("You're offline. Connect to join.")).toBeTruthy();
      expect(mockRoomPreview).not.toHaveBeenCalled();
      mockOnline = true;
      await view.rerender(<Sheet />);
      await act(async () => {});
      expect(mockRoomPreview).toHaveBeenCalledTimes(1);
      expect(mockJoinRoom).not.toHaveBeenCalled();
    });

    it('seated joins at once, and goes back to the room already open', async () => {
      mockRoutes = [
        { name: 'index' },
        { name: 'room/[id]', params: { id: ROOM } },
        { name: 'join/[code]' },
      ];
      mockRoomPreview.mockResolvedValue({ ...PREVIEW_OK, seated: true });
      mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
      await openOnly({ code: '482913', r: REF });
      expect(mockJoinRoom).toHaveBeenCalledTimes(1);
      expect(router.dismissTo).toHaveBeenCalledWith('/room/room-1/lobby');
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('a link without a reference joins at once and never previews', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
      await openOnly({ code: '482913' });
      expect(mockRoomPreview).not.toHaveBeenCalled();
      expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('starting', () => {
    beforeEach(() => jest.useFakeTimers());

    it('retries every second and gives up after 10 seconds', async () => {
      mockJoinRoom.mockResolvedValue({ status: 'starting' });
      await open({ code: '482913', r: REF });
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
      expect(mockRoomPreview).toHaveBeenCalledTimes(1);
    });
  });
});

describe('the kept room', () => {
  const OLD = { id: 'room-old', code: '654321' };
  const SEATS = [
    { role: 'host', display_name: 'Harry', left_at: null, is_me: false },
    { role: 'guest', display_name: 'Léa', left_at: null, is_me: true },
  ];

  beforeEach(() => {
    mockRoom.mockReset().mockResolvedValue({ state: 'lobby' });
    mockRoomSeats.mockReset().mockResolvedValue(SEATS);
    mockLeaveRoom.mockReset().mockResolvedValue({ status: 'ok' });
    keptRoomStore.getState().keep(OLD);
  });
  afterEach(() => keptRoomStore.getState().forget());

  it('shows the leave line on Confirm and on First time, in French too', async () => {
    const confirm = await openOnly({ code: '482913', r: REF });
    expect(await screen.findByText("You'll leave Harry's room")).toBeTruthy();
    await confirm.unmount();
    mockProfile = { display_name: '' };
    await openOnly({ code: '482913', r: REF });
    expect(await screen.findByText("You'll leave Harry's room")).toBeTruthy();
    await act(async () => {
      await i18n.changeLanguage('fr');
    });
    expect(await screen.findByText('Tu quitteras la salle de Harry')).toBeTruthy();
  });

  it('says "your other room" while the seats are unread or when the host is the player', async () => {
    mockRoomSeats.mockReturnValue(new Promise(() => {}));
    const pending = await openOnly({ code: '482913', r: REF });
    expect(screen.getByText("You'll leave your other room")).toBeTruthy();
    await pending.unmount();
    client = new QueryClient();
    mockRoomSeats.mockReset().mockResolvedValue([{ ...SEATS[0], is_me: true }]);
    await openOnly({ code: '482913', r: REF });
    expect(await screen.findByText("You'll leave your other room")).toBeTruthy();
  });

  it('shows no line for an ended kept room, and forgets it', async () => {
    mockRoom.mockResolvedValue({ state: 'done' });
    await openOnly({ code: '482913', r: REF });
    await waitFor(() => expect(keptRoomStore.getState().room).toBeNull());
    expect(screen.queryByText(/You'll leave/)).toBeNull();
  });

  it('shows no line when the link is the kept room', async () => {
    keptRoomStore.getState().keep({ id: REF, code: '482913' });
    await openOnly({ code: '482913', r: REF });
    expect(screen.queryByText(/You'll leave/)).toBeNull();
  });

  it('wins over the kept room at launch: the link joins with via link and never rejoins', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913', r: REF });
    expect(mockJoinRoom).toHaveBeenCalledTimes(1);
    expect(mockJoinRoom.mock.calls[0]?.[0]).toMatchObject({ via: 'link' });
    expect(router.replace).toHaveBeenCalledWith(`/room/${ROOM}/lobby`);
  });

  it('shows no line while loading or joining', async () => {
    mockRoomPreview.mockReturnValue(new Promise(() => {}));
    await openOnly({ code: '482913', r: REF });
    expect(screen.queryByText(/You'll leave/)).toBeNull();
    await screen.unmount();
    mockJoinRoom.mockReturnValue(new Promise(() => {}));
    await openOnly({ code: '482913' });
    expect(screen.queryByText(/You'll leave/)).toBeNull();
  });

  it('shows no line on a refusal', async () => {
    mockRoomPreview.mockResolvedValue({ status: 'closed' });
    await openOnly({ code: '482913', r: REF });
    expect(screen.queryByText(/You'll leave/)).toBeNull();
  });

  it('leaves the old room once on ok, and enters the new one without waiting', async () => {
    mockLeaveRoom.mockReturnValue(new Promise(() => {}));
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913', r: REF });
    expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
    expect(mockLeaveRoom).toHaveBeenCalledWith({ room_id: 'room-old' });
    expect(router.replace).toHaveBeenCalledWith(`/room/${ROOM}/lobby`);
  });

  it('leaves the old room when the link has no reference', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await open({ code: '482913' });
    expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
  });

  it('leaves the kept room when the preview says seated in another room, with no line', async () => {
    mockRoomPreview.mockResolvedValue({ ...PREVIEW_OK, seated: true });
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await openOnly({ code: '482913', r: REF });
    expect(screen.queryByText(/You'll leave/)).toBeNull();
    expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
    expect(mockLeaveRoom).toHaveBeenCalledWith({ room_id: 'room-old' });
    expect(router.replace).toHaveBeenCalledWith(`/room/${ROOM}/lobby`);
  });

  it('leaves nothing when the seated link is the kept room itself', async () => {
    keptRoomStore.getState().keep({ id: ROOM, code: '482913' });
    mockRoomPreview.mockResolvedValue({ ...PREVIEW_OK, seated: true });
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    await openOnly({ code: '482913', r: REF });
    expect(mockLeaveRoom).not.toHaveBeenCalled();
  });

  it('leaves nothing for the same room', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: 'room-old', state: 'lobby' });
    await open({ code: '482913' });
    expect(mockLeaveRoom).not.toHaveBeenCalled();
  });

  it('opens the new room even when the leave call fails', async () => {
    mockJoinRoom.mockResolvedValue({ status: 'ok', room_id: ROOM, state: 'lobby' });
    mockLeaveRoom.mockRejectedValue(new Error('down'));
    await open({ code: '482913' });
    expect(router.replace).toHaveBeenLastCalledWith(`/room/${ROOM}/lobby`);
  });
});
