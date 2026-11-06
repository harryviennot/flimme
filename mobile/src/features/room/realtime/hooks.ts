import type { LivePresence, RoomEvent } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import { useOnline } from '@/features/network';
import { supabase } from '@/lib/supabase';

import { beatNow } from '../heartbeat';
import { GENRES_KEY, ROOM_KEY, SEATS_KEY, useMySeat, useRoomSeats } from '../queries';
import { useRoomRealtime } from './context';
import {
  openRoomRealtime,
  type RealtimeClient,
  type RoomRealtime,
  type RoomRealtimeState,
} from './controller';
import { bannerFor, isFresh, nextBannerChange, presenceOf, type BannerKind } from './derive';

/** Which re-read each known event asks for. The others have no handler yet (later slices). */
export const EVENT_READS: Partial<Record<RoomEvent, 'seats' | 'room' | 'genres'>> = {
  member_joined: 'seats',
  member_left: 'seats',
  member_removed: 'seats',
  seat_updated: 'seats',
  // Only counts changed, never who (M6.53): the phone re-reads api.room_genres.
  genres_changed: 'genres',
  host_changed: 'seats',
  settings_changed: 'room',
  room_locked: 'room',
  state_changed: 'room',
  // Play again (M6.23): the room row carries the next room's code.
  next_room: 'room',
};

/**
 * Opens the room's two channels once the phone's seat is known and closes them on unmount.
 * Called once, by the room layout, which hands the result to `RoomRealtimeProvider`.
 */
export function useRoomChannels(
  roomId: string | undefined,
  client: RealtimeClient = supabase as unknown as RealtimeClient,
): RoomRealtime | null {
  const queryClient = useQueryClient();
  const online = useOnline();
  const memberId = useMySeat(roomId)?.member_id;
  const [realtime, setRealtime] = useReducer(
    (_: RoomRealtime | null, next: RoomRealtime | null) => next,
    null,
  );

  useEffect(() => {
    if (!roomId || !memberId) return;
    const opened = openRoomRealtime({
      client,
      roomId,
      memberId,
      onSubscribed: ({ recovered }) => {
        if (recovered) beatNow(roomId);
        return queryClient.invalidateQueries({ queryKey: ROOM_KEY(roomId) });
      },
      onEvent: (event) => {
        const what = EVENT_READS[event];
        if (what === 'seats') void queryClient.invalidateQueries({ queryKey: SEATS_KEY(roomId) });
        // `exact`: the room alone. The layout routes on what this read says, never on the payload.
        else if (what === 'genres')
          void queryClient.invalidateQueries({ queryKey: GENRES_KEY(roomId) });
        else if (what === 'room')
          void queryClient.invalidateQueries({ queryKey: ROOM_KEY(roomId), exact: true });
      },
    });
    setRealtime(opened);
    return () => {
      opened.close();
      setRealtime(null);
    };
  }, [client, queryClient, roomId, memberId]);

  useEffect(() => {
    realtime?.setOnline(online);
  }, [realtime, online]);

  useEffect(() => {
    if (!realtime) return;
    let last = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') realtime.recreateClosed();
      last = next;
    });
    return () => subscription.remove();
  }, [realtime]);

  return realtime;
}

const IDLE: RoomRealtimeState = {
  online: true,
  events: 'connecting',
  live: 'connecting',
  present: new Set(),
  progress: new Map(),
  lastSeen: new Map(),
  liveJoinedAt: null,
  problemSince: null,
  reading: false,
};

function useRealtimeState(realtime: RoomRealtime | null): RoomRealtimeState {
  const subscribe = useMemo(
    () => (listener: () => void) => (realtime ? realtime.subscribe(listener) : () => {}),
    [realtime],
  );
  return useSyncExternalStore(
    subscribe,
    () => (realtime ? realtime.getState() : IDLE),
    () => IDLE,
  );
}

/**
 * The clock for time-based answers (the banner, away). It reads again right after `state`
 * changes and at the moment `nextChange` (ms from the reading) says the answer changes.
 */
function useNow(
  state: RoomRealtimeState,
  nextChange: (now: number) => number | null,
  also?: unknown,
): number {
  const [now, setNow] = useState(() => Date.now());
  const next = useEffectEvent(nextChange);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [state, also]);
  useEffect(() => {
    const ms = next(Date.now());
    if (ms === null) return;
    const timer = setTimeout(() => setNow(Date.now()), ms + 1);
    return () => clearTimeout(timer);
  }, [state, now, also]);
  return now;
}

/** The banner to show, and whether the room is fresh (Start waits for it). */
export function useRoomConnection(roomId?: string): {
  banner: BannerKind | null;
  fresh: boolean;
} {
  void roomId;
  const realtime = useRoomRealtime();
  const state = useRealtimeState(realtime);
  const now = useNow(state, (at) => nextBannerChange(state, at));
  // Before the channels exist (the seat is still loading) there is nothing to report.
  const banner = realtime ? bannerFor(state, now) : null;
  return { banner, fresh: !!realtime && isFresh(state) };
}

/** Seat ids that are online and away (lobby.md#present-and-away). */
export function useRoomPresence(roomId: string | undefined): {
  online: ReadonlySet<string>;
  away: ReadonlySet<string>;
  /** What each seat last tracked: its swipe count and whether it is done. */
  progress: ReadonlyMap<string, LivePresence>;
} {
  const realtime = useRoomRealtime();
  const state = useRealtimeState(realtime);
  const seats = useRoomSeats(roomId).data;
  const mine = useMySeat(roomId)?.member_id;
  const ids = useMemo(
    () => (seats ?? []).filter((seat) => seat.left_at === null).map((seat) => seat.member_id),
    [seats],
  );
  // A seat that joined late is not away until 90 s after it joined (lobby.md#present-and-away).
  const joinedAt = useMemo(
    () =>
      new Map(
        (seats ?? []).flatMap((seat) => {
          const at = Date.parse(seat.joined_at);
          return Number.isNaN(at) ? [] : [[seat.member_id, at] as const];
        }),
      ),
    [seats],
  );
  const now = useNow(
    state,
    (at) => presenceOf(state, ids, mine, at, joinedAt).nextChange,
    joinedAt,
  );
  const result = presenceOf(state, ids, mine, now, joinedAt);
  return { online: result.online, away: result.away, progress: state.progress };
}

/** Runs `handler` for each `event` the room hears. For the slices that act on events. */
export function useRoomEvent(
  roomId: string | undefined,
  event: RoomEvent,
  handler: (payload: unknown) => void,
): void {
  void roomId;
  const realtime = useRoomRealtime();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => realtime?.listen(event, (payload) => latest.current(payload)), [realtime, event]);
}
