import type { RoomState } from '@flimme/contract';

// When the room's own sounds play (docs/design/sounds.md), as plain functions.

/**
 * The start sound: a `state_changed` event that says `dealing` reaches a phone that was in the
 * lobby. The event is the live signal. The room re-read can already say `swiping` (the deal is
 * quick), so the sound never waits for the re-read.
 */
export function startSoundDue(before: RoomState | undefined, payload: unknown): boolean {
  const state = (payload as { state?: unknown } | null)?.state;
  return before === 'lobby' && state === 'dealing';
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
