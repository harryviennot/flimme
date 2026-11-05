import type { RoomRow, RoomSeat } from '@flimme/contract';

// The recap's three numbers (recap.md#the-numbers), with `internal.write_room_stats`'s own
// definitions. `rooms.stats` is written later by the server and has no total swipe count, so the
// phone computes them from the room row and the seats it already reads (Q21.1).

export type RecapNumbers = {
  /** From the start to the pick, null when either date is missing or the order is wrong. */
  seconds: number | null;
  /** Seats that swiped at least once. */
  people: number;
  /** Every seat's swipes, together. */
  swipes: number;
};

export function recapNumbers(
  room: Pick<RoomRow, 'started_at' | 'decided_at'>,
  seats: readonly Pick<RoomSeat, 'swipe_count'>[],
): RecapNumbers {
  let seconds: number | null = null;
  if (room.started_at && room.decided_at) {
    const span = (Date.parse(room.decided_at) - Date.parse(room.started_at)) / 1000;
    if (Number.isFinite(span) && span >= 0) seconds = Math.round(span);
  }
  return {
    seconds,
    people: seats.filter((seat) => seat.swipe_count > 0).length,
    swipes: seats.reduce((sum, seat) => sum + seat.swipe_count, 0),
  };
}
