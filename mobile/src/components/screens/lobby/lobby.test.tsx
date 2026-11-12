import i18n from '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api } from '@/api';
import RoomLobbyScreen from '@/app/room/[id]/lobby';
import { RoomLeaveGuard } from '@/components/screens/room/leave-guard';
import RoomReportSheet from '@/app/room/[id]/report/[memberId]';
import RoomSeatSheet from '@/app/room/[id]/seat/[memberId]';
import RoomInviteScreen from '@/app/room/[id]/invite';
import RoomServicesScreen from '@/app/room/[id]/services';
import RoomGenresScreen from '@/app/room/[id]/genres';
import GenreStepScreen from '@/app/room/[id]/genre-step';
import { showToast } from '@/components/ui/toast';
import { leaveRoom } from '@/features/room/leave';
import { reportError } from '@/lib/sentry';
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
    setSeatSkips: jest.fn(),
    roomGenres: jest.fn(),
    genres: jest.fn(),
    reportMember: jest.fn(),
    removeMember: jest.fn(),
    setRoomLocked: jest.fn(),
  },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptics: { error: jest.fn(), press: jest.fn() } }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/room/leave', () => ({ leaveRoom: jest.fn() }));
jest.mock('@/features/invite/invite-link', () => ({
  displayLink: (link: string) => link.replace('https://', ''),
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
let mockMemberId = 'b';
let mockSegments = ['room', '[id]', 'genres'];
let mockOnline = true;
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline }));

const mockLive = {
  away: new Set<string>(),
  online: new Set<string>(),
  banner: null as null | 'offline',
  fresh: true,
};
const mockExitToHome = jest.fn();
// The handlers the lobby registered for room events; a test calls them like the channel would.
const mockEvents: Record<string, (payload: unknown) => void> = {};
const emitStateChanged = (payload: unknown) => {
  if (!mockEvents.state_changed) throw new Error('the lobby did not listen for state_changed');
  mockEvents.state_changed(payload);
};
jest.mock('@/features/room', () => ({
  ...jest.requireActual('@/features/room/queries'),
  ...jest.requireActual('@/features/room/leave-guard'),
  useExitRoomToHome: () => mockExitToHome,
  useRoomEvent: (_id: string, event: string, handler: (payload: unknown) => void) => {
    mockEvents[event] = handler;
  },
  useRoomPresence: () => ({ online: mockLive.online, away: mockLive.away }),
  useRoomConnection: () => ({ banner: mockLive.banner, fresh: mockLive.fresh }),
}));
jest.mock('@/components/screens/room/room-banner', () => ({ RoomBanner: () => null }));

