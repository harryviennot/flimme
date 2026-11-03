import type { RealtimeChannel } from '@supabase/supabase-js';

import { openRoomRealtime, type RealtimeClient } from './controller';
import { bannerFor, isFresh, presenceOf } from './derive';

class FakeChannel {
  state = 'closed';
  presence: Record<string, unknown> = {};
  track = jest.fn(async () => 'ok');
  broadcast: ((m: { event: string; payload?: unknown }) => void) | null = null;
  sync: (() => void) | null = null;
  status: ((s: string) => void) | null = null;
  constructor(
    readonly topic: string,
    readonly config: Record<string, unknown>,
  ) {}
  on(type: string, _filter: unknown, cb: never) {
    if (type === 'broadcast') this.broadcast = cb;
    else this.sync = cb;
    return this;
  }
  subscribe(cb: (s: string) => void) {
    this.status = cb;
    return this;
  }
  presenceState() {
    return this.presence;
  }
}

function setup() {
  const channels: FakeChannel[] = [];
  const session = {
    value: { expires_at: Date.now() / 1000 + 3600 } as null | { expires_at: number },
  };
  let authCb: (e: string) => void = () => {};
  const removed: FakeChannel[] = [];
  const client = {
    channel: jest.fn((topic: string, opts: { config: Record<string, unknown> }) => {
      const c = new FakeChannel(topic, opts.config);
      channels.push(c);
      return c as unknown as RealtimeChannel;
    }),
    removeChannel: jest.fn(async (c: unknown) => {
      removed.push(c as FakeChannel);
      // Like supabase-js: our own removal reports CLOSED.
      (c as FakeChannel).status?.('CLOSED');
    }),
    auth: {
      getSession: jest.fn(async () => ({ data: { session: session.value } })),
      onAuthStateChange: jest.fn((cb: (e: string) => void) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
    },
  };
  const onSubscribed = jest.fn(async () => undefined);
  const onEvent = jest.fn();
  const rt = openRoomRealtime({
    client: client as unknown as RealtimeClient,
    roomId: 'room-1',
    memberId: 'seat-1',
    onSubscribed,
    onEvent,
  });
  return {
    rt,
    client,
    channels,
    removed,
    session,
    onSubscribed,
    onEvent,
    auth: (e: string) => authCb(e),
    events: () => channels.filter((c) => c.topic === 'room:room-1').at(-1)!,
    live: () => channels.filter((c) => c.topic === 'room:room-1:live').at(-1)!,
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
afterEach(() => jest.useRealTimers());

describe('opening and closing', () => {
  it('opens two private channels, the live one keyed by the seat', () => {
    const t = setup();
    expect(t.events().config).toEqual({ private: true });
    expect(t.live().config).toEqual({ private: true, presence: { key: 'seat-1' } });
  });

  it('removes both on close and starts no recovery from the CLOSED that follows', async () => {
    const t = setup();
    t.rt.close();
    await flush();
    expect(t.removed).toHaveLength(2);
    jest.advanceTimersByTime(60_000);
    expect(t.channels).toHaveLength(2);
  });
});

describe('reopening a room at once', () => {
  it('waits for the channel that is still leaving, then asks for a new one', async () => {
    const t = setup();
    const leaving = t.events();
    t.rt.close();
    leaving.state = 'leaving';
    t.client.channel.mockImplementationOnce(() => leaving as unknown as RealtimeChannel);
    const before = t.channels.length;
    const again = openRoomRealtime({
      client: t.client as unknown as RealtimeClient,
      roomId: 'room-1',
      memberId: 'seat-1',
      onSubscribed: jest.fn(),
    });
    await flush();
    const fresh = t.channels.slice(before).filter((c) => c.topic === 'room:room-1');
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).not.toBe(leaving);
    expect(fresh[0]?.status).not.toBeNull();
    again.close();
  });
});

describe('events', () => {
  it('drops an event that is not known', () => {
    const t = setup();
    const handler = jest.fn();
    t.rt.listen('match', handler);
    t.events().broadcast!({ event: 'surprise', payload: {} });
    expect(handler).not.toHaveBeenCalled();
    expect(t.onEvent).not.toHaveBeenCalled();
  });

  it('gives a known event to its listeners with the payload, even an odd one', () => {
    const t = setup();
    const handler = jest.fn();
    t.rt.listen('match', handler);
    t.events().broadcast!({ event: 'match', payload: { title_id: 3 } });
    t.events().broadcast!({ event: 'state_changed' });
    expect(handler).toHaveBeenCalledWith({ title_id: 3 });
    expect(t.onEvent).toHaveBeenCalledWith('state_changed', undefined);
  });
});

describe('statuses', () => {
  it('re-reads and tracks again on every SUBSCRIBED, the first and a later one', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    expect(t.live().track).toHaveBeenCalledWith({ swipe_count: 0, done: false });
    expect(t.onSubscribed).toHaveBeenLastCalledWith({ recovered: false });
    t.live().status!('CHANNEL_ERROR');
    t.live().status!('SUBSCRIBED');
    expect(t.live().track).toHaveBeenCalledTimes(2);
    expect(t.onSubscribed).toHaveBeenCalledTimes(2);
    expect(t.onSubscribed).toHaveBeenLastCalledWith({ recovered: true });
  });

  it('creates nothing on CHANNEL_ERROR or TIMED_OUT', () => {
    const t = setup();
    t.events().status!('CHANNEL_ERROR');
    t.live().status!('TIMED_OUT');
    jest.advanceTimersByTime(60_000);
    expect(t.channels).toHaveLength(2);
    expect(t.rt.getState().events).toBe('down');
  });

  it('replaces a channel that closed by itself, with the backoff 1, 2, 5, 10, 10', async () => {
    const t = setup();
    t.events().status!('SUBSCRIBED');
    for (const delay of [1000, 2000, 5000, 10000, 10000]) {
      const before = t.channels.length;
      t.events().status!('CLOSED');
      await flush();
      expect(t.channels).toHaveLength(before);
      jest.advanceTimersByTime(delay - 1);
      await flush();
      expect(t.channels).toHaveLength(before);
      jest.advanceTimersByTime(1);
      await flush();
      expect(t.channels).toHaveLength(before + 1);
    }
    // A SUBSCRIBED starts the backoff again from 1 second.
    t.events().status!('SUBSCRIBED');
    t.events().status!('CLOSED');
    const before = t.channels.length;
    jest.advanceTimersByTime(1000);
    await flush();
    expect(t.channels).toHaveLength(before + 1);
  });

  it('waits for a valid session before it creates the new channel', async () => {
    const t = setup();
    t.session.value = null;
    t.events().status!('CLOSED');
    jest.advanceTimersByTime(1000);
    await flush();
    expect(t.channels).toHaveLength(2);
    t.session.value = { expires_at: Date.now() / 1000 + 3600 };
    t.auth('TOKEN_REFRESHED');
    await flush();
    expect(t.channels).toHaveLength(3);
  });

  it('recreates a closed channel at once when the app returns, and leaves joined ones', async () => {
    const t = setup();
    t.events().state = 'joined';
    t.live().state = 'joined';
    t.rt.recreateClosed();
    await flush();
    expect(t.channels).toHaveLength(2);
    t.live().state = 'closed';
    t.rt.recreateClosed();
    await flush();
    expect(t.channels).toHaveLength(3);
    expect(t.live().topic).toBe('room:room-1:live');
  });
});

describe('the connection', () => {
  it('shows nothing for a problem fixed within 2 s, reconnecting after, stillTrying at 30 s', () => {
    const t = setup();
    t.events().status!('SUBSCRIBED');
    t.live().status!('SUBSCRIBED');
    expect(bannerFor(t.rt.getState(), Date.now())).toBeNull();
    t.live().status!('CHANNEL_ERROR');
    jest.advanceTimersByTime(1999);
    expect(bannerFor(t.rt.getState(), Date.now())).toBeNull();
    jest.advanceTimersByTime(1);
    expect(bannerFor(t.rt.getState(), Date.now())).toBe('reconnecting');
    jest.advanceTimersByTime(28_000);
    expect(bannerFor(t.rt.getState(), Date.now())).toBe('stillTrying');
    t.live().status!('SUBSCRIBED');
    expect(bannerFor(t.rt.getState(), Date.now())).toBeNull();
  });

  it('shows offline even with both channels joined, and leaves when both are back', () => {
    const t = setup();
    t.events().status!('SUBSCRIBED');
    t.live().status!('SUBSCRIBED');
    t.rt.setOnline(false);
    expect(bannerFor(t.rt.getState(), Date.now())).toBe('offline');
    t.rt.setOnline(true);
    expect(bannerFor(t.rt.getState(), Date.now())).toBeNull();
  });

  it('is fresh only online, with both channels joined and the re-read settled', async () => {
    const t = setup();
    expect(isFresh(t.rt.getState())).toBe(false);
    t.events().status!('SUBSCRIBED');
    t.live().status!('SUBSCRIBED');
    expect(isFresh(t.rt.getState())).toBe(false); // still reading
    await flush();
    expect(isFresh(t.rt.getState())).toBe(true);
    t.rt.setOnline(false);
    expect(isFresh(t.rt.getState())).toBe(false);
    t.rt.setOnline(true);
    t.live().status!('TIMED_OUT');
    expect(isFresh(t.rt.getState())).toBe(false);
  });
});

describe('presence', () => {
  const seats = ['seat-1', 'seat-2'];

  it('counts a seat in the presence state as online, and the own seat while joined', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    t.live().presence = { 'seat-2': [{}] };
    t.live().sync!();
    const { online } = presenceOf(t.rt.getState(), seats, 'seat-1', Date.now());
    expect([...online].sort()).toEqual(['seat-1', 'seat-2']);
  });

  it('turns a seat away after 90 s missing, not 89', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    t.live().presence = { 'seat-2': [{}] };
    t.live().sync!();
    t.live().presence = {};
    t.live().sync!();
    jest.advanceTimersByTime(89_000);
    expect(presenceOf(t.rt.getState(), seats, 'seat-1', Date.now()).away.size).toBe(0);
    jest.advanceTimersByTime(1000);
    const result = presenceOf(t.rt.getState(), seats, 'seat-1', Date.now());
    expect([...result.away]).toEqual(['seat-2']);
  });

  it('counts the 90 s from the sync that dropped the seat, however long it was there', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    t.live().presence = { 'seat-2': [{}] };
    t.live().sync!();
    jest.advanceTimersByTime(600_000);
    t.live().presence = {};
    t.live().sync!();
    jest.advanceTimersByTime(89_000);
    expect(presenceOf(t.rt.getState(), seats, 'seat-1', Date.now()).away.size).toBe(0);
    jest.advanceTimersByTime(1000);
    expect(presenceOf(t.rt.getState(), seats, 'seat-1', Date.now()).away.size).toBe(1);
  });

  it('counts a late joiner from its joined_at, not from the SUBSCRIBED', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    jest.advanceTimersByTime(80_000);
    const joinedAt = new Map([['seat-2', Date.now()]]);
    jest.advanceTimersByTime(20_000);
    const state = t.rt.getState();
    expect(presenceOf(state, seats, 'seat-1', Date.now()).away.has('seat-2')).toBe(true);
    expect(presenceOf(state, seats, 'seat-1', Date.now(), joinedAt).away.has('seat-2')).toBe(false);
    jest.advanceTimersByTime(70_000);
    expect(presenceOf(state, seats, 'seat-1', Date.now(), joinedAt).away.has('seat-2')).toBe(true);
  });

  it('counts a seat never seen from the first SUBSCRIBED', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    jest.advanceTimersByTime(89_999);
    expect(presenceOf(t.rt.getState(), seats, 'seat-1', Date.now()).away.size).toBe(0);
    jest.advanceTimersByTime(1);
    expect(presenceOf(t.rt.getState(), seats, 'seat-1', Date.now()).away.size).toBe(1);
  });

  it('turns nobody away while the own live channel is down', () => {
    const t = setup();
    t.live().status!('SUBSCRIBED');
    t.live().status!('CHANNEL_ERROR');
    jest.advanceTimersByTime(600_000);
    expect(presenceOf(t.rt.getState(), seats, 'seat-1', Date.now()).away.size).toBe(0);
  });
});

describe('logging', () => {
  it('logs nothing, whatever happens', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    const t = setup();
    t.events().status!('SUBSCRIBED');
    t.events().broadcast!({ event: 'match', payload: { title_id: 3 } });
    t.live().status!('CHANNEL_ERROR');
    t.events().status!('CLOSED');
    jest.advanceTimersByTime(2000);
    await flush();
    t.rt.close();
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    spies.forEach((spy) => spy.mockRestore());
  });
});
