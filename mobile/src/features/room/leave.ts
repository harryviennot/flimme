import type { LeaveRoomResult } from '@flimme/contract';

import { api } from '@/api';

import { keptRoomStore } from './kept-room';

/**
 * Leaves the room and forgets it on the phone. `ok` and `not_in_room` both mean the seat is
 * gone. A call that fails is rethrown and the room stays kept, so the caller can say so.
 */
export async function leaveRoom(roomId: string): Promise<LeaveRoomResult> {
  const result = await api.leaveRoom({ room_id: roomId });
  keptRoomStore.getState().forget(roomId);
  return result;
}