// The room guard asks through React Navigation's prevent-remove; the test calls what it was given.
const mockPrevent: { on: boolean; ask: () => void } = { on: false, ask: () => {} };
jest.mock('expo-router', () => ({
  usePreventRemove: (on: boolean, ask: () => void) => {
    mockPrevent.on = on;
    mockPrevent.ask = ask;
    return jest.fn();
  },
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: () => ({ id: 'r1', memberId: mockMemberId }),
  useSegments: () => mockSegments,
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
  | 'setSeatPrefs'
  | 'setSeatSkips'
  | 'roomGenres'
  | 'genres'
  | 'reportMember'
  | 'removeMember'
  | 'setRoomLocked';
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
let mockLocked = false;
const providers = [
  { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
  { provider_id: 337, name: 'Disney+', logo_path: null, display_priority: 2 },
  { provider_id: 119, name: 'Prime Video', logo_path: null, display_priority: 3 },
];

const genreRows = [
  { id: 35, slug: 'comedy', names: { fr: 'Comédie', en: 'Comedy' } },
  { id: 27, slug: 'horror', names: { fr: 'Horreur', en: 'Horror' } },
  { id: 18, slug: 'drama', names: { fr: 'Drame', en: 'Drama' } },
  { id: 12, slug: 'adventure', names: { fr: 'Aventure', en: 'Adventure' } },
  { id: 16, slug: 'animation', names: { fr: 'Animation', en: 'Animation' } },
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
  await render(
    <RoomLeaveGuard roomId="r1">
      <RoomLobbyScreen />
    </RoomLeaveGuard>,
    { wrapper: Providers },
  );
};
const start = () => screen.getByRole('button', { name: 'Start swiping' });

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockOnline = true;
  mockSegments = ['room', '[id]', 'genres'];
  mockLive.away = new Set();
  mockLive.online = new Set(['b']);
  mockLive.banner = null;
  mockLive.fresh = true;
  mockState = 'lobby';
  mockLocked = false;
  mockSeats = [lea, sam, jo, gone];
  mockApi.room.mockImplementation(async () => ({
    id: 'r1',
    code: '482913',
    mode: 'quick_match',
    state: mockState,
    country: 'FR',
    max_players: 10,
    provider_ids: [8, 337],
    locked: mockLocked,
  }));
  mockApi.roomSeats.mockImplementation(async () => mockSeats);
  mockApi.countryProviders.mockResolvedValue(providers);
  mockApi.gameModes.mockResolvedValue([{ slug: 'quick_match', min_players: 2 }]);
  mockApi.startGame.mockResolvedValue({ status: 'ok' });
  mockApi.removeMember.mockResolvedValue({ status: 'ok' });
  mockApi.setRoomLocked.mockResolvedValue({ status: 'ok', locked: true });
  mockApi.setMyProviders.mockResolvedValue({ status: 'ok' });
  mockApi.setSeatPrefs.mockResolvedValue({ status: 'ok' });
  mockApi.setSeatSkips.mockResolvedValue({ status: 'ok' });
  mockApi.genres.mockResolvedValue(genreRows);
  mockApi.roomGenres.mockResolvedValue({
    status: 'ok',
    options: [
      { genre_id: 35, count: 3 },
      { genre_id: 27, count: 0 },
      { genre_id: 18, count: 1 },
      { genre_id: 12, count: 2 },
    ],
    mine: [],
    out: [],
    skips: { genre_ids: [], people: [] },
  });
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
    const order = ['Léa (you)', 'Sam', 'Jo'].map(
      (n) => screen.toJSON() && JSON.stringify(screen.toJSON()).indexOf(n),
    );
    expect(order).toEqual([...order].sort((a, b) => Number(a) - Number(b)));
  });

  it('draws a seat whose avatar key is "default" blue', async () => {
    mockSeats = [lea, seat('b', 'Sam', '02', { avatar_key: 'default' })];
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    expect(screen.getByLabelText('Sam').props.className).toContain('bg-avatar-blue');
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

describe('too few films', () => {
  const tooFew = (eligible: number) =>
    mockApi.startGame.mockResolvedValue({ status: 'too_few_films', eligible });

  it('shows the count under Start with an error haptic, and Start stays enabled', async () => {
    tooFew(12);
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() =>
      expect(
        screen.getByText(
          'Only 12 films fit tonight. Ask everyone to add their services or skip less.',
        ),
      ).toBeTruthy(),
    );
    expect(haptics.error).toHaveBeenCalledTimes(1);
    expect(start()).toBeEnabled();
  });

  it('uses the singular for 1 and its own line for 0', async () => {
    tooFew(1);
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() =>
      expect(
        screen.getByText(
          'Only 1 film fits tonight. Ask everyone to add their services or skip less.',
        ),
      ).toBeTruthy(),
    );
    tooFew(0);
    await fireEvent.press(start());
    await waitFor(() =>
      expect(
        screen.getByText('No film fits tonight. Ask everyone to add their services or skip less.'),
      ).toBeTruthy(),
    );
  });

  it('clears on the next Start tap and the new answer decides', async () => {
    tooFew(12);
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(screen.getByText(/Only 12 films fit/)).toBeTruthy());
    let release: (value: unknown) => void = () => {};
    mockApi.startGame.mockReturnValue(new Promise((resolve) => (release = resolve)));
    await fireEvent.press(start());
    expect(screen.queryByText(/Only 12 films fit/)).toBeNull();
    await act(async () => release({ status: 'ok' }));
    expect(screen.queryByText(/films fit/)).toBeNull();
  });

  it('shows the count a state_changed brings after a dealing answer, on the host only', async () => {
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await act(async () => {
      emitStateChanged({ state: 'lobby', reason: 'too_few_films', eligible: 7 });
    });
    expect(
      screen.getByText(
        'Only 7 films fit tonight. Ask everyone to add their services or skip less.',
      ),
    ).toBeTruthy();
    expect(haptics.error).toHaveBeenCalledTimes(1);
    await act(async () => {
      emitStateChanged({ state: 'swiping' });
    });
    expect(screen.getByText(/Only 7 films fit/)).toBeTruthy();
  });

  it('shows nothing on a guest, whose overlay closes when the room is back in the lobby', async () => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true },
    ];
    mockState = 'dealing';
    await show();
    await waitFor(() => expect(screen.getByText('Shuffling the deck…')).toBeTruthy());
    mockState = 'lobby';
    await act(async () => {
      emitStateChanged({ state: 'lobby', reason: 'too_few_films', eligible: 7 });
      await client.invalidateQueries();
    });
    await waitFor(() => expect(screen.queryByText('Shuffling the deck…')).toBeNull());
    expect(screen.getByText('Waiting for Léa to start…')).toBeTruthy();
    expect(screen.queryByText(/films fit/)).toBeNull();
    expect(haptics.error).not.toHaveBeenCalled();
  });

  it('puts the players-needed line before the too-few line', async () => {
    mockApi.startGame.mockResolvedValue({ status: 'too_few_films', eligible: 5 });
    await show();
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(screen.getByText(/Only 5 films fit/)).toBeTruthy());
    mockApi.startGame.mockResolvedValue({ status: 'not_enough_players', need: 3 });
    await fireEvent.press(start());
    await waitFor(() => expect(screen.getByText('You need 3 players here to start.')).toBeTruthy());
    expect(screen.queryByText(/films fit/)).toBeNull();
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

  it('leaves, then goes Home through the one helper', async () => {
    await show();
    await askToLeave();
    await act(async () => {
      alertButtons()[1]?.onPress?.();
    });
    expect(leaveRoom).toHaveBeenCalledWith('r1');
    expect(mockExitToHome).toHaveBeenCalledTimes(1);
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
    expect(mockExitToHome).not.toHaveBeenCalled();
  });

  it('stays with a toast when the call throws', async () => {
    (leaveRoom as unknown as M).mockRejectedValue(new Error('down'));
    await show();
    await askToLeave();
    await act(async () => {
      alertButtons()[1]?.onPress?.();
    });
    expect(showToast).toHaveBeenCalledWith({ tone: 'warn', title: 'The projector jammed' });
    expect(mockExitToHome).not.toHaveBeenCalled();
  });

  it('guards the room once seated, and a back action asks before leaving', async () => {
    await show();
    await screen.findByText('In the room');
    expect(mockPrevent.on).toBe(true);
    await act(async () => {
      mockPrevent.ask();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave the room?',
      'Sam becomes the host.',
      expect.any(Array),
    );
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('does not guard a phone without a seat', async () => {
    mockSeats = [sam];
    await show();
    await waitFor(() => expect(mockPrevent.on).toBe(false));
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

describe('copying the code', () => {
  const ticket = () => screen.getByLabelText(/^Room code 4 8 2 9 1 3/);

  it('a long press copies the bare code, buzzes and shows the success toast', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    await fireEvent(ticket(), 'longPress');
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('482913'));
    expect(haptics.press).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({ tone: 'success', title: 'Code copied' }),
    );
  });

  it('a screen reader gets a Copy the code action that does the same', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    expect(ticket().props.accessibilityActions).toEqual([
      { name: 'copyCode', label: 'Copy the code' },
    ]);
    await fireEvent(ticket(), 'accessibilityAction', { nativeEvent: { actionName: 'copyCode' } });
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('482913'));
    expect(showToast).toHaveBeenCalledWith({ tone: 'success', title: 'Code copied' });
  });

  it('a plain tap does nothing', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    await fireEvent.press(ticket());
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
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

describe('your genres, in the lobby', () => {
  const rowName = /^Your genres tonight/;

  it('shows the row to a guest under Your services, optional with no picks', async () => {
    mockSeats = [
      { ...lea, is_me: false },
      { ...sam, is_me: true },
    ];
    await show();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Your genres tonight, Optional' })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole('button', { name: rowName }));
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/genres');
  });

  it('shows the row to the host too, above the lock', async () => {
    await show();
    await waitFor(() => expect(screen.getByRole('button', { name: rowName })).toBeTruthy());
    expect(screen.getByLabelText('Lock the room')).toBeTruthy();
  });

  it('names your own picks, and nobody elses', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [
        { genre_id: 35, count: 3 },
        { genre_id: 18, count: 1 },
      ],
      mine: [18, 35],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await show();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Your genres tonight, Comedy and Drama' }),
      ).toBeTruthy(),
    );
  });

  it('says nothing is offered when no genre has enough films, and the row does not open', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [],
      mine: [],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await show();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Your genres tonight, Nothing to pick tonight' }),
      ).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole('button', { name: rowName }));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('is dimmed and shut once the game is dealing: picks lock at Start', async () => {
    mockState = 'dealing';
    await show();
    // The shuffling overlay hides the lobby from a screen reader; the row is still there.
    const row = () => screen.getByRole('button', { name: rowName, hidden: true });
    await waitFor(() => expect(row()).toBeTruthy());
    await fireEvent.press(row());
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('never blocks Start: the host starts with no picks', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    await waitFor(() => expect(start()).toBeEnabled());
    await fireEvent.press(start());
    await waitFor(() => expect(mockApi.startGame).toHaveBeenCalledWith({ room_id: 'r1' }));
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
  });
});

describe('the genres sheet', () => {
  const open = async () => {
    await render(<RoomGenresScreen />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Comedy/ })).toBeTruthy());
  };
  const done = () => screen.getByRole('button', { name: 'Done' });

  it('shows the chips sorted by name with counts, never names', async () => {
    await open();
    const labels = screen
      .getAllByRole('checkbox')
      .map((chip) => chip.props.accessibilityLabel as string);
    expect(labels.filter((label) => !label.startsWith('Skip '))).toEqual([
      'Adventure, 2 players',
      'Comedy, 3 players',
      'Drama, 1 player',
      'Horror, 0 players',
    ]);
  });

  it('counts your own tap at once and sends only the genre ids on Done', async () => {
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Horror, 0 players' }));
    expect(screen.getByRole('checkbox', { name: 'Horror, 1 player' })).toBeChecked();
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockApi.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [27] });
  });

  it('stops a 4th pick with a gentle note, no toast, no call', async () => {
    await open();
    for (const name of [/^Comedy/, /^Horror/, /^Drama/]) {
      await fireEvent.press(screen.getByRole('checkbox', { name }));
    }
    expect(screen.queryByText('3 genres at most. Drop one to swap.')).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Adventure/ }));
    expect(screen.getByText('3 genres at most. Drop one to swap.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /^Adventure/ })).not.toBeChecked();
    expect(showToast).not.toHaveBeenCalled();
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
    // Dropping one makes room again.
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Drama/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Adventure/ }));
    expect(screen.getByRole('checkbox', { name: /^Adventure/ })).toBeChecked();
  });

  it('starts on your saved picks and closes with no call when nothing changed', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [{ genre_id: 35, count: 3 }],
      mine: [35],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await open();
    expect(screen.getByRole('checkbox', { name: 'Comedy, 3 players' })).toBeChecked();
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
  });

  it('closes with a note when the picks locked at Start meanwhile', async () => {
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'locked' });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith({
      tone: 'info',
      title: 'Genres locked',
      message: 'The game has started.',
    });
  });

  it('does not go back a second time when Start already closed the sheet', async () => {
    let answer: (value: { status: 'locked' }) => void = () => {};
    mockApi.setSeatPrefs.mockImplementation(
      () => new Promise((resolve) => (answer = resolve as typeof answer)),
    );
    const view = await render(<RoomGenresScreen />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Comedy/ })).toBeTruthy());
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(done());
    await waitFor(() => expect(mockApi.setSeatPrefs).toHaveBeenCalled());
    // The room layout dismissed the sheet and moved on while the save was in flight.
    mockSegments = ['room', '[id]', 'swipe'];
    await act(async () => view.rerender(<RoomGenresScreen />));
    await act(async () => answer({ status: 'locked' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Genres locked' })),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('leaves out a saved pick that is no longer offered: no place in the cap, none sent', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [
        { genre_id: 35, count: 3 },
        { genre_id: 27, count: 0 },
        { genre_id: 18, count: 1 },
        { genre_id: 12, count: 2 },
      ],
      mine: [99],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await open();
    for (const name of [/^Comedy/, /^Horror/, /^Drama/]) {
      await fireEvent.press(screen.getByRole('checkbox', { name }));
    }
    expect(screen.queryByText('3 genres at most. Drop one to swap.')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /^Drama/ })).toBeChecked();
    await fireEvent.press(done());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(mockApi.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [35, 27, 18] });
  });

  it('stays open and reads the offer again when a genre left it', async () => {
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'unknown_genre' });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(done());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: 'The genres changed. Pick again.',
      }),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockApi.roomGenres.mock.calls.length).toBeGreaterThan(1);
  });

  it('stays open with the genres toast when the call throws', async () => {
    mockApi.setSeatPrefs.mockRejectedValue(new Error('down'));
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(done());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "We couldn't save your genres. Try again.",
      }),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('reports too_many as a bug and stays open', async () => {
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'too_many', field: 'genre_ids', max: 3 });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(done());
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('says so when no genre is offered tonight', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [],
      mine: [],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await render(<RoomGenresScreen />, { wrapper: Providers });
    await waitFor(() =>
      expect(screen.getByText('Not enough films to offer genres tonight.')).toBeTruthy(),
    );
  });

  it('offers a retry when the genres cannot be loaded', async () => {
    mockApi.roomGenres.mockRejectedValue(new Error('down'));
    await render(<RoomGenresScreen />, { wrapper: Providers });
    // The read retries once (a second later) before it counts as failed.
    await waitFor(() => expect(screen.getByText("We couldn't load the genres.")).toBeTruthy(), {
      timeout: 4000,
    });
    expect(done()).toBeDisabled();
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [{ genre_id: 35, count: 3 }],
      mine: [],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Comedy/ })).toBeTruthy());
  });

  it('says it is offline when nothing was loaded and there is no network', async () => {
    mockOnline = false;
    mockApi.roomGenres.mockImplementation(() => new Promise(() => {}));
    await render(<RoomGenresScreen />, { wrapper: Providers });
    await waitFor(() =>
      expect(
        screen.getByText('No network. The genres come back with your connection.'),
      ).toBeTruthy(),
    );
  });

  it('shows French names in French', async () => {
    await i18n.changeLanguage('fr');
    try {
      await render(<RoomGenresScreen />, { wrapper: Providers });
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Comédie, 3 joueurs' })).toBeTruthy(),
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});

describe('the seat rows', () => {
  it('opens the seat sheet from another guest, never from the own row', async () => {
    mockSeats = [{ ...lea, is_me: false }, { ...sam, is_me: true }, jo];
    await show();
    await waitFor(() => expect(screen.getByText('Jo')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Sam/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Jo/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/seat/c');
  });

  it('lets the host open a guest too', async () => {
    await show();
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Léa/ })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Sam/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/room/r1/seat/b');
  });
});

describe('the seat sheet', () => {
  const open = async (name: string) => {
    await render(<RoomSeatSheet />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText(name)).toBeTruthy());
  };

  it('offers a guest Report, and no Remove', async () => {
    mockSeats = [{ ...lea, is_me: false }, { ...sam, is_me: true }, jo];
    mockMemberId = 'c';
    await open('Jo');
    expect(screen.getByRole('button', { name: 'Report Jo' })).toBeTruthy();
    expect(screen.queryByText(/Remove/)).toBeNull();
  });

  it('shows Report to the host, and replaces itself with the report sheet', async () => {
    mockMemberId = 'b';
    await open('Sam');
    await waitFor(() => expect(screen.getByText('Disney+')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Report Sam' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/report/b');
  });

  it('closes by itself when the seat has left', async () => {
    mockMemberId = 'd';
    await render(<RoomSeatSheet />, { wrapper: Providers });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });
});

describe('the report sheet', () => {
  beforeEach(() => {
    mockMemberId = 'b';
    mockApi.reportMember.mockResolvedValue({ status: 'ok' });
  });
  const open = async () => {
    await render(<RoomReportSheet />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText('Report Sam')).toBeTruthy());
  };
  const send = () => screen.getByRole('button', { name: 'Send report' });

  it('lists exactly the three reasons', async () => {
    await open();
    for (const title of ['Offensive name', 'Spam or trolling', 'Something else']) {
      expect(screen.getByRole('radio', { name: title })).toBeTruthy();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    // No free text anywhere: nothing on the sheet has a value to type into.
    expect(screen.queryByDisplayValue(/.*/)).toBeNull();
    expect(send()).toBeDisabled();
  });

  it('lists the same three reasons in French', async () => {
    await i18n.changeLanguage('fr');
    try {
      await render(<RoomReportSheet />, { wrapper: Providers });
      await waitFor(() => expect(screen.getByText('Signaler Sam')).toBeTruthy());
      for (const title of ['Prénom choquant', 'Spam ou sabotage', 'Autre chose']) {
        expect(screen.getByRole('radio', { name: title })).toBeTruthy();
      }
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Envoyer le signalement' })).toBeTruthy();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('sends once with the room, the seat and the reason, then thanks', async () => {
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: 'Spam or trolling' }));
    const button = send();
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(screen.getByText('Thanks')).toBeTruthy());
    expect(mockApi.reportMember).toHaveBeenCalledTimes(1);
    expect(mockApi.reportMember).toHaveBeenCalledWith({
      room_id: 'r1',
      member_id: 'b',
      reason: 'spam',
    });
    expect(screen.getByText(/remove Sam from the room/)).toBeTruthy();
    expect(reportError).not.toHaveBeenCalled();
    // Nothing about the report goes to a toast or a haptic either.
    expect(showToast).not.toHaveBeenCalled();
    expect(haptics.error).not.toHaveBeenCalled();
  });

  it('shows the rate limit line and stays', async () => {
    mockApi.reportMember.mockResolvedValue({ status: 'rate_limited' });
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: 'Something else' }));
    await fireEvent.press(send());
    await waitFor(() =>
      expect(screen.getByText("That's a lot of reports at once. Try again later.")).toBeTruthy(),
    );
    expect(haptics.error).toHaveBeenCalledTimes(1);
  });

  it('closes with a toast when the seat is not in the room', async () => {
    mockApi.reportMember.mockResolvedValue({ status: 'not_in_room' });
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: 'Something else' }));
    await fireEvent.press(send());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith({ tone: 'warn', title: 'The projector jammed' });
  });

  it('keeps the sheet and warns when the call fails, then works again', async () => {
    mockApi.reportMember.mockRejectedValueOnce(new Error('down'));
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: 'Something else' }));
    await fireEvent.press(send());
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "We couldn't send your report. Try again.",
      }),
    );
    await waitFor(() => expect(send()).toBeEnabled());
    expect(reportError).not.toHaveBeenCalled();
  });

  it('disables Send offline and says why', async () => {
    mockOnline = false;
    await open();
    await fireEvent.press(screen.getByRole('radio', { name: 'Something else' }));
    expect(send()).toBeDisabled();
    expect(screen.getByText("You're offline. Your report wasn't sent.")).toBeTruthy();
  });
});

