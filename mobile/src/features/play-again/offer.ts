import type { RoomRow, RoomSeat } from '@flimme/contract';

import type { AvatarColor } from '@/components/ui/avatar';
import { toAvatarColor } from '@/features/profile';

/** The next room, as the finished room's row tells it. */
export type NextRoom = { roomId: string; code: string };

export function nextRoomOf(
  room: Pick<RoomRow, 'next_room_id' | 'next_room_code'> | null | undefined,
): NextRoom | null {
  if (!room?.next_room_id || !room.next_room_code) return null;
  return { roomId: room.next_room_id, code: room.next_room_code };
}

/** Who started it: the host seat named by the event, or nobody when it is unknown. */
export type OfferHost =
  { kind: 'self' } | { kind: 'named'; name: string; color: AvatarColor } | { kind: 'unknown' };

export function offerHostOf(
  seats: readonly RoomSeat[] | undefined,
  hostMemberId: string | null,
): OfferHost {
  const seat = hostMemberId ? seats?.find((s) => s.member_id === hostMemberId) : undefined;
  if (!seat) return { kind: 'unknown' };
  if (seat.is_me === true) return { kind: 'self' };
  return { kind: 'named', name: seat.display_name, color: toAvatarColor(seat.avatar_key) };
}

/** The phone's own seat is the host seat and has not left (winner.md#play-again, who sees it). */
export function isHostSeat(seats: readonly RoomSeat[] | undefined): boolean {
  return !!seats?.some((s) => s.is_me === true && s.role === 'host' && s.left_at === null);
}

export type WinnerFooter = 'play-again' | 'offer' | null;

/** What sits above Home: the offer for everyone once a next room is open, else Play again for the host. */
export function winnerFooterOf(input: {
  solo: boolean;
  next: NextRoom | null;
  host: boolean;
  hidden: boolean;
}): WinnerFooter {
  if (input.solo) return null;
  if (input.next) return 'offer';
  return input.host && !input.hidden ? 'play-again' : null;
}
