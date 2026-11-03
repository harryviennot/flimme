import { keptRoomStore } from '@/features/room/kept-room';
import { leaveRoom } from '@/features/room/leave';

/**
 * Called when a join or a new room answered `ok` for `newRoomId`: leaves the room the phone
 * kept, once, without waiting and without a retry (join-sheet.md#leaving-the-old-seat). The old
 * id is read now, before the screen moves. The same room (a rejoin) leaves nothing, and a failed
 * call is swallowed: the old seat goes silent and stops counting after 90 seconds.
 */
export function leaveOldSeat(newRoomId: string): void {
  const kept = keptRoomStore.getState().room;
  if (!kept || kept.id === newRoomId) return;
  leaveRoom(kept.id).catch(() => {});
}