describe("Remove, on the host's seat sheet", () => {
  const alertButtons = () =>
    (Alert.alert as unknown as M).mock.calls[0][2] as { text: string; onPress?: () => void }[];
  const open = async () => {
    mockMemberId = 'b';
    await render(<RoomSeatSheet />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText('Sam')).toBeTruthy());
  };
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('sits above Report for the host', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'Remove Sam from the room' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report Sam' })).toBeTruthy();
  });

  it('asks first, naming the player; Cancel calls nothing', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Sam from the room' }));
    const args = (Alert.alert as unknown as M).mock.calls[0];
    expect(args[0]).toBe('Remove Sam?');
    expect(args[1]).toBe("Sam won't be able to come back to this room.");
    expect(alertButtons().map((b) => b.text)).toEqual(['Cancel', 'Remove']);
    expect(mockApi.removeMember).not.toHaveBeenCalled();
  });

  it('calls removeMember once on Confirm, then closes the sheet', async () => {
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Sam from the room' }));
    await act(async () => {
      alertButtons()[1]?.onPress?.();
      alertButtons()[1]?.onPress?.();
    });
    expect(mockApi.removeMember).toHaveBeenCalledTimes(1);
    expect(mockApi.removeMember).toHaveBeenCalledWith({ room_id: 'r1', member_id: 'b' });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });

  it('warns and stays when the call fails', async () => {
    mockApi.removeMember.mockRejectedValue(new Error('down'));
    await open();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Sam from the room' }));
    await act(async () => {
      alertButtons()[1]?.onPress?.();
    });
    expect(showToast).toHaveBeenCalledWith({
      tone: 'warn',
      title: "We couldn't remove this player. Try again.",
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('is disabled offline', async () => {
    mockOnline = false;
    await open();
    expect(screen.getByRole('button', { name: 'Remove Sam from the room' })).toBeDisabled();
  });

  it('appears when the crown moves to this phone', async () => {
    mockSeats = [{ ...lea, is_me: false }, { ...sam, is_me: true }, jo];
    mockMemberId = 'c';
    await render(<RoomSeatSheet />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText('Jo')).toBeTruthy());
    expect(screen.queryByText('Remove from room')).toBeNull();
    mockSeats = [
      { ...lea, is_me: false, role: 'guest' },
      { ...sam, is_me: true, role: 'host' },
      jo,
    ];
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() => expect(screen.getByText('Remove from room')).toBeTruthy());
  });
});

