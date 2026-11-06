import type { RoomState } from '@flimme/contract';

// When the room's own sounds play (docs/design/sounds.md), as plain functions.

/** The start sound: this phone saw the room go from the lobby to dealing, live. */
export function startSoundDue(
  before: RoomState | undefined,
  after: RoomState | undefined,
  live: boolean,
): boolean {
  return live && before === 'lobby' && after === 'dealing';
}

/**
 * The seat count to play an arrival for, or null for none. `before` and `after` are the ids of
 * the seats that have not left. It plays only on a phone already in the lobby (its own seat is in
 * `before`), for a seat that is new and not its own, while the room is in the lobby and the
 * arrival was heard live. Two arrivals in one read give one count: the final one.
 */
export function arrivalSeats(args: {
  before: ReadonlySet<string> | null;
  after: ReadonlySet<string>;
  mine: string | undefined;
  state: RoomState | undefined;
  live: boolean;
}): number | null {
  const { before, after, mine, state, live } = args;
  if (!live || !before || !mine || state !== 'lobby' || !before.has(mine)) return null;
  const arrived = [...after].some((id) => !before.has(id) && id !== mine);
  return arrived ? after.size : null;
}
