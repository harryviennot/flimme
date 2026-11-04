// What Start does (lobby.md#starting), without JSX: one call, every answer turned into an
// outcome the screen shows, and the two timers that follow a `dealing` room.
import type { RoomState, StartGameResult } from '@flimme/contract';
import { useEffect, useEffectEvent, useState } from 'react';

/** Still `dealing` this long after the tap: the host's phone calls `start_game` again. */
export const DEAL_RETRY_MS = 8_000;
/** Still `dealing` this long after the tap: the overlay says it takes longer than usual. */
export const DEAL_SLOW_MS = 20_000;

export type StartOutcome =
  /** `ok`, `dealing` or `closed`: read the room again, the layout follows its state. */
  | { kind: 'reread' }
  | { kind: 'need_players'; need: number }
  /** Fewer than 20 films fit: the room is back in the lobby (M5.5). */
  | { kind: 'too_few'; eligible: number }
  | { kind: 'failed' };

export async function runStart(startGame: () => Promise<StartGameResult>): Promise<StartOutcome> {
  try {
    const answer = await startGame();
    switch (answer.status) {
      case 'not_enough_players':
        return { kind: 'need_players', need: answer.need };
      case 'ok':
      case 'dealing':
      case 'closed':
        return { kind: 'reread' };
      case 'too_few_films':
        return { kind: 'too_few', eligible: answer.eligible };
    }
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * Whether a failed Start (the call threw) earns the "couldn't start" toast. The call can throw after the room
 * already started (a timeout on a call that went through, a retry answered by a room that is no
 * longer in the lobby), and the realtime event may have moved the phone on: a room that is past
 * the lobby has nothing to report (statuses are answers, not errors).
 */
export function showsStartError(roomState: RoomState | undefined): boolean {
  return roomState === undefined || roomState === 'lobby';
}

/**
 * The count a `state_changed` carries when the deck worker found too few films after a `dealing`
 * answer, or null for any other payload. The layout still routes on the room re-read; this only
 * fills the host's line (lobby.md#too-few-films).
 */
export function tooFewFromEvent(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { reason, eligible } = payload as { reason?: unknown; eligible?: unknown };
  return reason === 'too_few_films' && Number.isInteger(eligible) && (eligible as number) >= 0
    ? (eligible as number)
    : null;
}

/**
 * The timers of a deal. While `dealing` is true: at 8 seconds the host's phone asks again (the
 * SQL baseline deals), at 20 seconds `slow` turns true. Both start when `dealing` turns true on
 * this phone and stop when it turns false.
 */
export function useDealingTimers(
  dealing: boolean,
  isHost: boolean,
  again: () => void,
): { slow: boolean } {
  const [slow, setSlow] = useState(false);
  const retry = useEffectEvent(again);
  useEffect(() => {
    if (!dealing) {
      const reset = setTimeout(() => setSlow(false), 0);
      return () => clearTimeout(reset);
    }
    const timers = [setTimeout(() => setSlow(true), DEAL_SLOW_MS)];
    if (isHost) timers.push(setTimeout(() => retry(), DEAL_RETRY_MS));
    return () => timers.forEach(clearTimeout);
  }, [dealing, isHost]);
  return { slow: dealing && slow };
}
