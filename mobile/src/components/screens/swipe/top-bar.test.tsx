import i18n from '@/i18n';

import type { RoomSeat } from '@flimme/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as renderUi, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { createShortlistController } from '@/features/shortlist/controller';
import { ShortlistProvider } from '@/features/shortlist/context';

import { SwipeTopBar } from './top-bar';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/api', () => ({ api: {} }));
jest.mock('@/features/shortlist/use-shortlist-cards', () => ({
  useShortlistCards: (_room: string, ids: number[]) =>
    new Map(ids.map((id) => [id, { title: `Film ${id}`, posterUri: null }])),
}));
jest.mock('@/features/app-config/use-app-config', () => ({
  useAppConfig: () => ({ data: undefined }),
}));

let mockShortlist = createShortlistController({
  onBeat: () => undefined,
  onMismatch: () => undefined,
});
function render(ui: ReactElement) {
  return renderUi(
    <QueryClientProvider client={new QueryClient()}>
      <ShortlistProvider value={mockShortlist}>{ui}</ShortlistProvider>
    </QueryClientProvider>,
  );
}
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

const mockAsk = jest.fn();
jest.mock('@/features/lobby/leave-context', () => ({ useAskToLeave: () => mockAsk }));

function seat(id: string, name: string, joined: number, extra: Partial<RoomSeat> = {}): RoomSeat {
  return {
    member_id: id,
    display_name: name,
    avatar_key: 'blue',
    role: 'guest',
    joined_at: new Date(joined).toISOString(),
    left_at: null,
    swipe_count: 0,
    ...extra,
  } as RoomSeat;
}

let mockSeats = [
  seat('me', 'Harry', 1, { role: 'host' }),
  seat('sam', 'Sam', 2),
  seat('jo', 'Jo', 3),
];
let mockPresence = {
  online: new Set(['sam']),
  away: new Set(['jo']),
  progress: new Map<string, { swipe_count: number; done: boolean }>(),
};
jest.mock('@/features/room', () => ({
  useRoomSeats: () => ({ data: mockSeats }),
  useMySeat: () => mockSeats.find((s) => s.member_id === 'me'),
  useRoomPresence: () => mockPresence,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('SwipeTopBar', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockShortlist = createShortlistController({
      onBeat: () => undefined,
      onMismatch: () => undefined,
    });
    mockAsk.mockClear();
    mockSeats = [
      seat('me', 'Harry', 1, { role: 'host' }),
      seat('sam', 'Sam', 2),
      seat('jo', 'Jo', 3),
    ];
    mockPresence = {
      online: new Set(['sam']),
      away: new Set(['jo']),
      progress: new Map([['sam', { swipe_count: 10, done: false }]]),
    };
  });

  it('is one button that says how many play, whose room it is, and who is away', async () => {
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    expect(screen.getByLabelText("3 players in Harry's room, 1 away")).toBeTruthy();
    expect(screen.getAllByTestId('player-disc')).toHaveLength(3);
  });

  it('shows no answer count in the bar: the counts live in the players sheet', async () => {
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    expect(screen.queryByText('7')).toBeNull();
    expect(screen.queryByText('10')).toBeNull();
    expect(screen.queryByLabelText(/films/)).toBeNull();
  });

  it('marks a finished player with a check badge, and says so for a screen reader', async () => {
    mockPresence.progress = new Map([['sam', { swipe_count: 20, done: true }]]);
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    expect(screen.getByLabelText("3 players in Harry's room, 1 is done, 1 away")).toBeTruthy();
    expect(screen.getAllByTestId('player-done')).toHaveLength(1);
  });

  it('opens the players sheet from the whole stack', async () => {
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    fireEvent.press(screen.getByTestId('player-stack'));
    expect(mockPush).toHaveBeenCalledWith('/room/r/players');
  });

  it('ends in a +N disc when the seats do not fit, and never hides the own seat', async () => {
    mockSeats = [
      ...Array.from({ length: 9 }, (_, i) => seat(`p${i}`, `P${i}`, i + 2)),
      seat('me', 'Harry', 20),
    ];
    mockPresence.away = new Set();
    await render(<SwipeTopBar roomId="r" count={0} done={false} />);
    expect(screen.getAllByTestId('player-disc')).toHaveLength(5);
    expect(screen.getByText('+5')).toBeTruthy();
    expect(screen.getByLabelText('Harry')).toBeTruthy();
    expect(screen.queryByLabelText('P8')).toBeNull();
  });

  it('shows the empty shortlist, then the posters of the films read back, never who liked them', async () => {
    await render(<SwipeTopBar roomId="r" count={0} done={false} />);
    expect(screen.getByText('0/3')).toBeTruthy();
    expect(screen.getByLabelText('Shortlist empty. The vote starts at 3 matches.')).toBeTruthy();
    expect(screen.getAllByTestId('shortlist-slot-empty')).toHaveLength(3);
  });

  it('reads the shortlist back with its count and titles', async () => {
    mockShortlist.readBack([4, 9]);
    await render(<SwipeTopBar roomId="r" count={0} done={false} />);
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByLabelText('Shortlist, 2 of 3: Film 4 and Film 9')).toBeTruthy();
    expect(screen.getAllByTestId('shortlist-slot-filled')).toHaveLength(2);
    expect(screen.getAllByTestId('shortlist-slot-empty')).toHaveLength(1);
  });

  it('shows no shortlist in a mode whose first match is the pick', async () => {
    mockShortlist.setSize(1);
    await render(<SwipeTopBar roomId="r" count={0} done={false} />);
    expect(screen.queryByTestId('shortlist')).toBeNull();
  });

  it('asks to leave from the Leave button', async () => {
    await render(<SwipeTopBar roomId="r" count={0} done={false} />);
    fireEvent.press(screen.getByLabelText('Leave the room'));
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });
});
