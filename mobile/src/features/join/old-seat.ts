import { keptRoomStore } from '@/features/room/kept-room';
import { leaveRoom } from '@/features/room/leave';

/** The id of the room the phone keeps now, or `undefined`. */
export function keptRoomId(): string | undefined {
  return keptRoomStore.getState().room?.id;
}

/**
 * Called when a join or a new room answered `ok` for `newRoomId`: leaves the room the phone
 * kept, once, without waiting and without a retry (join-sheet.md#leaving-the-old-seat).
 *
 * `oldRoomId` is the kept room read by the caller before it called the API: the new room's layout
 * writes itself as the kept room as soon as it mounts, so reading the store after the answer can
 * see the new room and leave nothing. The same room (a rejoin) leaves nothing, and a failed call
 * is swallowed: the old seat goes silent and stops counting after 90 seconds.
 */
export function leaveOldSeat(
  newRoomId: string,
  oldRoomId: string | undefined = keptRoomId(),
): void {
  if (!oldRoomId || oldRoomId === newRoomId) return;
  leaveRoom(oldRoomId).catch(() => {});
}
