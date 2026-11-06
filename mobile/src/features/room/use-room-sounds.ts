import type { RoomState } from '@flimme/contract';
import { useEffect, useRef } from 'react';

import { arriveSoundFor, playSound, preloadSounds, releaseSounds } from '@/lib/sound';

import { clearLive, noteLive, takeLive } from './live-moments';
import type { RoomRealtime } from './realtime';
import { arrivalSeats, startSoundDue } from './sounds';

type Seat = { member_id: string; left_at: string | null };

/**
 * The room layout's sounds: makes the room's players when it mounts and frees them when the room
 * ends, plays the start sound when the lobby goes to dealing live, and an arrival note when a seat
 * joins while this phone is in the lobby. A re-read, a reconnect or a cold start plays nothing.
 */
export function useRoomSounds(
  roomId: string | undefined,
  state: RoomState | undefined,
  seats: readonly Seat[] | undefined,
  mine: string | undefined,
  realtime: Pick<RoomRealtime, 'listen'> | null,
): void {
  useEffect(() => {
    preloadSounds('room');
    return () => {
      releaseSounds('room');
      releaseSounds('finale');
    };
  }, []);

  useEffect(() => {
    if (!roomId || !realtime) return;
    const stopState = realtime.listen('state_changed', () => noteLive(roomId, 'state'));
    const stopJoined = realtime.listen('member_joined', () => noteLive(roomId, 'joined'));
    return () => {
      stopState();
      stopJoined();
      clearLive(roomId);
    };
  }, [roomId, realtime]);

  const lastState = useRef<RoomState | undefined>(undefined);
  useEffect(() => {
    const before = lastState.current;
    lastState.current = state;
    if (!roomId || before === state) return;
    const live = takeLive(roomId, 'state');
    if (startSoundDue(before, state, live)) void playSound('start');
  }, [roomId, state]);

  const lastSeats = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!roomId || !seats) return;
    const after = new Set(seats.filter((s) => s.left_at === null).map((s) => s.member_id));
    const before = lastSeats.current;
    lastSeats.current = after;
    if (before && [...after].every((id) => before.has(id))) return;
    const live = before ? takeLive(roomId, 'joined') : false;
    const count = arrivalSeats({ before, after, mine, state, live });
    if (count !== null) void playSound(arriveSoundFor(count));
  }, [roomId, seats, mine, state]);
}
