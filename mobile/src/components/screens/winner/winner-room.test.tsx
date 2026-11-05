import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { registerRoomGuard } from '@/features/room';
import { track } from '@/lib/analytics';

import { WinnerRoom } from './winner-room';

jest.mock('@/api', () => ({
  api: { roomMatches: jest.fn(), rounds: jest.fn(), titleCards: jest.fn() },
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://image.tmdb.org/t/p' } }),
}));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
const mockExit = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
let mockMode = 'quick_match';
jest.mock('@/features/solo/leave', () => ({ isLeavingSolo: () => false }));
jest.mock('@/features/room', () => ({
  useRoom: () => ({ data: { mode: mockMode } }),
  ...jest.requireActual('@/features/room/leave-guard'),
  ROOM_KEY: (id: string) => ['room', id],
  useExitRoomToHome: () => mockExit,
  // Three seats present and one that left.
  useRoomSeats: () => ({
    data: [{ left_at: null }, { left_at: null }, { left_at: null }, { left_at: 'x' }],
  }),
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/features/room/match-shown', () => ({ useMatchShown: () => true }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/marquee-bulbs', () => ({ MarqueeBulbs: () => null }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const mockApi = api as unknown as Record<'roomMatches' | 'rounds' | 'titleCards', jest.Mock>;

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
  mockApi.rounds.mockResolvedValue([{ id: 'x' }]);
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [card] });
});

describe('Share recap on the winner route', () => {
  it('pushes the recap sheet of the room', async () => {
    mockApi.roomMatches.mockResolvedValue([match('unanimous', 1)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Share recap')).toBeTruthy());
    fireEvent.press(screen.getByText('Share recap'));
    expect(mockPush).toHaveBeenCalledWith('/room/r1/recap');
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
