import type { RoomSeat } from '@flimme/contract';

// Who has locked in (final-cut.md#who-has-locked-in), without JSX. Seat ids only, never a ballot.

/** The seats in the row: those still in the room, in seat order (`joined_at`, then `member_id`). */
export function rowSeats(seats: readonly RoomSeat[] | undefined): RoomSeat[] {
  return (seats ?? [])
    .filter((seat) => seat.left_at === null)
    .sort(
      (a, b) =>
        Date.parse(a.joined_at) - Date.parse(b.joined_at) ||
        (a.member_id < b.member_id ? -1 : a.member_id > b.member_id ? 1 : 0),
    );
}

/** Locked-in seats that are still in the row. `locked` can list seats that left. */
export function lockedInRow(
  locked: readonly string[],
  row: readonly RoomSeat[],
): ReadonlySet<string> {
  const present = new Set(row.map((seat) => seat.member_id));
  return new Set(locked.filter((id) => present.has(id)));
}

/** The count to show: seats in the row that locked in, never more than `of`. */
export function lockedCount(
  locked: readonly string[],
  row: readonly RoomSeat[],
  of: number | null,
): number {
  const count = lockedInRow(locked, row).size;
  return of === null ? count : Math.min(count, of);
}

/** Every present seat has locked in: the round closes at once. */
export function everyoneLocked(locked: readonly string[], of: number | null): boolean {
  return of !== null && of > 0 && new Set(locked).size >= of;
}

/** The `round_progress` event's payload, or null when it is not one. */
export function readProgressEvent(
  payload: unknown,
): { round_id: string; locked: string[]; of: number } | null {
  const p = payload as Record<string, unknown> | null;
  if (
    !p ||
    typeof p.round_id !== 'string' ||
    typeof p.of !== 'number' ||
    !Array.isArray(p.locked) ||
    !p.locked.every((id) => typeof id === 'string')
  ) {
    return null;
  }
  return { round_id: p.round_id, locked: p.locked as string[], of: p.of };
}

/** Lock-ins only grow: a late answer never takes a light off. */
export function mergeLocked(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}
