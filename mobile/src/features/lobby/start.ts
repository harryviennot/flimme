// What Start does (lobby.md#starting), without JSX: one call, every answer turned into an
// outcome the screen shows, and the two timers that follow a `dealing` room.
import type { StartGameResult } from '@flimme/contract';
import { useEffect, useEffectEvent, useState } from 'react';

/** Still `dealing` this long after the tap: the host's phone calls `start_game` again. */
export const DEAL_RETRY_MS = 8_000;
/** Still `dealing` this long after the tap: the overlay says it takes longer than usual. */
export const DEAL_SLOW_MS = 20_000;

export type StartOutcome =
  /** `ok`, `dealing` or `closed`: read the room again, the layout follows its state. */
  { kind: 'reread' } | { kind: 'need_players'; need: number } | { kind: 'failed' };

export async function runStart(startGame: () => Promise<StartGameResult>): Promise<StartOutcome> {
  try {
    const answer = await startGame();
    switch (answer.status) {
      case 'not_enough_players':
        return { kind: 'need_players', need: answer.need };
      case 'ok':
      case 'dealing':
      case 'closed':
      // The lobby's own message for too few films is M5.10; until then the room is re-read.
      case 'too_few_films':
        return { kind: 'reread' };
    }
  } catch {
    return { kind: 'failed' };
  }
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
