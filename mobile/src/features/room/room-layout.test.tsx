import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import type { ReactNode } from 'react';

import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';

import { revealStore } from '@/features/finale/reveal-store';

import { voteQueue } from '@/features/swipe';
import { keptRoomStore } from './kept-room';
import { matchShownStore } from './match-shown';

const mockSeat = {
  member_id: 'm1',
  room_id: 'r1',
  role: 'host',
  display_name: 'Léa',
  avatar_key: 'teal',
  provider_ids: [],
  joined_at: '2026-11-03T10:00:00Z',
  left_at: null,
  calibrated_at: null,
  done_at: null,
  swipe_count: 0,
  super_likes_left: 1,
  vetoes_left: 1,
  is_me: true,
  is_mine: true,
};

jest.mock('@/api', () => ({
  api: {
    room: jest.fn(),
    roomSeats: jest.fn(),
    touchRoom: jest.fn(async () => undefined),
    roomMatches: jest.fn(async () => []),
    rounds: jest.fn(async () => []),
    roundCandidates: jest.fn(async () => []),
    titleCards: jest.fn(async () => ({ status: 'ok', cards: [] })),
    countryProviders: jest.fn(async () => []),
    gameModes: jest.fn(async () => []),
    roomGenres: jest.fn(async () => ({ status: 'ok', options: [], mine: [] })),
    genres: jest.fn(async () => []),
    castVote: jest.fn(),
    undoLastVote: jest.fn(),
  },
}));
const mockOnline = { value: true };
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.value }));
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
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
// The bulbs chase forever; the layout test only needs to know the overlay is there.
jest.mock('@/components/ui/marquee-bulbs', () => ({ MarqueeBulbs: () => null }));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/components/ui/toast', () => ({
  ...jest.requireActual('@/components/ui/toast'),
  showToast: jest.fn(),
}));
// The invite sheet reads app_config, which starts the guest session: keep the real one out.
jest.mock('@/features/session', () => ({ startSession: jest.fn(async () => ({ status: 'no' })) }));

const { api } = jest.requireMock('@/api');

const roomOf = (state: string) => ({
  id: 'r1',
  code: '482913',
  state,
  mode: 'quick_match',
  country: 'FR',
  max_players: 10,
  provider_ids: [],
});

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  play: () => null,
  solo: () => <Text variant="body-m">Solo setup</Text>,
  'room/[id]/_layout': require('@/app/room/[id]/_layout').default,
  'room/[id]/lobby': require('@/app/room/[id]/lobby').default,
  'room/[id]/invite': require('@/app/room/[id]/invite').default,
  'room/[id]/services': require('@/app/room/[id]/services').default,
  'room/[id]/genres': require('@/app/room/[id]/genres').default,
  'room/[id]/swipe': require('@/app/room/[id]/swipe').default,
  'room/[id]/final-cut': require('@/app/room/[id]/final-cut').default,
  'room/[id]/winner': require('@/app/room/[id]/winner').default,
  'room/[id]/recap': require('@/app/room/[id]/recap').default,
  'room/[id]/closed': require('@/app/room/[id]/closed').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

let client: QueryClient;
function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  mockOnline.value = true;
  keptRoomStore.getState().forget();
  matchShownStore.setState({ rooms: [] });
  jest.mocked(showToast).mockClear();
  api.room.mockReset().mockResolvedValue(roomOf('lobby'));
  api.roomSeats.mockReset().mockResolvedValue([mockSeat]);
  api.touchRoom.mockClear();
  api.roomMatches.mockReset().mockResolvedValue([]);
  api.rounds.mockReset().mockResolvedValue([]);
  revealStore.getState().reset();
});

