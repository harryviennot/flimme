import i18n from '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { RoomBanner } from './room-banner';

let mockBanner: 'offline' | 'reconnecting' | 'stillTrying' | null = null;
jest.mock('@/features/room', () => ({
  useRoomConnection: () => ({ banner: mockBanner, fresh: true }),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('RoomBanner', () => {
  it('says "Offline: 6 swipes waiting" while offline with votes in the queue', async () => {
    mockBanner = 'offline';
    await render(<RoomBanner roomId="r" waitingVotes={6} />);
    expect(screen.getByText('Offline: 6 swipes waiting')).toBeTruthy();
  });

  it('says one swipe in the singular', async () => {
    mockBanner = 'offline';
    await render(<RoomBanner roomId="r" waitingVotes={1} />);
    expect(screen.getByText('Offline: 1 swipe waiting')).toBeTruthy();
  });

  it('falls back to the room note when nothing waits', async () => {
    mockBanner = 'offline';
    await render(<RoomBanner roomId="r" waitingVotes={0} />);
    expect(screen.getByText("You're offline. The room catches up when you're back.")).toBeTruthy();
  });

  it('goes with the banner: online, nothing shows even with votes waiting', async () => {
    mockBanner = null;
    await render(<RoomBanner roomId="r" waitingVotes={6} />);
    expect(screen.queryByText(/swipes waiting/)).toBeNull();
  });

  it('keeps the reconnecting message when it is not the phone that is offline', async () => {
    mockBanner = 'reconnecting';
    await render(<RoomBanner roomId="r" waitingVotes={6} />);
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
  });

  it('says it in French too', async () => {
    await i18n.changeLanguage('fr');
    mockBanner = 'offline';
    await render(<RoomBanner roomId="r" waitingVotes={6} />);
    expect(screen.getByText('Hors ligne : 6 votes en attente')).toBeTruthy();
    await screen.unmount();
    await i18n.changeLanguage('en');
  });
});
