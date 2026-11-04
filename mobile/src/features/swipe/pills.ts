// The swipe screen's player row without JSX (swipe.md#the-top-bar): one pill per seat, in join
// order, with how far each is. Never anything about answers.
import type { RoomSeat } from '@flimme/contract';

import { seatedSeats } from '@/features/lobby/seats';

export type Pill = {
  memberId: string;
  name: string;
  avatarKey: string;
  /** How many cards the seat answered: exact for this phone, steps of 5 for the others. */
  count: number;
  /** The seat has no cards left to show. */
  done: boolean;
  online: boolean;
  away: boolean;
  isHost: boolean;
  isMe: boolean;
};

export function pillsFor(input: {
  seats: readonly RoomSeat[] | undefined;
  online: ReadonlySet<string>;
  away: ReadonlySet<string>;
  progress: ReadonlyMap<string, { swipe_count: number; done: boolean }>;
  myId: string | undefined;
  myCount: number;
  myDone: boolean;
}): Pill[] {
  return seatedSeats(input.seats).map((seat) => {
    const isMe = seat.member_id === input.myId;
    const tracked = input.progress.get(seat.member_id);
    return {
      memberId: seat.member_id,
      name: seat.display_name,
      avatarKey: seat.avatar_key,
      // Before the first presence the count of `room_seats` stands in.
      count: isMe ? input.myCount : (tracked?.swipe_count ?? seat.swipe_count),
      done: isMe ? input.myDone : (tracked?.done ?? false),
      online: isMe || input.online.has(seat.member_id),
      away: !isMe && input.away.has(seat.member_id),
      isHost: seat.role === 'host',
      isMe,
    };
  });
}

/** The other players who are done, for the polite announcement. */
export function doneNames(pills: readonly Pill[]): string[] {
  return pills.filter((pill) => pill.done && !pill.isMe).map((pill) => pill.name);
}
