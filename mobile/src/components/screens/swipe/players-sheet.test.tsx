import i18n from '@/i18n';

import type { RoomSeat } from '@flimme/contract';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PlayersSheet } from './players-sheet';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/api', () => ({ api: {} }));

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: () => mockBack(),
  },
}));

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
  seat('al', 'Alex', 4),
];
const mockPresence = {
  online: new Set(['sam', 'al']),
  away: new Set(['jo']),
  progress: new Map([
    ['me', { swipe_count: 7, done: false }],
    ['sam', { swipe_count: 13, done: false }],
    ['al', { swipe_count: 20, done: true }],
  ]),
};
jest.mock('@/features/room', () => ({
  useRoomSeats: () => ({ data: mockSeats }),
  useMySeat: () => mockSeats[0],
  useRoomPresence: () => mockPresence,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('PlayersSheet', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockBack.mockClear();
  });

  it('lists every seat with its count: exact for you, in steps of 5 for the others', async () => {
    await render(<PlayersSheet roomId="r" />);
    expect(screen.getByText('Players')).toBeTruthy();
    expect(screen.getByText('Harry (you)')).toBeTruthy();
    expect(screen.getByText('7 films')).toBeTruthy();
    expect(screen.getByText('10 films')).toBeTruthy();
    expect(screen.queryByText('13 films')).toBeNull();
  });

  it('says Done and away, one tag per row', async () => {
    await render(<PlayersSheet roomId="r" />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Away')).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();
  });

  it('opens the seat sheet in its place from another row, and nothing from the own', async () => {
    await render(<PlayersSheet roomId="r" />);
    fireEvent.press(screen.getByLabelText('Sam, here, 10 films'));
    expect(mockReplace).toHaveBeenCalledWith('/room/r/seat/sam');
    fireEvent.press(screen.getByLabelText('Harry (you), here, host, 7 films'));
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', async () => {
    await render(<PlayersSheet roomId="r" />);
    fireEvent.press(screen.getByLabelText('Close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