describe('the room layout', () => {
  it.each([
    ['swiping', '/room/r1/lobby', '/room/r1/swipe'],
    ['finale', '/room/r1/swipe', '/room/r1/final-cut'],
    ['done', '/room/r1/lobby', '/room/r1/winner'],
    ['abandoned', '/room/r1/swipe', '/room/r1/closed'],
  ])('a %s room replaces %s with %s', async (state, from, to) => {
    api.room.mockResolvedValue(roomOf(state));
    await renderRouter(routes, { initialUrl: from, wrapper: Providers });
    await waitFor(() => expect(screen).toHavePathname(to));
  });

  describe('the Final Cut reveal', () => {
    const data = {
      winnerId: 1,
      reason: 'points' as const,
      finalists: [
        { titleId: 1, seed: 1, points: 12, vetoed: false },
        { titleId: 2, seed: 2, points: 6, vetoed: false },
        { titleId: 3, seed: 3, points: 0, vetoed: true },
      ],
    };

    it('keeps the Final Cut screen of a done room while the reveal plays, then moves to the winner', async () => {
      api.room.mockResolvedValue(roomOf('done'));
      revealStore.getState().play('r1', data);
      await renderRouter(routes, { initialUrl: '/room/r1/final-cut', wrapper: Providers });
      await waitFor(() => expect(api.room).toHaveBeenCalled());
      await act(async () => undefined);
      expect(screen).toHavePathname('/room/r1/final-cut');
      await act(async () => revealStore.getState().finish('r1'));
      await waitFor(() => expect(screen).toHavePathname('/room/r1/winner'));
    });

    it('brings a phone still on the swipe screen to the Final Cut once a reveal is there', async () => {
      api.room.mockResolvedValue(roomOf('done'));
      revealStore.getState().play('r1', data);
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen).toHavePathname('/room/r1/final-cut'));
    });

    it('leaves the swipe screen for the winner when a done room has no Final Cut round', async () => {
      api.room.mockResolvedValue(roomOf('done'));
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen).toHavePathname('/room/r1/winner'));
      expect(api.rounds).toHaveBeenCalled();
    });
  });

  describe('the match overlay', () => {
    const pick = {
      room_id: 'r1',
      title_id: 7,
      kind: 'unanimous',
      like_count: 3,
      present_count: 3,
      pick_order: 1,
      created_at: '',
    };

    it('holds the swipe screen while it plays, then lands on the winner screen', async () => {
      api.room.mockResolvedValue(roomOf('done'));
      api.roomMatches.mockResolvedValue([pick]);
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen.getByTestId('match-overlay')).toBeTruthy());
      expect(screen).toHavePathname('/room/r1/swipe');
      await fireEvent.press(screen.getByTestId('match-tap', { includeHiddenElements: true }));
      expect(screen.getByTestId('match-overlay')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(900);
      });
      await fireEvent.press(screen.getByTestId('match-tap', { includeHiddenElements: true }));
      await waitFor(() => expect(screen).toHavePathname('/room/r1/winner'));
      expect(matchShownStore.getState().has('r1')).toBe(true);
    });

    it('goes straight to the winner screen when this room already showed it', async () => {
      matchShownStore.getState().mark('r1');
      api.room.mockResolvedValue(roomOf('done'));
      api.roomMatches.mockResolvedValue([pick]);
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen).toHavePathname('/room/r1/winner'));
      // The winner screen reads the pick itself; the overlay's re-read is what stays off.
      expect(screen.queryByTestId('match-overlay')).toBeNull();
    });
  });

  describe('the shortlist', () => {
    const matchRow = (title_id: number, created_at: string) => ({
      room_id: 'r1',
      title_id,
      kind: 'unanimous',
      like_count: 3,
      present_count: 3,
      pick_order: null,
      created_at,
    });

    it('reads the shortlist back into the top bar on a cold start, with no beat', async () => {
      api.room.mockResolvedValue(roomOf('swiping'));
      api.roomMatches.mockResolvedValue([matchRow(4, '1'), matchRow(9, '2')]);
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy());
      expect(screen.queryByTestId('shortlisted')).toBeNull();
      expect(screen).toHavePathname('/room/r1/swipe');
    });

    it('shows the same shortlist and beat in a Blind room as in a Party one', async () => {
      api.room.mockResolvedValue({ ...roomOf('swiping'), reveal: 'blind' });
      api.roomMatches.mockResolvedValue([matchRow(4, '1')]);
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
      api.castVote.mockResolvedValue({
        status: 'ok',
        match: true,
        kind: 'majority',
        decided: false,
      });
      await act(async () => {
        voteQueue.enqueue({
          room_id: 'r1',
          member_id: 'm1',
          title_id: 8,
          answer: 'like',
          dwell_ms: 500,
          client_at: '2026-11-05T10:00:00.000Z',
          flipped: false,
        });
      });
      await waitFor(() => expect(screen.getByTestId('shortlisted')).toBeTruthy());
      expect(screen).toHavePathname('/room/r1/swipe');
      await act(async () => {
        jest.advanceTimersByTime(1800);
      });
      await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy());
      expect(screen.queryByTestId('shortlisted')).toBeNull();
    });

    it('holds the swipe screen on the third match until the beat ends, then goes to the Final Cut', async () => {
      api.room.mockResolvedValue(roomOf('swiping'));
      await renderRouter(routes, { initialUrl: '/room/r1/swipe', wrapper: Providers });
      await waitFor(() => expect(screen.getByText('0/3')).toBeTruthy());
      // The phone's own vote filled the shortlist: the answer carries the match and the finale.
      api.castVote.mockResolvedValue({
        status: 'ok',
        match: true,
        kind: 'unanimous',
        decided: false,
        state: 'finale',
      });
      api.room.mockResolvedValue(roomOf('finale'));
      await act(async () => {
        voteQueue.enqueue({
          room_id: 'r1',
          member_id: 'm1',
          title_id: 7,
          answer: 'like',
          dwell_ms: 500,
          client_at: '2026-11-05T10:00:00.000Z',
          flipped: false,
        });
      });
      await waitFor(() => expect(screen.getByTestId('shortlisted')).toBeTruthy());
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen).toHavePathname('/room/r1/swipe');
      await act(async () => {
        jest.advanceTimersByTime(800);
      });
      await waitFor(() => expect(screen).toHavePathname('/room/r1/final-cut'));
    });
  });

  it('keeps the lobby for a dealing room', async () => {
    api.room.mockResolvedValue(roomOf('dealing'));
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() => expect(api.room).toHaveBeenCalled());
    expect(screen).toHavePathname('/room/r1/lobby');
  });

  it('keeps the invite sheet over the lobby in the host flow', async () => {
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await act(async () => {
      router.push('/room/r1/invite');
    });
    await waitFor(() => expect(keptRoomStore.getState().room).not.toBeNull());
    expect(screen).toHavePathname('/room/r1/invite');
  });

  it('lets the recap sheet stay over a done room', async () => {
    api.room.mockResolvedValue(roomOf('done'));
    await renderRouter(routes, { initialUrl: '/room/r1/winner', wrapper: Providers });
    await act(async () => {
      router.push('/room/r1/recap');
    });
    await waitFor(() => expect(api.room).toHaveBeenCalled());
    expect(screen).toHavePathname('/room/r1/recap');
  });

  it('drops the invite sheet and the lobby when the room starts swiping', async () => {
    const app = await renderRouter(routes, {
      initialUrl: '/room/r1/lobby',
      wrapper: Providers,
    });
    await act(async () => {
      router.push('/room/r1/invite');
    });
    await waitFor(() => expect(screen).toHavePathname('/room/r1/invite'));
    api.room.mockResolvedValue(roomOf('swiping'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['room', 'r1'] });
    });
    await waitFor(() => expect(screen).toHavePathname('/room/r1/swipe'));
    const names = JSON.stringify(app.getRouterState());
    expect(names).not.toContain('"name":"invite"');
    expect(names).not.toContain('"name":"lobby"');
  });

  it('sends the phone Home when the room read answers null, and forgets the room', async () => {
    keptRoomStore.getState().keep({ id: 'r1', code: '482913' });
    api.room.mockResolvedValue(null);
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() => expect(screen).toHavePathname('/play'));
    expect(keptRoomStore.getState().room).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith({
      tone: 'info',
      title: 'The host removed you from this room.',
    });
  });

  it('says nothing for a null read of a room the phone does not keep', async () => {
    api.room.mockResolvedValue(null);
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() => expect(screen).toHavePathname('/play'));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('sends the phone Home when its seat has left, with no message', async () => {
    keptRoomStore.getState().keep({ id: 'r1', code: '482913' });
    api.roomSeats.mockResolvedValue([{ ...mockSeat, left_at: '2026-11-03T11:00:00Z' }]);
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() => expect(screen).toHavePathname('/play'));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('trusts a fresh read over a cached left seat after a rejoin', async () => {
    client.setQueryData(['room', 'r1'], null);
    client.setQueryData(
      ['room', 'r1', 'seats'],
      [{ ...mockSeat, left_at: '2026-11-03T11:00:00Z' }],
    );
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() =>
      expect(keptRoomStore.getState().room).toEqual({ id: 'r1', code: '482913' }),
    );
    expect(screen).toHavePathname('/room/r1/lobby');
  });

  it('keeps the room for a seated player, and forgets it once the room is done', async () => {
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() =>
      expect(keptRoomStore.getState().room).toEqual({ id: 'r1', code: '482913' }),
    );
    api.room.mockResolvedValue(roomOf('done'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['room', 'r1'] });
    });
    await waitFor(() => expect(keptRoomStore.getState().room).toBeNull());
  });

  it('forgets the kept room when the room is abandoned', async () => {
    api.room.mockResolvedValue(roomOf('abandoned'));
    keptRoomStore.getState().keep({ id: 'r1', code: '482913' });
    await renderRouter(routes, { initialUrl: '/room/r1/closed', wrapper: Providers });
    await waitFor(() => expect(keptRoomStore.getState().room).toBeNull());
  });

  it('touches the room at mount', async () => {
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() => expect(api.touchRoom).toHaveBeenCalledWith({ room_id: 'r1' }));
  });

  it('shows the error screen when the first read fails online, and Retry reads again', async () => {
    api.room.mockRejectedValue(new Error('boom'));
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    const retry = await screen.findByText('Try again');
    api.room.mockResolvedValue(roomOf('lobby'));
    await act(async () => {
      fireEvent.press(retry);
    });
    await waitFor(() => expect(screen.queryByText('Try again')).toBeNull());
    expect(api.room).toHaveBeenCalledTimes(3); // the read, its one retry, then Retry
  });

  it('shows no error screen offline', async () => {
    mockOnline.value = false;
    api.room.mockRejectedValue(new Error('boom'));
    await renderRouter(routes, { initialUrl: '/room/r1/lobby', wrapper: Providers });
    await waitFor(() => expect(api.room).toHaveBeenCalled());
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen).toHavePathname('/room/r1/lobby');
  });

  describe('after a game ends', () => {
    // A touch run found Home and Play alone bringing the old winner screen back.
    it.each([
      ['from Home through the host setup', ['/play'], '/room/r1/swipe'],
      ['cold, with no Home under the room', [], '/room/r1/swipe'],
    ])('Home, then Play alone, opens the solo setup (%s)', async (_name, under, start) => {
      api.room.mockResolvedValue(roomOf('swiping'));
      keptRoomStore.getState().keep({ id: 'r1', code: '482913' });
      await renderRouter(routes, { initialUrl: under[0] ?? start, wrapper: Providers });
      if (under.length > 0) {
        await act(async () => {
          router.push(start);
        });
      }
      await waitFor(() => expect(screen).toHavePathname(start));
      // The room ends while the phone is on it.
      api.room.mockResolvedValue(roomOf('done'));
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['room', 'r1'] });
      });
      await waitFor(() => expect(screen).toHavePathname('/room/r1/winner'));
      await waitFor(() => expect(keptRoomStore.getState().room).toBeNull());
      await fireEvent.press(await screen.findByLabelText('Back to Home'));
      await waitFor(() => expect(screen).toHavePathname('/play'));
      await act(async () => {
        router.push('/solo');
      });
      await waitFor(() => expect(screen).toHavePathname('/solo'));
      expect(await screen.findByText('Solo setup')).toBeTruthy();
      expect(keptRoomStore.getState().room).toBeNull();
    });
  });
});
