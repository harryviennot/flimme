import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { registerRoomGuard } from '@/features/room';

import { WinnerRoom } from './winner-room';

jest.mock('@/api', () => ({
  api: { roomMatches: jest.fn(), rounds: jest.fn(), titleCards: jest.fn() },
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: { tmdb_image_base: 'https://image.tmdb.org/t/p' } }),
}));
jest.mock('@/features/network', () => ({ useOnline: () => true }));
const mockExit = jest.fn();
jest.mock('@/features/room', () => ({
  ...jest.requireActual('@/features/room/leave-guard'),
  ROOM_KEY: (id: string) => ['room', id],
  useExitRoomToHome: () => mockExit,
}));
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
  mockApi.rounds.mockResolvedValue([{ id: 'x' }]);
  mockApi.titleCards.mockResolvedValue({ status: 'ok', cards: [card] });
});

describe('the winner room', () => {
  it.each(['unanimous', 'majority', 'finale'])('shows a %s pick the same way', async (kind) => {
    mockApi.roomMatches.mockResolvedValue([match(kind, 1)]);
    await render(<WinnerRoom roomId="r1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Past Lives')).toBeTruthy());
    expect(screen.getByText('2023 · 1 h 45')).toBeTruthy();
    expect(screen.queryByText('The only film anyone liked')).toBeNull();
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
