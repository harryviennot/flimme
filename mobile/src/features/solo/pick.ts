import type { RoomState, SoloPickResult } from '@flimme/contract';

// The pick sheet's tap (swipe.md#the-pick-sheet): the queued votes go first, so a like given
// offline is on the server, then `api.solo_pick`. Every answer becomes an outcome the sheet shows.

export type PickOutcome =
  | { kind: 'picked'; titleId: number }
  /** The like was undone in a race. */
  | { kind: 'not_liked' }
  /** The session ended (the sweeper): Play with the session-ended note. */
  | { kind: 'closed'; state: RoomState }
  /** The call failed, or the votes could not be sent yet. */
  | { kind: 'failed' };

export type PickDeps = {
  flush: () => Promise<void>;
  /** Votes of this room still waiting after the flush. */
  waitingVotes: (roomId: string) => number;
  soloPick: (args: { room_id: string; title_id: number }) => Promise<SoloPickResult>;
};

export async function pickFilm(
  roomId: string,
  titleId: number,
  deps: PickDeps,
): Promise<PickOutcome> {
  try {
    await deps.flush();
    // Still waiting (offline): a pick sent now could name a like the server hasn't seen.
    if (deps.waitingVotes(roomId) > 0) return { kind: 'failed' };
    const answer = await deps.soloPick({ room_id: roomId, title_id: titleId });
    switch (answer.status) {
      case 'ok':
        return { kind: 'picked', titleId: answer.title_id };
      case 'not_liked':
        return { kind: 'not_liked' };
      case 'closed':
        return { kind: 'closed', state: answer.state };
    }
  } catch {
    return { kind: 'failed' };
  }
}

// The solo pick's landing (moments.md#the-solo-pick) plays only when this phone just made the pick;
// a cold start or a return to the room shows the screen straight away.
const justPicked = new Set<string>();

export function markJustPicked(roomId: string): void {
  justPicked.add(roomId);
}

/** True once after `markJustPicked`: the winner screen plays the landing. */
export function takeJustPicked(roomId: string): boolean {
  return justPicked.delete(roomId);
}
