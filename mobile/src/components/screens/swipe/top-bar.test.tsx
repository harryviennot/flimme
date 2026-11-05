import i18n from '@/i18n';

import type { RoomSeat } from '@flimme/contract';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SwipeTopBar } from './top-bar';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
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

const mockSeats = [
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
  useMySeat: () => mockSeats[0],
  useRoomPresence: () => mockPresence,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('SwipeTopBar', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAsk.mockClear();
    mockPresence = {
      online: new Set(['sam']),
      away: new Set(['jo']),
      progress: new Map([['sam', { swipe_count: 10, done: false }]]),
    };
  });

  it('shows the pills in join order with the own count, the others from presence, and the crown', async () => {
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    expect(screen.getByLabelText('You, 7 films, host')).toBeTruthy();
    expect(screen.getByLabelText('Sam, 10 films')).toBeTruthy();
    expect(screen.getByLabelText('Jo, away')).toBeTruthy();
  });

  it('says Done and names the player for a screen reader', async () => {
    mockPresence.progress = new Map([['sam', { swipe_count: 20, done: true }]]);
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    expect(screen.getByLabelText('Sam is done')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('opens the seat sheet from another pill, and nothing from the own', async () => {
    await render(<SwipeTopBar roomId="r" count={7} done={false} />);
    fireEvent.press(screen.getByLabelText('Sam, 10 films'));
    expect(mockPush).toHaveBeenCalledWith('/room/r/seat/sam');
    fireEvent.press(screen.getByLabelText('You, 7 films, host'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('asks to leave from the Leave button', async () => {
    await render(<SwipeTopBar roomId="r" count={0} done={false} />);
    fireEvent.press(screen.getByLabelText('Leave the room'));
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });
});
