import type { RoomState } from '@flimme/contract';
import { useEffect, useRef } from 'react';

import { arriveSoundFor, playSound, preloadSounds, releaseSounds } from '@/lib/sound';

import { claimStartSound, clearLive, noteLive, takeLive } from './live-moments';
import type { RoomRealtime } from './realtime';
import { arrivalSeats, startSoundDue } from './sounds';

type Seat = { member_id: string; left_at: string | null };

/**
 * The room layout's sounds: makes the room's players when it mounts and frees them when the room
 * ends, plays the start sound when a `state_changed` says `dealing` to a phone in the lobby, and an arrival note when a seat
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

  const lastState = useRef<RoomState | undefined>(undefined);
  useEffect(() => {
    lastState.current = state;
  }, [state]);

  useEffect(() => {
    if (!roomId || !realtime) return;
    const stopState = realtime.listen('state_changed', (payload) => {
      if (startSoundDue(lastState.current, payload) && claimStartSound(roomId)) {
        void playSound('start');
      }
    });
    const stopJoined = realtime.listen('member_joined', () => noteLive(roomId, 'joined'));
    return () => {
      stopState();
      stopJoined();
      clearLive(roomId);
    };
  }, [roomId, realtime]);

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
