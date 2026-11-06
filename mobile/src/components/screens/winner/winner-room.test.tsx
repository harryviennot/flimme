import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { registerRoomGuard } from '@/features/room';
import { showToast } from '@/components/ui/toast';
import { track } from '@/lib/analytics';

import { WinnerRoom } from './winner-room';

// The machine running the tests can be busy; the waits are about the app, not about speed.
configure({ asyncUtilTimeout: 5000 });

jest.mock('@/api', () => ({
  api: {
    roomMatches: jest.fn(),
    rounds: jest.fn(),
    titleCards: jest.fn(),
    playAgain: jest.fn(),
    joinRoom: jest.fn(),
  },
}));
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/join/old-seat', () => ({
  keptRoomId: () => 'r1',
  leaveOldSeat: jest.fn(),
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://image.tmdb.org/t/p' } }),
}));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
const mockExit = jest.fn();
let mockMode = 'quick_match';
let mockNext: { next_room_id: string | null; next_room_code: string | null } = {
  next_room_id: null,
  next_room_code: null,
};
let mockSeats: object[] = [];
let mockNextHandler: ((payload: unknown) => void) | null = null;
const mockKeep = jest.fn();
jest.mock('@/features/solo/leave', () => ({ isLeavingSolo: () => false }));
jest.mock('@/features/room', () => ({
  useRoom: () => ({ data: { mode: mockMode, ...mockNext } }),
  SEATS_KEY: (id: string) => ['room', id, 'seats'],
  keptRoomStore: { getState: () => ({ keep: mockKeep }) },
  useRoomEvent: (_id: string, _event: string, handler: (payload: unknown) => void) => {
    mockNextHandler = handler;
  },
  ...jest.requireActual('@/features/room/leave-guard'),
  ROOM_KEY: (id: string) => ['room', id],
  useExitRoomToHome: () => mockExit,
  // Three seats present and one that left.
  useRoomSeats: () => ({
    data: mockSeats.length
      ? mockSeats
      : [{ left_at: null }, { left_at: null }, { left_at: null }, { left_at: 'x' }],
  }),
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/features/room/match-shown', () => ({ useMatchShown: () => true }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/marquee-bulbs', () => ({ MarqueeBulbs: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const mockApi = api as unknown as Record<
  'roomMatches' | 'rounds' | 'titleCards' | 'playAgain' | 'joinRoom',
  jest.Mock
>;

const match = (kind: string, pick_order: number | null) => ({
  room_id: 'r1',
  title_id: 7,
  kind,
  like_count: 2,
  present_count: 2,
  pick_order,
  created_at: '2026-11-04T10:00:00Z',
});
const card = {
  title_id: 7,
  title: 'Past Lives',
  year: 2023,
  runtime_min: 105,
  poster_path: '/p.jpg',
  poster_placeholder: null,
  providers: [],
  watch_link: null,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'quick_match';
  mockNext = { next_room_id: null, next_room_code: null };
  mockSeats = [];
  mockNextHandler = null;
  mockApi.rounds.mockResolvedValue([{ id: 'x' }]);
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [card] });
});

describe('Share recap on the winner route', () => {
  it('pushes the recap sheet of the room', async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Share recap')).toBeTruthy());
    fireEvent.press(screen.getByText('Share recap'));
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/recap');
  });

  it('has no Share recap in a solo room', async () => {
    mockMode = 'solo';
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    expect(screen.queryByText('Share recap')).toBeNull();
  });
});

describe('the winner room', () => {
  it.each(['unanimous', 'majority', 'finale'])('shows a %s pick the same way', async (kind) => {
    mockApi.roomMatches.mockResolvedValue([match(kind, 1)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    expect(screen.getByText('2023 · 1 h 45')).toBeTruthy();
    expect(screen.queryByText('The only film anyone liked')).toBeNull();
  });

  it.each([
    ['unanimous', 'match'],
    ['majority', 'match'],
    ['finale', 'finale'],
  ])('reports the winner view once for a %s pick', async (kind, outcome) => {
    mockApi.roomMatches.mockResolvedValue([match(kind, 1)]);
    const view = await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    await view.rerender(<WinnerRoom roomId="r1" />);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('winner:view', { outcome, room_size: '3_4' });
  });

  it('reports nothing for a room that picked nothing', async () => {
    mockApi.roomMatches.mockResolvedValue([match('majority', null)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.queryByTestId('winner-loading')).toBeNull());
    expect(track).not.toHaveBeenCalled();
  });

  it('reports the watch page opening with no property', async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    mockApi.titleCards.mockResolvedValue({
      status: 'ok',
      cards: [{ ...card, watch_link: 'https://www.themoviedb.org/movie/1/watch?locale=FR' }],
    });
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: /details/i }));
    expect(track).toHaveBeenLastCalledWith('winner:watch_page_open');
  });

  it('says "The only film anyone liked" for a finale pick with no round', async () => {
    mockApi.roomMatches.mockResolvedValue([match('finale', 1)]);
    mockApi.rounds.mockResolvedValue([]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('The only film anyone liked')).toBeTruthy());
  });

  it('renders the no-pick slot with no poster when no row has pick_order 1', async () => {
    mockApi.roomMatches.mockResolvedValue([match('majority', null)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.queryByTestId('winner-loading')).toBeNull());
    expect(screen.queryByTestId('winner-poster')).toBeNull();
    expect(mockApi.titleCards).not.toHaveBeenCalled();
  });

  it('shows the poster frame while the card loads', async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    mockApi.titleCards.mockReturnValue(new Promise(() => undefined));
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(mockApi.titleCards).toHaveBeenCalled());
    expect(screen.getByTestId('winner-poster')).toBeTruthy();
    expect(screen.getByTestId('winner-loading')).toBeTruthy();
  });

  it('retries a failed card read', async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    mockApi.titleCards.mockResolvedValue({ status: 'rate_limited' });
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText("Couldn't load the film.")).toBeTruthy(), {
      timeout: 4000,
    });
    mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [card] });
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
  });

  it('releases the room guards and goes Home when Home is pressed', async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    const released = jest.fn();
    const off = registerRoomGuard(released);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    fireEvent.press(await screen.findByRole('button', { name: 'Back to Home' }));
    expect(released).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('the solo pick', () => {
  beforeEach(() => {
    mockMode = 'solo';
  });

  it("shows the player's film with its own eyebrow, no single-film line, no analytics and Done", async () => {
    mockApi.roomMatches.mockResolvedValue([match('finale', 1)]);
    mockApi.rounds.mockResolvedValue([]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    expect(screen.getByText("Tonight's pick", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText("Tonight's pick: Past Lives")).toBeTruthy();
    expect(screen.queryByText('The only film anyone liked')).toBeNull();
    expect(track).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Back to Play'));
    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it("says none of the player's services has it when the list is empty", async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    expect(screen.getByText('None of your services has it any more.')).toBeTruthy();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeTruthy();
  });
});

async function pressText(text: string) {
  fireEvent.press(await screen.findByText(text));
}

const seatsFor = (role: 'host' | 'guest') => [
  { member_id: 'm1', display_name: 'Harry', avatar_key: 'blue', role, is_me: true, left_at: null },
  {
    member_id: 'm2',
    display_name: 'Ana',
    avatar_key: 'teal',
    role: role === 'host' ? 'guest' : 'host',
    is_me: false,
    left_at: null,
  },
];

describe('play again and the join offer', () => {
  beforeEach(() => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
  });

  it('shows Play again to the host, pick or not, and Home small', async () => {
    mockSeats = seatsFor('host');
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    expect(await screen.findByRole('button', { name: /Start another game/ })).toBeTruthy();
    expect(screen.getByText('Play again')).toBeTruthy();
  });

  it('shows Play again to the host when nothing was picked', async () => {
    mockApi.roomMatches.mockResolvedValue([match('majority', null)]);
    mockSeats = seatsFor('host');
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    expect(await screen.findByText('Play again', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('opens the new lobby on ok, keeping the new room and releasing the guards', async () => {
    mockSeats = seatsFor('host');
    mockApi.playAgain.mockResolvedValue({ status: 'ok', room_id: 'r2', code: '654321' });
    const released = jest.fn();
    const off = registerRoomGuard(released);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await pressText('Play again');
    await waitFor(() => expect(mockApi.playAgain).toHaveBeenCalled());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r2/lobby'));
    expect(mockApi.playAgain).toHaveBeenCalledWith({ room_id: 'r1' });
    expect(mockKeep).toHaveBeenCalledWith({ id: 'r2', code: '654321' });
    expect(released).toHaveBeenCalled();
    off();
  });

  it.each([
    ['not_finished', "This game isn't over yet."],
    ['unknown_mode', "This game can't start again. Host a new movie night from Home."],
  ])('says %s and stays', async (status, message) => {
    mockSeats = seatsFor('host');
    mockApi.playAgain.mockResolvedValue({ status });
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await pressText('Play again');
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: message })),
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    if (status === 'unknown_mode') {
      await waitFor(() => expect(screen.queryByText('Play again')).toBeNull());
    }
  });

  it('opens the name screen on name_required', async () => {
    mockSeats = seatsFor('host');
    mockApi.playAgain.mockResolvedValue({ status: 'name_required' });
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await pressText('Play again');
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/name?edit=1'));
  });

  it('shows the Join offer instead of Play again, naming the host from the event', async () => {
    mockSeats = seatsFor('guest');
    mockNext = { next_room_id: 'r2', next_room_code: '654321' };
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    expect(await screen.findByTestId('join-offer', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('Another game is open')).toBeTruthy();
    await act(async () => mockNextHandler?.({ host_member_id: 'm2' }));
    expect(screen.getByText('Ana started another game')).toBeTruthy();
    expect(screen.queryByText('Play again')).toBeNull();
  });

  it("replaces the host's Play again with the offer too", async () => {
    mockSeats = seatsFor('host');
    mockNext = { next_room_id: 'r2', next_room_code: '654321' };
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    expect(await screen.findByTestId('join-offer', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText('Play again')).toBeNull();
  });

  it('joins with the code, the room and via play_again, then enters the new room', async () => {
    mockSeats = seatsFor('guest');
    mockNext = { next_room_id: 'r2', next_room_code: '654321' };
    mockApi.joinRoom.mockResolvedValue({
      status: 'ok',
      room_id: 'r2',
      member_id: 'm9',
      state: 'lobby',
    });
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await pressText('Join');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r2/lobby'));
    expect(mockApi.joinRoom).toHaveBeenCalledWith({
      code: '654321',
      ref: 'r2',
      via: 'play_again',
    });
  });

  it.each([
    [{ status: 'full', max_players: 8 }, 'This room is full (8 players).'],
    [{ status: 'locked' }, 'This room is locked. Ask the host to unlock it.'],
    [{ status: 'in_finale' }, "They're voting on the final pick right now. Catch the next game."],
    [{ status: 'closed' }, 'This movie night has ended.'],
    [{ status: 'not_found' }, 'This movie night has ended.'],
    [{ status: 'removed' }, 'The host removed you from this room.'],
    [
      { status: 'rate_limited' },
      'Too many tries. Ask the host for the link, or try again in a few minutes.',
    ],
  ])('shows the join copy for %j', async (answer, message) => {
    mockSeats = seatsFor('guest');
    mockNext = { next_room_id: 'r2', next_room_code: '654321' };
    mockApi.joinRoom.mockResolvedValue(answer);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await pressText('Join');
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the join sheet for a name on name_required', async () => {
    mockSeats = seatsFor('guest');
    mockNext = { next_room_id: 'r2', next_room_code: '654321' };
    mockApi.joinRoom.mockResolvedValue({ status: 'name_required' });
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await pressText('Join');
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/join/[code]',
        params: { code: '654321', r: 'r2' },
      }),
    );
  });
  it('does not show it to a guest', async () => {
    mockSeats = seatsFor('guest');
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await screen.findByText('Past Lives', {}, { timeout: 5000 });
    expect(screen.queryByText('Play again')).toBeNull();
  });

  it('does not show it in solo', async () => {
    mockSeats = seatsFor('host');
    mockMode = 'solo';
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await screen.findByText('Past Lives', {}, { timeout: 5000 });
    expect(screen.queryByText('Play again')).toBeNull();
  });
});
