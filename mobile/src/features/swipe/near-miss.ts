// The near miss (swipe.md#the-near-miss): "2 of 3 of you liked this" on a film the player has
// not answered yet. M6.13 fills this in; until then no card shows one.

export type NearMiss = { likes: number; of: number };

/** The latest near-miss count for this film, or null when there is nothing to show. */
export function useNearMiss(titleId: number | undefined): NearMiss | null {
  void titleId;
  return null;
}
