import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Alert, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import RoomLobbyScreen from '@/app/room/[id]/lobby';
import RoomServicesScreen from '@/app/room/[id]/services';
import { showToast } from '@/components/ui/toast';
import { leaveRoom } from '@/features/room/leave';
import { haptics } from '@/lib/haptics';

jest.mock('@/api', () => ({
  api: {
    room: jest.fn(),
    roomSeats: jest.fn(),
    countryProviders: jest.fn(),
    gameModes: jest.fn(),
    startGame: jest.fn(),
    setMyProviders: jest.fn(),
    setSeatPrefs: jest.fn(),
  },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn(), press: jest.fn() } }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/room/leave', () => ({ leaveRoom: jest.fn() }));
jest.mock('@/features/invite/invite-link', () => ({
  useInvite: () => ({
    state: 'ready',
    link: 'https://x/join/482913',
    code: '482913',
    share: () => mockShare(),
    copy: jest.fn(),
    retry: jest.fn(),
  }),
}));

const mockShare = jest.fn();
let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));

const mockLive = {
  away: new Set<string>(),
  online: new Set<string>(),
  banner: null as null | 'offline',
  fresh: true,
};
jest.mock('@/features/room', () => ({
  ...jest.requireActual('@/features/room/queries'),
  useRoomPresence: () => ({ online: mockLive.online, away: mockLive.away }),
  useRoomConnection: () => ({ banner: mockLive.banner, fresh: mockLive.fresh }),
}));
jest.mock('@/components/screens/room/room-banner', () => ({ RoomBanner: () => null }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: () => ({ id: 'r1' }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
}));

type M = jest.Mock;
type ApiName =
  | 'room'
  | 'roomSeats'
  | 'countryProviders'
  | 'gameModes'
  | 'startGame'
  | 'setMyProviders'
  | 'setSeatPrefs';
const mockApi = api as unknown as Record<ApiName, M>;
const mockRouter = router as unknown as Record<string, M>;

function seat(id: string, name: string, joined: string, extra: Record<string, unknown> = {}) {
  return {
    member_id: id,
    room_id: 'r1',
    role: 'guest',
    display_name: name,
    avatar_key: 'blue',
    provider_ids: [],
    joined_at: `2026-11-03T10:00:${joined}Z`,
    left_at: null,
    is_me: false,
    ...extra,
  };
}
const lea = seat('a', 'Léa', '01', { role: 'host', is_me: true, provider_ids: [8, 999] });
const sam = seat('b', 'Sam', '02', { provider_ids: [337] });
const jo = seat('c', 'Jo', '03');
const gone = seat('d', 'Max', '04', { left_at: '2026-11-03T10:09:00Z' });

let mockSeats: unknown[] = [];
let mockState = 'lobby';
const providers = [
  { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
  { provider_id: 337, name: 'Disney+', logo_path: null, display_priority: 2 },
  { provider_id: 119, name: 'Prime Video', logo_path: null, display_priority: 3 },
];

let client: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 812 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}
const show = async () => {
  await render(<RoomLobbyScreen />, { wrapper: Providers });
};
const start = () => screen.getByRole('button', { name: 'Start swiping' });

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockOnline = true;
  mockLive.away = new Set();
  mockLive.online = new Set(['b']);
  mockLive.banner = null;
  mockLive.fresh = true;
  mockState = 'lobby';
  mockSeats = [lea, sam, jo, gone];
  mockApi.room.mockImplementation(async () => ({
    id: 'r1',
    code: '482913',
    mode: 'quick_match',
    state: mockState,
    country: 'FR',
    max_players: 10,
    provider_ids: [8, 337],
  }));
  mockApi.roomSeats.mockImplementation(async () => mockSeats);
  mockApi.countryProviders.mockResolvedValue(providers);
  mockApi.gameModes.mockResolvedValue([{ slug: 'quick_match', min_players: 2 }]);
  mockApi.startGame.mockResolvedValue({ status: 'ok' });
  mockApi.setMyProviders.mockResolvedValue({ status: 'ok' });
  mockApi.setSeatPrefs.mockResolvedValue({ status: 'ok' });
  (leaveRoom as unknown as M).mockResolvedValue({ status: 'ok' });
});

