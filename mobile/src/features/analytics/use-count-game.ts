import { useEffect } from 'react';

import { gamesStore } from './games';

/**
 * Counts a game for `games_played` when the room this phone sits in is seen `swiping`, once per
 * room (a restart or a second look at the same room adds nothing). Mounted by the room layout.
 */
export function useCountGame(roomId: string | undefined, state: string | undefined): void {
  useEffect(() => {
    if (roomId && state === 'swiping') gamesStore.getState().countGame(roomId);
  }, [roomId, state]);
}
