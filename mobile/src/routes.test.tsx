import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement, ReactNode } from 'react';
import { Alert } from 'react-native';

// What the screens of wave 2 reach for: the api, the guest session, the connection and the
// on-device store. M4.17 and M4.7 add their own answers to these mocks.
const mockRoomState = { current: 'lobby' };
jest.mock('@/api', () => ({
  api: {
    myProfile: jest.fn(async () => ({
      id: 'u1',
      display_name: '',
      avatar_key: 'default',
      country: 'FR',
      language: 'en',
      created_at: '2026-11-03T00:00:00Z',
    })),
    // The room layout's reads: a seated player in a room whose state the test picks.
    room: jest.fn(async ({ room_id }: { room_id: string }) => ({
      id: room_id,
      code: '482913',
      state: mockRoomState.current,
      mode: 'quick_match',
      country: 'FR',
      max_players: 10,
      provider_ids: [],
    })),
    gameModes: jest.fn(async () => [{ slug: 'quick_match', min_players: 2 }]),
    roomSeats: jest.fn(async ({ room_id }: { room_id: string }) => [
      {
        member_id: 'm1',
        room_id,
        left_at: null,
        is_me: true,
        role: 'host',
        display_name: 'Léa',
        avatar_key: 'teal',
        joined_at: '2026-11-03T10:00:00Z',
        provider_ids: [],
      },
    ]),
    touchRoom: jest.fn(async () => undefined),
    joinRoom: jest.fn(async () => ({ status: 'not_found' })),
    countryProviders: jest.fn(async () => [
      { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
    ]),
    myProviders: jest.fn(async () => []),
    updateProfile: jest.fn(async () => ({ status: 'ok', display_name: 'Léa', avatar_key: 'blue' })),
  },
}));
jest.mock('@/features/session', () => ({
  startSession: jest.fn(async () => ({ status: 'ok', userId: 'u1', isNew: true })),
  useSession: () => ({ status: 'ok', userId: 'u1', isNew: true }),
  useSessionFailed: () => false,
}));
jest.mock('@/features/network', () => ({ useOnline: () => true, watchNetwork: jest.fn() }));
// The room layout opens Realtime channels on this client; tests have no network.
jest.mock('@/lib/supabase', () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
    presenceState: () => ({}),
    track: async () => 'ok',
    state: 'joined',
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: async () => 'ok',
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn() },
}));

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