describe('Lock room, in the lobby', () => {
  it('shows the host a switch that asks for the opposite of the room', async () => {
    await show();
    const lock = await screen.findByRole('switch', { name: 'Lock the room' });
    await fireEvent.press(lock);
    expect(mockApi.setRoomLocked).toHaveBeenCalledWith({ room_id: 'r1', locked: true });
  });

  it('asks to unlock a locked room', async () => {
    mockLocked = true;
    await show();
    const lock = await screen.findByRole('switch', { name: 'Lock the room' });
    await waitFor(() => expect(lock.props.accessibilityState.checked).toBe(true));
    await fireEvent.press(lock);
    expect(mockApi.setRoomLocked).toHaveBeenCalledWith({ room_id: 'r1', locked: false });
  });

  it('never shows a guest the switch', async () => {
    mockSeats = [{ ...lea, is_me: false }, { ...sam, is_me: true }, jo];
    await show();
    await screen.findByText('In the room');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('warns and flips back when the call fails', async () => {
    mockApi.setRoomLocked.mockRejectedValue(new Error('down'));
    await show();
    const lock = await screen.findByRole('switch', { name: 'Lock the room' });
    await fireEvent.press(lock);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "We couldn't change the lock. Try again.",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Lock the room' }).props.accessibilityState.checked,
      ).toBe(false),
    );
  });

  it('is disabled offline', async () => {
    mockOnline = false;
    await show();
    expect(await screen.findByRole('switch', { name: 'Lock the room' })).toBeDisabled();
  });

  it('shows every player the locked tag', async () => {
    mockLocked = true;
    mockSeats = [{ ...lea, is_me: false }, { ...sam, is_me: true }, jo];
    await show();
    expect(await screen.findByText('Locked')).toBeTruthy();
  });

  it('shows no tag on an open room', async () => {
    await show();
    await screen.findByText('In the room');
    expect(screen.queryByText('Locked')).toBeNull();
  });
});

