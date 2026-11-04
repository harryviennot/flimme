import '@/i18n';

import type { RoomSeat } from '@flimme/contract';
import { render, screen } from '@testing-library/react-native';

import { MatchOverlayHost } from './match-overlay-host';

jest.mock('@/features/match/use-match-card', () => ({
  useMatchCard: () => ({ card: null, posterUri: null }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/storage', () => ({
  storage: {
    getItem: async () => null,
    setItem: async () => undefined,
    getItemSync: () => null,
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  },
}));
jest.mock('@/components/ui/marquee-bulbs', () => ({ MarqueeBulbs: () => null }));

const seat = (id: string, name: string, joined: string, left: string | null = null): RoomSeat =>
  ({
    member_id: id,
    room_id: 'r1',
    role: 'guest',
    display_name: name,
    avatar_key: 'teal',
    provider_ids: [],
    joined_at: joined,
    left_at: left,
    is_me: false,
  }) as unknown as RoomSeat;

describe('the match overlay host', () => {
  it('shows the seated players in join order, and not a seat that left', async () => {
    await render(
      <MatchOverlayHost
        roomId="r1"
        match={{ title_id: 7, likes: 2, of: 2 }}
        seats={[
          seat('c', 'Zed', '2026-11-03T10:03:00Z'),
          seat('x', 'Gone', '2026-11-03T10:01:00Z', '2026-11-03T11:00:00Z'),
          seat('a', 'Amy', '2026-11-03T10:00:00Z'),
        ]}
        onContinue={jest.fn()}
      />,
    );
    expect(screen.getByLabelText(/^Everyone in the room: Amy,? and Zed$/)).toBeTruthy();
    expect(screen.queryByLabelText('Gone')).toBeNull();
  });

  it('renders nothing without a match', async () => {
    await render(<MatchOverlayHost roomId="r1" match={null} seats={[]} onContinue={jest.fn()} />);
    expect(screen.queryByTestId('match-overlay')).toBeNull();
  });
});
