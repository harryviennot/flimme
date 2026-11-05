// A player's ballot on the Final Cut screen (final-cut.md#ranking, #the-veto), without JSX. The
// ballot is what the player tapped, in tap order, and at most one veto. Nothing here moves a
// poster: the screen only changes numbers, rings and the stamp.

export type Ballot = {
  /** Title ids in the order they were tapped. Never holds the vetoed film. */
  tapped: readonly number[];
  /** The one vetoed title id, or null. */
  veto: number | null;
};

export const EMPTY_BALLOT: Ballot = { tapped: [], veto: null };

/** What a poster shows: a solid number, a faint number, or the veto stamp. */
export type Place =
  { kind: 'ranked'; rank: number } | { kind: 'faint'; rank: number } | { kind: 'vetoed' };

/**
 * A tap. A tapped film leaves the ranking and the gap closes; an untapped one takes the next
 * number. The vetoed film does nothing (the screen tells the player to lift the veto).
 */
export function tapFinalist(ballot: Ballot, titleId: number): Ballot {
  if (ballot.veto === titleId) return ballot;
  const at = ballot.tapped.indexOf(titleId);
  if (at >= 0) return { ...ballot, tapped: ballot.tapped.filter((id) => id !== titleId) };
  return { ...ballot, tapped: [...ballot.tapped, titleId] };
}

/**
 * A tap with 2 films (final-cut.md#ranking, "With 2 films"): ranking two films is choosing one.
 * A tap picks the film, a tap on the other moves the pick, a tap on the picked film lifts it.
 * It never ranks a solid 2.
 */
export function tapPick(ballot: Ballot, titleId: number): Ballot {
  return ballot.tapped[0] === titleId
    ? { ...ballot, tapped: [] }
    : { ...ballot, tapped: [titleId] };
}

/**
 * A long press, only where a veto is allowed. On the vetoed film it lifts the veto; on another
 * it moves the veto there; the film leaves the ranking if it was in it. A veto never gets its
 * old rank back.
 */
export function pressFinalist(ballot: Ballot, titleId: number, allowed: boolean): Ballot {
  if (!allowed) return ballot;
  if (ballot.veto === titleId) return { ...ballot, veto: null };
  return { tapped: ballot.tapped.filter((id) => id !== titleId), veto: titleId };
}

/** Where each finalist stands: tapped films 1 to k, then the rest in seed order, minus the veto. */
export function placesOf(seedOrder: readonly number[], ballot: Ballot): Map<number, Place> {
  const places = new Map<number, Place>();
  const tapped = ballot.tapped.filter((id) => seedOrder.includes(id) && id !== ballot.veto);
  tapped.forEach((id, i) => places.set(id, { kind: 'ranked', rank: i + 1 }));
  let next = tapped.length + 1;
  for (const id of seedOrder) {
    if (id === ballot.veto) places.set(id, { kind: 'vetoed' });
    else if (!places.has(id)) places.set(id, { kind: 'faint', rank: next++ });
  }
  return places;
}

/** What `castBallot` gets: the order shown (tapped, then the rest in seed order), minus the veto. */
export function ballotToSend(
  seedOrder: readonly number[],
  ballot: Ballot,
): { ranking: number[]; veto?: number } {
  const places = placesOf(seedOrder, ballot);
  const ranking = seedOrder
    .filter((id) => places.get(id)?.kind !== 'vetoed')
    .sort((a, b) => rankOf(places.get(a)) - rankOf(places.get(b)));
  const veto = seedOrder.find((id) => places.get(id)?.kind === 'vetoed');
  return veto === undefined ? { ranking } : { ranking, veto };
}

function rankOf(place: Place | undefined): number {
  return place && place.kind !== 'vetoed' ? place.rank : Number.MAX_SAFE_INTEGER;
}

/** Whether a long press does anything: a Final Cut with a veto left (final-cut.md#the-veto). */
export function vetoAllowed(
  kind: 'final_cut' | 'ranked_vote',
  vetoesLeft: number | null | undefined,
): boolean {
  return kind === 'final_cut' && (vetoesLeft ?? 0) >= 1;
}
