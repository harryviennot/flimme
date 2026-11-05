import { JOIN_ROOM_ANSWERS } from '@flimme/contract';

import { serverNow } from '@/lib/server-time';

// Where a player came from, kept in memory for `game:first_card_view`: the moment an invite link
// reached the phone, for the room it led to. Never stored, and only a duration is ever sent.

let link: { roomId: string; openedAt: number } | null = null;

/** The player joined this room by an invite link that reached the phone at `receivedAt`. */
export function rememberLinkJoin(roomId: string, receivedAt: number): void {
  link = { roomId, openedAt: receivedAt };
}

/** Milliseconds from the link reaching the phone to now, if this room was joined by link. */
export function msSinceLinkOpen(roomId: string, now: number = Date.now()): number | undefined {
  if (link?.roomId !== roomId) return undefined;
  return Math.max(0, now - link.openedAt);
}

/** Milliseconds from the room's `started_at` (server clock) to now; undefined when unknown. */
export function msSinceSwiping(
  startedAt: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!startedAt) return undefined;
  const at = Date.parse(startedAt);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.round(serverNow(now) - at));
}

/** `2`, `3_4` or `5_10` from the seats present. */
export function roomSizeBucket(players: number): '2' | '3_4' | '5_10' {
  if (players <= 2) return '2';
  return players <= 4 ? '3_4' : '5_10';
}

export type JoinStatus = (typeof JOIN_ROOM_ANSWERS)[number] | 'unknown';

/** The join answer as the event's list knows it; an answer from a newer server is `unknown`. */
export function joinStatus(status: string): JoinStatus {
  return (JOIN_ROOM_ANSWERS as readonly string[]).includes(status)
    ? (status as JoinStatus)
    : 'unknown';
}
