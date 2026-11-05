import i18n from '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { track } from '@/lib/analytics';

import { RoomBanner } from './room-banner';

let mockBanner: 'offline' | 'reconnecting' | 'stillTrying' | null = null;
jest.mock('@/features/room', () => ({
  useRoomConnection: () => ({ banner: mockBanner, fresh: true }),
}));

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('expo-router', () => ({ useSegments: () => [] }));

beforeEach(() => jest.clearAllMocks());

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

  it('reports error:view once for what the banner says, and nothing when it is gone', async () => {
    mockBanner = null;
    const view = await render(<RoomBanner roomId="r" />);
    expect(track).not.toHaveBeenCalled();
    mockBanner = 'offline';
    await view.rerender(<RoomBanner roomId="r" waitingVotes={2} />);
    await view.rerender(<RoomBanner roomId="r" waitingVotes={3} />);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('error:view', { code: 'offline', screen: '/' });
    mockBanner = 'reconnecting';
    await view.rerender(<RoomBanner roomId="r" />);
    expect(track).toHaveBeenLastCalledWith('error:view', { code: 'reconnecting', screen: '/' });
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
