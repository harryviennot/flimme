import { ApiError, type RoomSeat } from '@flimme/contract';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/api';

/**
 * The room's query key. Everything the room's screens read lives under this prefix (seats,
 * matches, rounds, cards), so one `invalidateQueries({ queryKey: ROOM_KEY(id) })` re-reads them all.
 */
export const ROOM_KEY = (roomId: string) => ['room', roomId] as const;
export const SEATS_KEY = (roomId: string) => ['room', roomId, 'seats'] as const;
export const GENRES_KEY = (roomId: string) => ['room', roomId, 'genres'] as const;

// A dropped connection pauses the query and resumes it by itself; anything else gets one retry.
const retry = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.kind === 'network') && count < 1;

/** The room as the phone's seat sees it. `null`: not a member, or the seat was removed. */
export function useRoom(roomId: string | undefined) {
  return useQuery({
    queryKey: ROOM_KEY(roomId ?? ''),
    enabled: !!roomId,
    queryFn: () => api.room({ room_id: roomId ?? '' }),
    // Always read on mount: a cached answer may be from before the player (re)joined.
    staleTime: 0,
    refetchOnMount: 'always',
    retry,
  });
}

/** Every seat of the room, oldest first, including seats that left. */
export function useRoomSeats(roomId: string | undefined) {
  return useQuery({
    queryKey: SEATS_KEY(roomId ?? ''),
    enabled: !!roomId,
    queryFn: () => api.roomSeats({ room_id: roomId ?? '' }),
    // Always read on mount: a cached answer may be from before the player (re)joined.
    staleTime: 0,
    refetchOnMount: 'always',
    retry,
  });
}

/** The phone's own seat if it is still in the room (`is_me`, not left), else null. */
export function mySeatOf(seats: readonly RoomSeat[] | undefined): RoomSeat | null {
  return seats?.find((seat) => seat.is_me === true && seat.left_at === null) ?? null;
}

export function useMySeat(roomId: string | undefined): RoomSeat | null {
  const seats = useRoomSeats(roomId);
  return mySeatOf(seats.data);
}

/**
 * Tonight's offered genres with their counts, and this seat's own picks (lobby.md#your-genres-tonight).
 * Under the room's prefix, so a reconnect and the foreground re-read it; `genres_changed` does too.
 */
export function useRoomGenres(roomId: string | undefined) {
  return useQuery({
    queryKey: GENRES_KEY(roomId ?? ''),
    enabled: !!roomId,
    queryFn: () => api.roomGenres({ room_id: roomId ?? '' }),
    staleTime: 0,
    refetchOnMount: 'always',
    retry,
  });
}