jest.mock('@/features/room/leave', () => ({
  leaveRoom: jest.fn(async () => ({ status: 'ok' })),
}));
jest.mock('@/lib/sound', () => ({ setSoundEnabled: jest.fn(), playSound: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

// Every first-release route opens (app-structure.md#screens-and-navigation). The real
// layouts and screens are rendered; the root layout (fonts, Sentry, updates) is not.
/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  index: require('@/app/index').default,
  welcome: require('@/app/welcome').default,
  name: require('@/app/name').default,
  home: require('@/app/home').default,
  join: require('@/app/join/index').default,
  'join/[code]': require('@/app/join/[code]').default,
  host: require('@/app/host/index').default,
  settings: require('@/app/settings').default,
  'room/[id]/_layout': require('@/app/room/[id]/_layout').default,
  'room/[id]/lobby': require('@/app/room/[id]/lobby').default,
  'room/[id]/invite': require('@/app/room/[id]/invite').default,
  'room/[id]/services': require('@/app/room/[id]/services').default,
  'room/[id]/seat/[memberId]': require('@/app/room/[id]/seat/[memberId]').default,
  'room/[id]/report/[memberId]': require('@/app/room/[id]/report/[memberId]').default,
  'room/[id]/swipe': require('@/app/room/[id]/swipe').default,
  'room/[id]/final-cut': require('@/app/room/[id]/final-cut').default,
  'room/[id]/winner': require('@/app/room/[id]/winner').default,
  'room/[id]/recap': require('@/app/room/[id]/recap').default,
  'room/[id]/closed': require('@/app/room/[id]/closed').default,
  'dev/index': require('@/app/dev/index').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

// Like the real root layout: a stack anchored on `/`.
const rootLayout = {
  default: () => <Stack screenOptions={{ headerShown: false }} />,
  unstable_settings: { anchor: 'index' },
};

/** How many room screens the navigation state holds. */
function roomScreens(app: { getRouterState: () => unknown }): number {
  return (JSON.stringify(app.getRouterState()).match(/"name":"room\/\[id\]"/g) ?? []).length;
}

const paths = [
  '/welcome',
  '/name',
  '/home',
  '/join',
  '/join/123456',
  '/host',
  '/settings',
  '/room/abc/lobby',
  '/room/abc/invite',
  '/room/abc/services',
  '/room/abc/seat/m1',
  '/room/abc/report/m1',
  '/room/abc/swipe',
  '/room/abc/final-cut',
  '/room/abc/winner',
  '/room/abc/recap',
  '/room/abc/closed',
  '/dev',
];

describe('routes', () => {
  it.each(paths)('%s opens', async (path) => {
    // A room screen opens when the room is in the state that screen is for.
    const screens: Record<string, string> = {
      swipe: 'swiping',
      'final-cut': 'finale',
      winner: 'done',
      recap: 'done',
      closed: 'abandoned',
    };
    mockRoomState.current = screens[path.split('/')[3] ?? ''] ?? 'lobby';
    await renderRouter(routes, { initialUrl: path, wrapper: Providers });
    expect(screen).toHavePathname(path);
    expect(screen.queryByText(/unmatched route/i)).toBeNull();
  });

  it('sends a fresh install from the root to the welcome screen', async () => {
    await renderRouter(routes, { initialUrl: '/', wrapper: Providers });
    await waitFor(() => expect(screen).toHavePathname('/welcome'));
  });

  it('a second link to the room you are in leaves one room screen', async () => {
    const { api } = jest.requireMock('@/api');
    api.joinRoom.mockResolvedValueOnce({
      status: 'ok',
      room_id: 'abc',
      state: 'lobby',
      rejoined: true,
    });
    const app = await renderRouter(
      { _layout: rootLayout, ...routes },
      { initialUrl: '/room/abc/lobby', wrapper: Providers },
    );
    expect(roomScreens(app)).toBe(1);
    await act(async () => {
      router.push('/join/123456');
    });
    await waitFor(() => expect(screen).toHavePathname('/room/abc/lobby'));
    // The sheet is gone and no second copy of the room was pushed.
    expect(roomScreens(app)).toBe(1);
    expect(JSON.stringify(app.getRouterState())).not.toContain('"name":"join/[code]"');
  });

  // The root layout anchors on `/`, so a link opened on a cold start has `/` under the sheet and
  // closing the sheet lands on Home or Welcome (join-sheet.md#presentation).
  describe('closing the join sheet after a cold start', () => {
    it('anchors the real root layout on the index route', () => {
      const source = readFileSync(resolve(__dirname, 'app', '_layout.tsx'), 'utf8');
      expect(source).toContain("export const unstable_settings = { anchor: 'index' }");
    });

    it.each([
      ['an unnamed profile', '', '/welcome'],
      ['a named profile', 'Léa', '/home'],
    ])('lands on the right screen for %s', async (_label, name, path) => {
      const { api } = jest.requireMock('@/api');
      api.myProfile.mockResolvedValueOnce({
        id: 'u1',
        display_name: name,
        avatar_key: 'blue',
        country: 'FR',
        language: 'en',
        created_at: '2026-11-03T00:00:00Z',
      });
      await renderRouter(
        { _layout: rootLayout, ...routes },
        { initialUrl: '/join/123456', wrapper: Providers },
      );
      // `not_found` keeps the sheet open: the player closes it.
      await waitFor(() => expect(screen).toHavePathname('/join/123456'));
      await act(async () => {
        router.back();
      });
      await waitFor(() => expect(screen).toHavePathname(path));
    });
  });

  // Leaving a room goes back to the Home already in the stack, never to a second one
  // (lobby.md#leaving, `useExitRoomToHome`).
  describe('leaving a room', () => {
    /** The names in the root stack, whichever wrapper the router puts around it. */
    function rootNames(app: { getRouterState: () => unknown }): string[] {
      type S = { routes?: { name: string; state?: S }[] };
      let state = app.getRouterState() as S;
      while (state.routes?.length === 1 && state.routes[0]?.state) state = state.routes[0].state;
      return (state.routes ?? []).map((route) => route.name);
    }

    async function leave() {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        text: string;
        onPress?: () => void;
      }[];
      await act(async () => {
        buttons.find((b) => b.text === 'Leave')?.onPress?.();
      });
      await waitFor(() => expect(screen).toHavePathname('/home'));
    }

    /** One Home, and nothing under it except the index route. */
    function expectOneHome(app: { getRouterState: () => unknown }) {
      const names = rootNames(app);
      expect(names.filter((name) => name === 'home')).toHaveLength(1);
      expect(names.at(-1)).toBe('home');
      expect(names.slice(0, -1).filter((name) => name !== 'index')).toEqual([]);
    }

    const open = (
      url: string,
      layout: { default: () => ReactElement; unstable_settings?: { anchor: string } } = rootLayout,
    ) => renderRouter({ _layout: layout, ...routes }, { initialUrl: url, wrapper: Providers });

    it('a back action asks first and leaves only once confirmed', async () => {
      const { leaveRoom } = jest.requireMock('@/features/room/leave');
      leaveRoom.mockClear();
      const app = await open('/home');
      await act(async () => {
        router.push('/host');
      });
      await act(async () => {
        router.replace('/room/abc/lobby');
      });
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await waitFor(() => expect(screen.getByText('In the room')).toBeTruthy());
      // The iOS swipe from the edge and Android's back button are this back action.
      await act(async () => {
        router.back();
      });
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(leaveRoom).not.toHaveBeenCalled();
      expect(screen).toHavePathname('/room/abc/lobby');
      const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
        text: string;
        onPress?: () => void;
      }[];
      await act(async () => {
        buttons.find((b) => b.text === 'Stay')?.onPress?.();
      });
      expect(screen).toHavePathname('/room/abc/lobby');
      await act(async () => {
        router.back();
      });
      const again = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as typeof buttons;
      await act(async () => {
        again.find((b) => b.text === 'Leave')?.onPress?.();
      });
      await waitFor(() => expect(screen).toHavePathname('/home'));
      expect(leaveRoom).toHaveBeenCalledWith('abc');
      expectOneHome(app);
    });

    it('after Home, host setup and the room', async () => {
      const app = await open('/home');
      await act(async () => {
        router.push('/host');
      });
      await act(async () => {
        router.replace('/room/abc/lobby');
      });
      // Like the host screen: it replaces itself with the lobby and opens nothing over it, so
      // going back from the lobby asks to leave and never reveals a share step.
      await leave();
      expectOneHome(app);
    });

    it('after Home, the code screen and the room', async () => {
      const app = await open('/home');
      await act(async () => {
        router.push('/join');
      });
      await act(async () => {
        router.replace('/room/abc/lobby');
      });
      await leave();
      expectOneHome(app);
    });

    it('after a link sheet over Home and the room', async () => {
      const { api } = jest.requireMock('@/api');
      api.joinRoom.mockResolvedValueOnce({
        status: 'ok',
        room_id: 'abc',
        state: 'lobby',
        rejoined: false,
      });
      const app = await open('/home');
      await act(async () => {
        router.push('/join/123456');
      });
      await waitFor(() => expect(screen).toHavePathname('/room/abc/lobby'));
      await leave();
      expectOneHome(app);
    });

    it('after a cold start link and the room', async () => {
      const { api } = jest.requireMock('@/api');
      api.joinRoom.mockResolvedValueOnce({
        status: 'ok',
        room_id: 'abc',
        state: 'lobby',
        rejoined: false,
      });
      const app = await open('/join/123456');
      await waitFor(() => expect(screen).toHavePathname('/room/abc/lobby'));
      await leave();
      expectOneHome(app);
    });

    it('after the splash rejoined the kept room (nothing under the room)', async () => {
      const app = await open('/room/abc/lobby', { default: rootLayout.default });
      await leave();
      expectOneHome(app);
      expect(rootNames(app)).toEqual(['home']);
    });
  });
});
