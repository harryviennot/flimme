import {
  ROOM_EVENTS,
  roomLiveTopic,
  roomTopic,
  type LivePresence,
  type RoomEvent,
} from '@flimme/contract';
import type { RealtimeChannel } from '@supabase/supabase-js';

// The two Realtime channels of a room and what the phone does when they misbehave
// (app-structure.md#spike-4-findings-the-private-room-channel-m311-3-november-2026,
// reconnecting.md#the-connection-recipe). No React in here, so it is tested with a fake client.
//
// Rule 7: nothing in this file logs. A topic, a seat id or a payload never leaves it except to
// the handlers the caller passes in.

/** 1, 2, 5 and 10 seconds, then every 10 seconds. */
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000] as const;

/** Where a channel stands. `connecting` is the time before its first `SUBSCRIBED`. */
export type LinkStatus = 'connecting' | 'joined' | 'down';

export type RoomRealtimeState = {
  online: boolean;
  events: LinkStatus;
  live: LinkStatus;
  /** Seat ids in the live channel's presence, as of the last sync. */
  present: ReadonlySet<string>;
  /** When each seat was last seen in presence (ms). */
  lastSeen: ReadonlyMap<string, number>;
  /** When the live channel last reached `SUBSCRIBED` (ms), or null if it never did. */
  liveJoinedAt: number | null;
  /** When the room last stopped being fully connected (ms), or null while it is. */
  problemSince: number | null;
  /** True from a `SUBSCRIBED` until the re-read it triggers has settled. */
  reading: boolean;
};

