import type { RoomMatch, RoomRound } from '@flimme/contract';

// Which film the room picked (winner.md#which-film): the `room_matches` row with `pick_order` 1,
// whatever its kind. No such row in a `done` room is no pick (M6.17).

/** The pick, or null when the room has none. */
export function pickOf(matches: readonly RoomMatch[] | undefined): RoomMatch | null {
  return matches?.find((match) => match.pick_order === 1) ?? null;
}

/**
 * The single-film pick (Q4.4): a `finale` pick made with no vote, so the room has no round.
 * `rounds` is undefined until read: the answer is then "not known", never "yes". This is also
 * what a live phone concludes, since the `match` event's `reason: 'only_film'` and an empty
 * `api.rounds` describe the same room.
 */
export function isOnlyFilmPick(
  pick: RoomMatch | null,
  rounds: readonly RoomRound[] | undefined,
): boolean {
  return pick?.kind === 'finale' && rounds !== undefined && rounds.length === 0;
}
