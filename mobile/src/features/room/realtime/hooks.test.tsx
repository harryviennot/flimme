import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Text } from '@/components/ui/text';

import { RoomBanner } from '@/components/screens/room/room-banner';

import { RoomRealtimeProvider } from './context';
import type { RealtimeClient } from './controller';
import { useRoomChannels, useRoomConnection, useRoomEvent } from './hooks';
import { useRoom, useRoomGenres } from '../queries';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/api', () => ({
  api: {
    room: jest.fn(),
    roomSeats: jest.fn(),
    roomGenres: jest.fn(),
    touchRoom: jest.fn(async () => undefined),
  },
}));
const mockOnline = { value: true };
jest.mock('@/features/network', () => ({ useOnline: () => mockOnline.value }));

const { api } = jest.requireMock('@/api');
const seat = { member_id: 'seat-1', room_id: 'r1', left_at: null, is_me: true, role: 'host' };

type Fake = {
  topic: string;
  config: unknown;
  status: (s: string) => void;
  broadcast?: (m: { event: string; payload?: unknown }) => void;
};

function makeClient() {
  const made: Fake[] = [];
  const removed: unknown[] = [];
  const client = {
    channel: (topic: string, opts: { config: unknown }) => {
      const fake = { topic, config: opts.config } as Fake;
      const channel = {
        on: (type: string, _f: unknown, cb: Fake['broadcast']) => {
          if (type === 'broadcast') fake.broadcast = cb;
          return channel;
        },
        subscribe: (cb: (s: string) => void) => {
          fake.status = cb;
          return channel;
        },
        presenceState: () => ({}),
        track: async () => 'ok',
        state: 'closed',
      };
      made.push(fake);
      (fake as unknown as { channel: unknown }).channel = channel;
      return channel;
    },
    removeChannel: async (channel: unknown) => {
      removed.push(channel);
    },
    auth: {
      getSession: async () => ({ data: { session: { expires_at: Date.now() / 1000 + 3600 } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
  return { client: client as unknown as RealtimeClient, made, removed };
}

let queryClient: QueryClient;
let harness: ReturnType<typeof makeClient>;

function Layout({ children }: { children: ReactNode }) {
  const realtime = useRoomChannels('r1', harness.client);
  return <RoomRealtimeProvider value={realtime}>{children}</RoomRealtimeProvider>;
}

function Room() {
  const room = useRoom('r1');
  return <Text testID="state">{room.data?.state ?? '-'}</Text>;
}

function Genres() {
  const genres = useRoomGenres('r1');
  return <Text testID="genres">{genres.data?.options.map((o) => o.count).join(',') ?? '-'}</Text>;
}

async function mountWith(children: ReactNode) {
  return await render(
    <QueryClientProvider client={queryClient}>
      <Layout>{children}</Layout>
    </QueryClientProvider>,
  );
}

const events = () => harness.made.find((c) => c.topic === 'room:r1')!;
const live = () => harness.made.find((c) => c.topic === 'room:r1:live')!;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  harness = makeClient();
  mockOnline.value = true;
  api.room.mockReset().mockResolvedValue({ id: 'r1', code: '482913', state: 'lobby' });
  api.roomSeats.mockReset().mockResolvedValue([seat]);
  api.touchRoom.mockClear();
  api.roomGenres.mockReset().mockResolvedValue({
    status: 'ok',
    options: [{ genre_id: 35, count: 1 }],
    mine: [],
    out: [],
    skips: { genre_ids: [], people: [] },
  });
});

async function opened(children: ReactNode = <Room />) {
  const view = await mountWith(children);
  await waitFor(() => expect(harness.made).toHaveLength(2));
  await act(async () => {});
  return view;
}

it('opens no channel until the seat is known', async () => {
  api.roomSeats.mockResolvedValue([]);
  await mountWith(<Room />);
  await act(async () => {});
  expect(harness.made).toHaveLength(0);
});

it('opens both channels once the seat is known, and removes them on unmount', async () => {
  const view = await opened();
  expect(harness.made.map((c) => c.topic)).toEqual(['room:r1', 'room:r1:live']);
  await view.unmount();
  expect(harness.removed).toHaveLength(2);
  // The CLOSED that our own removal causes starts nothing.
  await act(async () => {
    events().status('CLOSED');
  });
  expect(harness.made).toHaveLength(2);
});

describe('events', () => {
  const calls = () => ({
    room: api.room.mock.calls.length,
    seats: api.roomSeats.mock.calls.length,
  });

  it.each(['member_joined', 'member_left', 'member_removed', 'seat_updated', 'host_changed'])(
    '%s reads the seats again, not the room',
    async (event) => {
      await opened();
      const before = calls();
      await act(async () => events().broadcast?.({ event, payload: {} }));
      expect(calls().seats).toBe(before.seats + 1);
      expect(calls().room).toBe(before.room);
    },
  );

  it('reads the genre counts again on every reconnect: they sit under the room key', async () => {
    await opened(<Genres />);
    await waitFor(() => expect(screen.getByTestId('genres')).toHaveTextContent('1'));
    const before = api.roomGenres.mock.calls.length;
    await act(async () => events().status('SUBSCRIBED'));
    await waitFor(() => expect(api.roomGenres.mock.calls.length).toBeGreaterThan(before));
  });

  it.each(['member_joined', 'member_left', 'member_removed', 'settings_changed'])(
    '%s also reads the genre counts again: they follow presence and the offer',
    async (event) => {
      await opened(<Genres />);
      await waitFor(() => expect(screen.getByTestId('genres')).toHaveTextContent('1'));
      const before = api.roomGenres.mock.calls.length;
      await act(async () => events().broadcast?.({ event, payload: {} }));
      await waitFor(() => expect(api.roomGenres.mock.calls.length).toBe(before + 1));
    },
  );

  it('genres_changed reads the genre counts again, and nothing else', async () => {
    await opened(<Genres />);
    await waitFor(() => expect(screen.getByTestId('genres')).toHaveTextContent('1'));
    const before = { ...calls(), genres: api.roomGenres.mock.calls.length };
    api.roomGenres.mockResolvedValue({
      status: 'ok',
      options: [{ genre_id: 35, count: 2 }],
      mine: [],
      out: [],
      skips: { genre_ids: [], people: [] },
    });
    await act(async () => events().broadcast?.({ event: 'genres_changed', payload: {} }));
    await waitFor(() => expect(screen.getByTestId('genres')).toHaveTextContent('2'));
    expect(api.roomGenres.mock.calls.length).toBe(before.genres + 1);
    expect(calls().seats).toBe(before.seats);
    expect(calls().room).toBe(before.room);
  });

  it.each(['settings_changed', 'state_changed', 'room_locked', 'next_room'])(
    '%s reads the room again',
    async (event) => {
      await opened();
      const before = calls();
      await act(async () => events().broadcast?.({ event }));
      expect(calls().room).toBe(before.room + 1);
      expect(calls().seats).toBe(before.seats);
    },
  );

  it('drops an event it does not know', async () => {
    await opened();
    const before = calls();
    await act(async () => events().broadcast?.({ event: 'surprise', payload: {} }));
    expect(calls()).toEqual(before);
  });

  it('stays on the lobby when state_changed says swiping but the re-read says lobby', async () => {
    await opened();
    await act(async () =>
      events().broadcast?.({ event: 'state_changed', payload: { state: 'swiping' } }),
    );
    expect(screen.getByTestId('state').props.children).toBe('lobby');
  });

  it('gives a match to useRoomEvent', async () => {
    const fn = jest.fn();
    function Listener() {
      useRoomEvent('r1', 'match', fn);
      return <Room />;
    }
    await opened(<Listener />);
    await act(async () => events().broadcast?.({ event: 'match', payload: { title_id: 7 } }));
    expect(fn).toHaveBeenCalledWith({ title_id: 7 });
  });
});

describe('after SUBSCRIBED', () => {
  it('re-reads the room each time, and beats at once only on a return', async () => {
    await opened();
    api.touchRoom.mockClear();
    const reads = api.room.mock.calls.length;
    await act(async () => events().status('SUBSCRIBED'));
    expect(api.room.mock.calls.length).toBe(reads + 1);
    expect(api.touchRoom).not.toHaveBeenCalled();
    await act(async () => events().status('CHANNEL_ERROR'));
    await act(async () => events().status('SUBSCRIBED'));
    expect(api.room.mock.calls.length).toBe(reads + 2);
    expect(api.touchRoom).toHaveBeenCalledWith({ room_id: 'r1' });
  });
});

describe('the banner', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  function Banner() {
    const { fresh } = useRoomConnection('r1');
    return (
      <>
        <RoomBanner roomId="r1" />
        <Text testID="fresh">{String(fresh)}</Text>
      </>
    );
  }

  it('walks from nothing to reconnecting to stillTrying and back', async () => {
    await mountWith(<Banner />);
    await waitFor(() => expect(harness.made).toHaveLength(2));
    await act(async () => {
      events().status('SUBSCRIBED');
      live().status('SUBSCRIBED');
    });
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => live().status('CHANNEL_ERROR'));
    await act(async () => jest.advanceTimersByTime(1900));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => jest.advanceTimersByTime(200));
    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(screen.getByText(/Still reconnecting/)).toBeTruthy();
    expect(screen.getByTestId('fresh').props.children).toBe('false');
    await act(async () => live().status('SUBSCRIBED'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('fresh').props.children).toBe('true');
  });

  it('shows the offline line even with both channels joined', async () => {
    await mountWith(<Banner />);
    await waitFor(() => expect(harness.made).toHaveLength(2));
    await act(async () => {
      events().status('SUBSCRIBED');
      live().status('SUBSCRIBED');
    });
    expect(screen.queryByRole('alert')).toBeNull();
    mockOnline.value = false;
    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <Layout>
          <Banner />
        </Layout>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/You're offline/)).toBeTruthy();
  });
});