/** The part of the Supabase client the channels use, so a test can pass a fake. */
export type RealtimeClient = {
  channel: (topic: string, opts?: { config?: Record<string, unknown> }) => RealtimeChannel;
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
  auth: {
    getSession: () => Promise<{
      data: { session: { expires_at?: number } | null };
    }>;
    onAuthStateChange: (callback: (event: string) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
};

export type RoomRealtimeOptions = {
  client: RealtimeClient;
  roomId: string;
  /** The phone's seat id: the live channel's presence key. */
  memberId: string;
  /**
   * Called on every `SUBSCRIBED`, the first or a later one: re-read what may have changed.
   * The state's `reading` stays true until the returned promise settles.
   */
  onSubscribed: (info: { recovered: boolean }) => Promise<unknown> | void;
  /** Called for every known event, after the listeners (the re-reads). */
  onEvent?: (event: RoomEvent, payload: unknown) => void;
  now?: () => number;
};

type Kind = 'events' | 'live';

type Slot = {
  kind: Kind;
  topic: string;
  channel: RealtimeChannel | null;
  attempt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  hadProblem: boolean;
  joinedBefore: boolean;
};

const KNOWN = new Set<string>(ROOM_EVENTS);

export type RoomRealtime = {
  getState: () => RoomRealtimeState;
  subscribe: (listener: () => void) => () => void;
  /** Listens for one known event. Returns the way to stop. */
  listen: (event: RoomEvent, handler: (payload: unknown) => void) => () => void;
  setOnline: (online: boolean) => void;
  /** The presence this phone tracks (re-tracked on every `SUBSCRIBED`). */
  setPresence: (presence: LivePresence) => void;
  /** Back in the foreground: recreate any channel that is closed, at once. */
  recreateClosed: () => void;
  close: () => void;
};

export function openRoomRealtime(options: RoomRealtimeOptions): RoomRealtime {
  const { client, roomId, memberId } = options;
  const now = options.now ?? Date.now;

  let state: RoomRealtimeState = {
    online: true,
    events: 'connecting',
    live: 'connecting',
    present: new Set(),
    lastSeen: new Map(),
    liveJoinedAt: null,
    problemSince: now(),
    reading: false,
  };
  const listeners = new Set<() => void>();
  const handlers = new Map<RoomEvent, Set<(payload: unknown) => void>>();
  const removedByUs = new WeakSet<RealtimeChannel>();
  let myPresence: LivePresence = { swipe_count: 0, done: false };
  let closed = false;
  let reads = 0;

  const slots: Record<Kind, Slot> = {
    events: blankSlot('events', roomTopic(roomId)),
    live: blankSlot('live', roomLiveTopic(roomId)),
  };

  function blankSlot(kind: Kind, topic: string): Slot {
    return {
      kind,
      topic,
      channel: null,
      attempt: 0,
      timer: undefined,
      hadProblem: false,
      joinedBefore: false,
    };
  }

  function set(patch: Partial<RoomRealtimeState>) {
    const next = { ...state, ...patch };
    const connected = next.events === 'joined' && next.live === 'joined';
    if (connected) next.problemSince = null;
    else if (next.problemSince === null) next.problemSince = now();
    state = next;
    listeners.forEach((listener) => listener());
  }

  function emit(event: RoomEvent, payload: unknown) {
    handlers.get(event)?.forEach((handler) => handler(payload));
    options.onEvent?.(event, payload);
  }

  function readPresence(channel: RealtimeChannel) {
    const keys = Object.keys(channel.presenceState());
    const at = now();
    const lastSeen = new Map(state.lastSeen);
    keys.forEach((key) => lastSeen.set(key, at));
    set({ present: new Set(keys), lastSeen });
  }

  function onStatus(slot: Slot, channel: RealtimeChannel, status: string) {
    if (closed || slot.channel !== channel) return;
    if (status === 'SUBSCRIBED') {
      const recovered = slot.hadProblem || slot.joinedBefore;
      slot.hadProblem = false;
      slot.joinedBefore = true;
      slot.attempt = 0;
      reads += 1;
      set({
        [slot.kind]: 'joined',
        reading: true,
        ...(slot.kind === 'live' ? { liveJoinedAt: now() } : {}),
      } as Partial<RoomRealtimeState>);
      if (slot.kind === 'live') void channel.track(myPresence).catch(() => {});
      const done = () => {
        reads -= 1;
        if (!closed && reads === 0) set({ reading: false });
      };
      try {
        Promise.resolve(options.onSubscribed({ recovered })).then(done, done);
      } catch {
        done();
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // supabase-js rejoins by itself. No retry loop on top.
      slot.hadProblem = true;
      set({ [slot.kind]: 'down' } as Partial<RoomRealtimeState>);
    } else if (status === 'CLOSED') {
      if (removedByUs.has(channel)) return;
      // Nothing brings a dead channel back: start over with a new one.
      slot.hadProblem = true;
      discard(slot);
      set({ [slot.kind]: 'down' } as Partial<RoomRealtimeState>);
      scheduleRecreate(slot);
    }
  }

  function discard(slot: Slot) {
    const channel = slot.channel;
    slot.channel = null;
    if (channel) {
      removedByUs.add(channel);
      void client.removeChannel(channel).catch(() => {});
    }
  }

  function create(slot: Slot) {
    const config: Record<string, unknown> = { private: true };
    if (slot.kind === 'live') config.presence = { key: memberId };
    const channel = client.channel(slot.topic, { config });
    slot.channel = channel;
    if (slot.kind === 'events') {
      channel.on('broadcast', { event: '*' }, (message: { event: string; payload?: unknown }) => {
        if (closed || !KNOWN.has(message.event)) return;
        emit(message.event as RoomEvent, message.payload);
      });
    } else {
      channel.on('presence', { event: 'sync' }, () => {
        if (!closed && slot.channel === channel) readPresence(channel);
      });
    }
    channel.subscribe((status: string) => onStatus(slot, channel, status));
  }

  function scheduleRecreate(slot: Slot) {
    clearTimeout(slot.timer);
    const delay = BACKOFF_MS[Math.min(slot.attempt, BACKOFF_MS.length - 1)];
    slot.attempt += 1;
    slot.timer = setTimeout(() => void recreate(slot), delay);
  }

  async function recreate(slot: Slot) {
    clearTimeout(slot.timer);
    slot.timer = undefined;
    if (closed || slot.channel) return;
    let valid = false;
    try {
      // getSession refreshes an expired token before it answers.
      const { data } = await client.auth.getSession();
      valid = !!data.session && (data.session.expires_at ?? Infinity) * 1000 > now();
    } catch {
      valid = false;
    }
    if (closed || slot.channel) return;
    if (!valid) {
      scheduleRecreate(slot);
      return;
    }
    set({ [slot.kind]: 'connecting' } as Partial<RoomRealtimeState>);
    create(slot);
  }

  const authWatch = client.auth.onAuthStateChange((event) => {
    if (event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN') return;
    // A fresh token is what a dead channel was waiting for.
    (Object.values(slots) as Slot[]).forEach((slot) => {
      if (!slot.channel && slot.timer) void recreate(slot);
    });
  });

  create(slots.events);
  create(slots.live);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    listen(event, handler) {
      const set_ = handlers.get(event) ?? new Set();
      set_.add(handler);
      handlers.set(event, set_);
      return () => void set_.delete(handler);
    },
    setOnline(online) {
      if (online === state.online) return;
      set({ online });
    },
    setPresence(presence) {
      myPresence = presence;
      const live = slots.live.channel;
      if (live && state.live === 'joined') void live.track(presence).catch(() => {});
    },
    recreateClosed() {
      if (closed) return;
      (Object.values(slots) as Slot[]).forEach((slot) => {
        if (slot.channel && slot.channel.state === 'closed' && !removedByUs.has(slot.channel)) {
          discard(slot);
          set({ [slot.kind]: 'down' } as Partial<RoomRealtimeState>);
          slot.attempt = 0;
          void recreate(slot);
        } else if (!slot.channel) {
          void recreate(slot);
        }
      });
    },
    close() {
      if (closed) return;
      closed = true;
      authWatch.data.subscription.unsubscribe();
      listeners.clear();
      (Object.values(slots) as Slot[]).forEach((slot) => {
        clearTimeout(slot.timer);
        discard(slot);
      });
    },
  };
}