describe('the invite sheet, locked', () => {
  const open = async () => {
    await render(<RoomInviteScreen />, { wrapper: Providers });
  };

  it('says it is locked and lets the host unlock', async () => {
    mockLocked = true;
    await open();
    expect(await screen.findByText('The room is locked: nobody new can join.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(mockApi.setRoomLocked).toHaveBeenCalledWith({ room_id: 'r1', locked: false });
  });

  it('tells a guest to ask the host, with no Unlock', async () => {
    mockLocked = true;
    mockSeats = [{ ...lea, is_me: false }, { ...sam, is_me: true }, jo];
    await open();
    expect(await screen.findByText('The room is locked. Ask the host to unlock it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull();
  });

  it('keeps its usual helper on an open room', async () => {
    await open();
    expect(await screen.findByText('Anyone with the link can join this room.')).toBeTruthy();
  });
});

describe('the genre step', () => {
  beforeEach(() => {
    mockSegments = ['room', '[id]', 'genre-step'];
  });
  const open = async () => {
    await render(<GenreStepScreen />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Comedy/ })).toBeTruthy());
  };

  it('asks the question with the room code, counts when others are here, and Any genre', async () => {
    await open();
    expect(screen.getByText('Your genres tonight')).toBeTruthy();
    expect(screen.getByText('Room 482 913')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Comedy, 3 players' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Any genre' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby');
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
  });

  it('a skipped person turns Any genre into Continue, and Continue sends the person ids', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [{ genre_id: 35, count: 3 }],
      mine: [],
      out: [],
      skips: {
        genre_ids: [],
        people: [
          { id: 287, name: 'Brad Pitt' },
          { id: 955, name: 'Penélope Cruz' },
        ],
      },
    });
    await open();
    expect(screen.queryByRole('button', { name: 'Any genre' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Brad Pitt' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Brad Pitt' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby'));
    expect(mockApi.setSeatSkips).toHaveBeenCalledWith({ room_id: 'r1', person_ids: [955] });
  });

  it('draws no count while the host is alone', async () => {
    mockSeats = [lea];
    await open();
    expect(screen.getByRole('checkbox', { name: 'Comedy' })).toBeTruthy();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('turns Any genre into Continue, sends only the genre ids, then the lobby', async () => {
    await open();
    expect(screen.getAllByText('0/3')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    expect(screen.getByText('1/3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby'));
    expect(mockApi.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [35] });
  });

  it('stops a 4th pick with the cap note and no toast', async () => {
    await open();
    for (const name of [/^Comedy/, /^Horror/, /^Drama/, /^Adventure/]) {
      await fireEvent.press(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByText('3 genres at most. Drop one to swap.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /^Adventure/ })).not.toBeChecked();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('goes straight to the lobby when no genre is offered', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [],
      mine: [],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await render(<GenreStepScreen />, { wrapper: Providers });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby'));
  });

  it('after a failed save shows the toast and Skip for now, which leaves without saving', async () => {
    mockApi.setSeatPrefs.mockRejectedValue(new Error('down'));
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: "We couldn't save your genres. Try again.",
      }),
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby');
  });

  it('offline with the offer loaded: no call, the toast, and Skip for now', async () => {
    await open();
    mockOnline = false;
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warn' }));
  });

  it('shows the locked note and leaves when Start happened during the save', async () => {
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'locked' });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Genres locked' })),
    );
  });

  it('reports too_many as a bug and stays', async () => {
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'too_many', field: 'genre_ids', max: 3 });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('offers Any genre and no Skip when the read failed', async () => {
    mockApi.roomGenres.mockRejectedValue(new Error('down'));
    await render(<GenreStepScreen />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByText("We couldn't load the genres.")).toBeTruthy(), {
      timeout: 4000,
    });
    expect(screen.getByRole('button', { name: 'Any genre' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull();
  });
});

describe('Not tonight, on the genre step', () => {
  beforeEach(() => {
    mockSegments = ['room', '[id]', 'genre-step'];
  });
  const offer = (over: Record<string, unknown> = {}) => ({
    status: 'ok',
    options: [
      { genre_id: 35, count: 3 },
      { genre_id: 16, count: 1 },
    ],
    mine: [],
    out: [],
    skips: { genre_ids: [], people: [] },
    ...over,
  });
  const open = async () => {
    await render(<GenreStepScreen />, { wrapper: Providers });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^Comedy/ })).toBeTruthy());
  };

  it('skipping Animation turns its pick chip out tonight at once, then Continue saves the skip', async () => {
    mockApi.roomGenres.mockResolvedValue(offer());
    await open();
    expect(screen.getByRole('button', { name: 'Any genre' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Animation' }));
    expect(screen.getByRole('checkbox', { name: 'Animation, out tonight' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Skip Animation' })).toBeChecked();
    // A skip alone turns Any genre into Continue.
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/room/r1/lobby'));
    expect(mockApi.setSeatSkips).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [16] });
    expect(mockApi.setSeatPrefs).not.toHaveBeenCalled();
  });

  it('skipping a picked genre takes it off the picks and sends the skips before the picks', async () => {
    mockApi.roomGenres.mockResolvedValue(offer());
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Comedy/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Animation/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Animation' }));
    expect(screen.getByLabelText('1 of 3 picked')).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 skipped')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockApi.setSeatPrefs).toHaveBeenCalled());
    expect(mockApi.setSeatSkips).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [16] });
    expect(mockApi.setSeatPrefs).toHaveBeenCalledWith({ room_id: 'r1', genre_ids: [35] });
    expect(mockApi.setSeatSkips.mock.invocationCallOrder[0]).toBeLessThan(
      mockApi.setSeatPrefs.mock.invocationCallOrder[0] as number,
    );
  });

  it("another seat's skip shows out tonight with no count and no name, and unskipping never brings it back", async () => {
    mockApi.roomGenres.mockResolvedValue(
      offer({
        options: [
          { genre_id: 35, count: 3 },
          { genre_id: 16, count: 0, out: true },
        ],
        out: [16],
      }),
    );
    await open();
    expect(screen.getByRole('checkbox', { name: 'Animation, out tonight' })).toBeDisabled();
    // A genre already out can always be skipped, and lifting it leaves it out (the room holds it).
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Animation' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Animation' }));
    expect(screen.getByRole('checkbox', { name: 'Animation, out tonight' })).toBeDisabled();
  });

  it('refuses a new skip with the room limit note, no toast', async () => {
    mockApi.roomGenres.mockResolvedValue(offer({ out: [1, 2, 3, 4] }));
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Animation' }));
    expect(screen.getByText('4 genres are already out tonight.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Skip Animation' })).not.toBeChecked();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('a re-read that puts a picked genre out removes the pick and says so', async () => {
    mockApi.roomGenres.mockResolvedValue(offer());
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Animation/ }));
    mockApi.roomGenres.mockResolvedValue(
      offer({
        options: [
          { genre_id: 35, count: 3 },
          { genre_id: 16, count: 0, out: true },
        ],
        out: [16],
      }),
    );
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Animation, out tonight' })).toBeDisabled(),
    );
    expect(
      screen.getByText('Animation is out tonight, so we took it off your picks.'),
    ).toBeTruthy();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('room_limit on save: the warn toast, a re-read, the step stays', async () => {
    mockApi.roomGenres.mockResolvedValue(offer());
    mockApi.setSeatSkips.mockResolvedValue({ status: 'room_limit', max: 4 });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Animation' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        tone: 'warn',
        title: '4 genres are already out tonight. Pick again.',
      }),
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('out_tonight on a pick: no toast, the step stays', async () => {
    mockApi.roomGenres.mockResolvedValue(offer());
    mockApi.setSeatPrefs.mockResolvedValue({ status: 'out_tonight' });
    await open();
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Animation/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(mockApi.setSeatPrefs).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('the lobby row with skips', () => {
  const row = (name: string) => screen.getByRole('button', { name });
  it('reads the picks then the own skip count, and the skip count alone with no picks', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [{ genre_id: 35, count: 3 }],
      mine: [35],
      out: [],
      skips: { genre_ids: [16], people: [{ id: 287, name: 'Brad' }] },
    });
    await show();
    await waitFor(() => expect(row('Your genres tonight, Comedy, 2 skipped')).toBeTruthy());
  });

  it('says only the skip count with no picks', async () => {
    mockApi.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [{ genre_id: 35, count: 3 }],
      mine: [],
      out: [],
      skips: { genre_ids: [16], people: [] },
    });
    await show();
    await waitFor(() => expect(row('Your genres tonight, 1 skipped')).toBeTruthy());
  });
});