describe('the seats', () => {
  it('shows seated seats in join order, the crown on the host and "(you)" on the own seat', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Léa (you)')).toBeTruthy());
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('Jo')).toBeTruthy();
    expect(screen.queryByText('Max')).toBeNull();
    expect(screen.getByText('Host')).toBeTruthy();
  });

  it('skips unknown service ids and says when none is known', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Netflix')).toBeTruthy());
    expect(screen.getByText('Disney+')).toBeTruthy();
    expect(screen.getByText('No services yet')).toBeTruthy();
    expect(screen.queryByText(/999/)).toBeNull();
  });

  it('marks an away seat and drops the ticket count', async () => {
    mockLive.away = new Set(['c']);
    await show();
    await waitFor(() => expect(screen.getByText('Away')).toBeTruthy());
    expect(screen.getByText('2 of 10 players')).toBeTruthy();
  });

  it('shows the alone row for a lone host, and skeletons while loading', async () => {
    mockSeats = [lea];
    await show();
    await waitFor(() => expect(screen.getByText('Nobody else yet. Share the code.')).toBeTruthy());
  });

  it('shows no seat before the first read', async () => {
    mockApi.room.mockImplementation(() => new Promise(() => {}));
    await show();
    expect(screen.queryByText('Léa (you)')).toBeNull();
    expect(screen.queryByText('In the room')).toBeNull();
  });
});

describe('the host footer', () => {
  it('disables Start with the helper while fewer than the minimum are present', async () => {
    mockSeats = [lea];
    await show();
    await waitFor(() => expect(screen.getByText('You need 2 players here to start.')).toBeTruthy());
    expect(start()).toBeDisabled();
  });

  it('keeps Start enabled and names who is away, with the plural', async () => {
    mockLive.away = new Set(['b']);
    await show();
    await waitFor(() =>
      expect(screen.getByText('Sam is away. You can start without them.')).toBeTruthy(),
    );
    expect(start()).toBeEnabled();
  });

  it('uses the plural for two away seats', async () => {
    mockLive.away = new Set(['b', 'c']);
    mockSeats = [lea, sam, jo, seat('e', 'Zed', '05')];
    await show();
    await waitFor(() =>
      expect(screen.getByText('Sam and Jo are away. You can start without them.')).toBeTruthy(),
    );
  });

  it('disables Start when the room is not fresh', async () => {
    mockLive.fresh = false;
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    expect(start()).toBeDisabled();
  });

  it('shows the helper with the server need and an error haptic on not_enough_players', async () => {
    mockApi.startGame.mockResolvedValue({ status: 'not_enough_players', need: 3 });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(screen.getByText('You need 3 players here to start.')).toBeTruthy());
    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it('shows the toast and works again after a thrown call', async () => {
    mockApi.startGame.mockRejectedValueOnce(new Error('network'));
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "We couldn't start the game. Try again.",
      }),
    );
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(mockApi.startGame).toHaveBeenCalledTimes(2));
  });
});

describe('the guest', () => {
  beforeEach(() => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true, provider_ids: [337] },
    ];
  });

  it('waits for the host and opens the services sheet', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Waiting for Léa to start…')).toBeTruthy());
    expect(screen.queryByText('Start swiping')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Your services/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/services');
  });
});

describe('dealing', () => {
  beforeEach(() => {
    mockState = 'dealing';
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('covers the lobby on the host, asks again at 8 s and shows Retry at 20 s', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Shuffling the deck…')).toBeTruthy());
    expect(mockApi.startGame).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });
    expect(mockApi.startGame).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('This is taking longer than usual.')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(12_000);
    });
    expect(screen.getByText('This is taking longer than usual.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockApi.startGame).toHaveBeenCalledTimes(2);
  });

  it('covers the lobby on a guest, never asks again and has no Retry', async () => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true },
    ];
    await show();
    await waitFor(() => expect(screen.getByText('Shuffling the deck…')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(mockApi.startGame).not.toHaveBeenCalled();
    expect(screen.getByText('This is taking longer than usual.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('live changes', () => {
  it('toasts once when the own seat becomes host', async () => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true },
    ];
    await show();
    await waitFor(() => expect(screen.getByText('Waiting for Léa to start…')).toBeTruthy());
    mockSeats = [
      { ...lea, is_me: false, left_at: '2026-11-03T10:09:00Z' },
      { ...sam, is_me: true, role: 'host' },
    ];
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith({
      tone: 'info',
      title: "You're the host now",
      message: "Start whenever you're ready.",
    });
    await waitFor(() => expect(screen.getByText('Start swiping')).toBeTruthy());
  });

  it('announces an arrival and a departure', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await show();
    await waitFor(() => expect(screen.getByText('Jo')).toBeTruthy());
    expect(say).not.toHaveBeenCalled();
    mockSeats = [lea, sam, seat('e', 'Zed', '05')];
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(say).toHaveBeenCalledWith('Zed is here'));
  });
});

