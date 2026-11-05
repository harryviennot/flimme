import { renderHook } from '@testing-library/react-native';

import { track } from '@/lib/analytics';

import { gamesStore } from './games';
import { rememberLinkJoin } from './journey';
import { useFirstCardView } from './use-first-card';

let mockRoom: { mode: string; started_at: string | null } | undefined;
let mockSeats: { left_at: string | null }[] | undefined;
jest.mock('@/features/room', () => ({
  useRoom: () => ({ data: mockRoom }),
  useRoomSeats: () => ({ data: mockSeats }),
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));

const started = new Date(Date.now() - 2_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  gamesStore.setState({ played: 0, counted: [], firstCard: [] });
  mockRoom = { mode: 'quick_match', started_at: started };
  mockSeats = [{ left_at: null }, { left_at: null }, { left_at: null }, { left_at: 'x' }];
});

describe('game:first_card_view', () => {
  it('is sent once per game, with the room size as a bucket', async () => {
    const view = await renderHook(() => useFirstCardView('room-a', true));
    await view.rerender({});
    expect(track).toHaveBeenCalledTimes(1);
    const [name, props] = (track as jest.Mock).mock.calls[0];
    expect(name).toBe('game:first_card_view');
    expect(props.mode).toBe('quick_match');
    expect(props.room_size).toBe('3_4');
    expect(props.ms_since_swiping).toBeGreaterThanOrEqual(2_000);
    expect(props).not.toHaveProperty('ms_since_link_open');
  });

  it('is sent again for a new game', async () => {
    await renderHook(() => useFirstCardView('room-a', true));
    await renderHook(() => useFirstCardView('room-b', true));
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('waits for a card', async () => {
    const view = await renderHook((drawn: boolean) => useFirstCardView('room-a', drawn), {
      initialProps: false,
    });
    expect(track).not.toHaveBeenCalled();
    await view.rerender(true);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('carries ms_since_link_open for a link join only', async () => {
    rememberLinkJoin('room-link', Date.now() - 5_000);
    await renderHook(() => useFirstCardView('room-link', true));
    const props = (track as jest.Mock).mock.calls[0][1];
    expect(props.ms_since_link_open).toBeGreaterThanOrEqual(5_000);
  });

  it('sends nothing before the room and its seats are read', async () => {
    mockSeats = undefined;
    await renderHook(() => useFirstCardView('room-a', true));
    expect(track).not.toHaveBeenCalled();
  });
});
