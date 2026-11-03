import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { api } from '@/api';
import { keptRoomStore } from '@/features/room/kept-room';

import { useLeaveLine } from './leave-line';

jest.mock('@/api', () => ({ api: { room: jest.fn(), roomSeats: jest.fn() } }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

const room = api.room as jest.Mock;
const roomSeats = api.roomSeats as jest.Mock;

const seat = (over: Record<string, unknown>) => ({
  role: 'guest',
  display_name: 'Zoé',
  left_at: null,
  is_me: false,
  ...over,
});
const SEATS = [
  seat({ role: 'host', display_name: 'Harry' }),
  seat({ display_name: 'Léa', is_me: true }),
];

function line(linkRef?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLeaveLine(linkRef), { wrapper });
}

beforeEach(() => {
  room.mockReset().mockResolvedValue({ state: 'lobby' });
  roomSeats.mockReset().mockResolvedValue(SEATS);
  keptRoomStore.getState().keep({ id: 'A', code: '482913' });
});

describe('useLeaveLine', () => {
  it('names the kept room by its host', async () => {
    const { result } = await line('B');
    await waitFor(() => expect(result.current).toEqual({ kind: 'host', name: 'Harry' }));
  });

  it('follows the crown when the host leaves', async () => {
    roomSeats.mockResolvedValue([
      seat({ role: 'host', display_name: 'Harry', left_at: 'x' }),
      seat({ role: 'host', display_name: 'Zoé' }),
      seat({ display_name: 'Léa', is_me: true }),
    ]);
    const { result } = await line('B');
    await waitFor(() => expect(result.current).toEqual({ kind: 'host', name: 'Zoé' }));
  });

  it('says "your other room" while the read is pending', async () => {
    roomSeats.mockReturnValue(new Promise(() => {}));
    const { result } = await line('B');
    expect(result.current).toEqual({ kind: 'other' });
  });

  it('says "your other room" when the read failed', async () => {
    roomSeats.mockRejectedValue(new Error('down'));
    const { result } = await line('B');
    await waitFor(() => expect(roomSeats).toHaveBeenCalled());
    expect(result.current).toEqual({ kind: 'other' });
  });

  it('says "your other room" when the player is the host', async () => {
    roomSeats.mockResolvedValue([seat({ role: 'host', display_name: 'Léa', is_me: true })]);
    const { result } = await line('B');
    await waitFor(() => expect(roomSeats).toHaveBeenCalled());
    expect(result.current).toEqual({ kind: 'other' });
  });

  it.each([
    ['done', { state: 'done' }],
    ['abandoned', { state: 'abandoned' }],
    ['null', null],
  ])('shows nothing and forgets a kept room that reads %s', async (_n, answer) => {
    room.mockResolvedValue(answer);
    const { result } = await line('B');
    await waitFor(() => expect(keptRoomStore.getState().room).toBeNull());
    expect(result.current).toBeNull();
  });

  it('shows nothing and forgets the room when the own seat has left', async () => {
    roomSeats.mockResolvedValue([
      seat({ role: 'host', display_name: 'Harry' }),
      seat({ is_me: true, left_at: '2026-11-03T10:00:00Z' }),
    ]);
    const { result } = await line('B');
    await waitFor(() => expect(keptRoomStore.getState().room).toBeNull());
    expect(result.current).toBeNull();
  });

  it('shows nothing when the link is the kept room, or no room is kept', async () => {
    expect((await line('A')).result.current).toBeNull();
    keptRoomStore.getState().forget();
    expect((await line('B')).result.current).toBeNull();
    expect(keptRoomStore.getState().room).toBeNull();
  });
});
