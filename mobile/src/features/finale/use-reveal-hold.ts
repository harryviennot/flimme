import type { RoomState } from '@flimme/contract';

/**
 * Whether the room layout keeps the Final Cut screen where it is after the round closes, so the
 * reveal can play before the winner screen (M6.31). Until then it never waits: the close goes
 * straight to the winner screen (Q15.4). M6.31 fills this in.
 */
export function useRevealHold(roomId: string | undefined, state: RoomState | undefined): boolean {
  void roomId;
  void state;
  return false;
}
