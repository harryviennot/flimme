import { useEffect } from 'react';

import { useKeptRoom } from '@/features/room/kept-room';
import { useRoom, useRoomSeats } from '@/features/room/queries';

/** What the join sheet tells a player who is seated in another room (join-sheet.md#the-leave-line-m410). */
export type LeaveLine = { kind: 'host'; name: string } | { kind: 'other' } | null;

/**
 * The leave line for a link to `linkRef`: names the kept room's current host, or just "your
 * other room" while the name is unknown, or when the host is the player. Nothing when there is no
 * kept room or it is this link's room. A kept room that has ended, returns nothing or has lost
 * the player's seat is forgotten here (Q22.5).
 */
export function useLeaveLine(linkRef: string | undefined): LeaveLine {
  const { room: kept, forget } = useKeptRoom();
  const keptId = kept && kept.id !== linkRef ? kept.id : undefined;
  const room = useRoom(keptId);
  const seats = useRoomSeats(keptId);

  const roomOver =
    room.isSuccess &&
    (room.data === null || room.data.state === 'done' || room.data.state === 'abandoned');
  const mine = seats.data?.find((seat) => seat.is_me === true);
  const seatGone = seats.isSuccess && (!mine || mine.left_at !== null);
  const over = !!keptId && (roomOver || seatGone);

  useEffect(() => {
    if (over && keptId) forget(keptId);
  }, [over, keptId, forget]);

  if (!keptId || over) return null;
  const host = seats.data?.find((seat) => seat.role === 'host' && seat.left_at === null);
  if (host && host.is_me !== true && host.display_name.trim() !== '') {
    return { kind: 'host', name: host.display_name };
  }
  return { kind: 'other' };
}
