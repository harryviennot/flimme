// What Leave does (lobby.md#leaving), without JSX. The call is M4.10's `leaveRoom`, which also
// forgets the kept room, so the splash doesn't bring the player back to a seat they left.
import { leaveRoom } from '@/features/room/leave';

export type LeaveOutcome =
  /** Offline: nothing was called, the player stays. */
  | 'offline'
  /** `ok` or `not_in_room`: the seat is gone, drop the room stack and show Home. */
  | 'left'
  /** The call failed while online: the player stays, the kept room too. */
  | 'failed';

export async function runLeave(
  roomId: string,
  online: boolean,
  leave: typeof leaveRoom = leaveRoom,
): Promise<LeaveOutcome> {
  if (!online) return 'offline';
  try {
    await leave(roomId);
    return 'left';
  } catch {
    return 'failed';
  }
}
