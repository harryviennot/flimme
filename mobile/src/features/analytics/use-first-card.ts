import { useEffect } from 'react';

import { useRoom, useRoomSeats } from '@/features/room';
import { track } from '@/lib/analytics';

import { gamesStore } from './games';
import { msSinceLinkOpen, msSinceSwiping, roomSizeBucket } from './journey';

/**
 * `game:first_card_view`, once per seat per game: when the first card is drawn. Counts how long
 * the game had been swiping, how long since the invite link opened the app (a link join only),
 * the mode and the room's size (a bucket, never the players). A room the phone is not yet sure of
 * sends nothing; the wrapper drops it in a room capped under 13.
 */
export function useFirstCardView(roomId: string, cardDrawn: boolean): void {
  const room = useRoom(roomId).data;
  const seats = useRoomSeats(roomId).data;
  const mode = room?.mode;
  const startedAt = room?.started_at;
  const present = seats ? seats.filter((seat) => seat.left_at === null).length : 0;

  useEffect(() => {
    if (!cardDrawn || mode !== 'quick_match' || present === 0) return;
    if (!gamesStore.getState().markFirstCard(roomId)) return;
    const sinceSwiping = msSinceSwiping(startedAt);
    // A game with no start time can't say how long it had been swiping: nothing is sent.
    if (sinceSwiping === undefined) return;
    const sinceLink = msSinceLinkOpen(roomId);
    track('game:first_card_view', {
      ms_since_swiping: sinceSwiping,
      ...(sinceLink === undefined ? {} : { ms_since_link_open: sinceLink }),
      mode,
      room_size: roomSizeBucket(present),
    });
  }, [cardDrawn, mode, present, startedAt, roomId]);
}