describe('leaving', () => {
  const alertButtons = () =>
    (Alert.alert as unknown as M).mock.calls[0][2] as { text: string; onPress?: () => void }[];

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  const askToLeave = async () => {
    await screen.findByText('In the room');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  };

  it('tells a guest they can come back', async () => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true },
    ];
    await show();
    await askToLeave();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave the room?',
      'You can come back with the code.',
      expect.any(Array),
    );
  });

  it('names the longest-seated present player as the next host', async () => {
    mockLive.away = new Set(['b']);
    await show();
    await askToLeave();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave the room?',
      'Jo becomes the host.',
      expect.any(Array),
    );
  });

  it('falls back to the longest-seated player when nobody is present', async () => {
    mockLive.away = new Set(['b', 'c']);
    await show();
    await askToLeave();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave the room?',
      'Sam becomes the host.',
      expect.any(Array),
    );
  });

  it('has no body for a host alone', async () => {
    mockSeats = [lea];
    await show();
    await waitFor(() => expect(screen.getByText('Nobody else yet. Share the code.')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(Alert.alert).toHaveBeenCalledWith('Leave the room?', undefined, expect.any(Array));
  });

  it('leaves, drops the room stack and shows Home', async () => {
    await show();
    await askToLeave();
    await act(async () => {
      alertButtons()[1]?.onPress?.();
    });
    expect(leaveRoom).toHaveBeenCalledWith('r1');
    expect(mockRouter.dismissAll).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/home');
  });

  it('toasts and stays offline, without calling', async () => {
    mockOnline = false;
    await show();
    await askToLeave();
    await act(async () => {
      alertButtons()[1]?.onPress?.();
    });
    expect(leaveRoom).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warn' }));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('stays with a toast when the call throws', async () => {
    (leaveRoom as unknown as M).mockRejectedValue(new Error('down'));
    await show();
    await askToLeave();
    await act(async () => {
      alertButtons()[1]?.onPress?.();
    });
    expect(showToast).toHaveBeenCalledWith({ tone: 'warn', title: 'The projector jammed' });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('opens the same alert on the Android back button', async () => {
    let pressBack: ((...args: never[]) => boolean | null | undefined) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
      pressBack = handler;
      return { remove: jest.fn() };
    });
    await show();
    await screen.findByText('In the room');
    await act(async () => {
      expect(pressBack?.()).toBe(true);
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave the room?',
      'Sam becomes the host.',
      expect.any(Array),
    );
  });
});

describe('sharing', () => {
  it('shares straight away from Share link, and Show QR and the top bar open the invite sheet', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Share link' }));
    expect(mockShare).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Show QR' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Invite friends' }));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/invite');
  });
});

describe('the services sheet', () => {
  beforeEach(() => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true, provider_ids: [337] },
    ];
  });
  const open = async () => {
    await render(<RoomServicesScreen />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Disney+' })).toBeChecked());
  };
  const done = () => screen.getByRole('button', { name: 'Done' });

  it('closes without a call when nothing changed', async () => {
    await open();
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockApi.setMyProviders).not.toHaveBeenCalled();
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
  });

  it('saves the profile before the seat when the selection changed', async () => {
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Netflix' }));
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockApi.setMyProviders).toHaveBeenCalledWith({ provider_ids: [337, 8] });
    expect(mockApi.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', provider_ids: [337, 8] });
    expect(mockApi.setMyProviders.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      mockApi.setSeatPrefs.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('stays open with the services toast when a call throws', async () => {
    mockApi.setMyProviders.mockRejectedValue(new Error('down'));
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Netflix' }));
    await fireEvent.press(done());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "We couldn't save your services. Try again.",
      }),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('closes when the game started meanwhile', async () => {
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'closed' });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Netflix' }));
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });
});
