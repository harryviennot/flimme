import { useState } from 'react';

import { useRoom, useRoomEvent, useRoomSeats } from '@/features/room';

import {
  isHostSeat,
  nextRoomOf,
  offerHostOf,
  winnerFooterOf,
  type NextRoom,
  type OfferHost,
  type WinnerFooter,
} from './offer';
import { useJoinOffer } from './use-join-offer';
import { usePlayAgain } from './use-play-again';

export type PlayAgainFooterState = {
  kind: WinnerFooter;
  next: NextRoom | null;
  host: OfferHost;
  /** The offer arrived while the screen was showing (not on a cold start or a return). */
  arrived: boolean;
  playAgain: ReturnType<typeof usePlayAgain>;
  joinOffer: ReturnType<typeof useJoinOffer>;
};

/** What sits above Home on the winner route: Play again for the host, the Join offer for all. */
export function usePlayAgainFooter(roomId: string, solo: boolean): PlayAgainFooterState {
  const room = useRoom(roomId).data;
  const seats = useRoomSeats(roomId).data;
  const [hostMemberId, setHostMemberId] = useState<string | null>(null);
  // The event only tells; the room row (re-read by the layout) carries the code.
  useRoomEvent(roomId, 'next_room', (payload) => {
    const id = (payload as { host_member_id?: unknown } | null)?.host_member_id;
    if (typeof id === 'string') setHostMemberId(id);
  });
  const next = nextRoomOf(room);
  const [startedWithOffer] = useState(next !== null);
  const playAgain = usePlayAgain(roomId);
  const joinOffer = useJoinOffer(next);
  const kind = winnerFooterOf({
    solo,
    next,
    host: isHostSeat(seats),
    hidden: playAgain.hidden,
  });
  return {
    kind,
    next,
    host: offerHostOf(seats, hostMemberId),
    arrived: !startedWithOffer,
    playAgain,
    joinOffer,
  };
}
