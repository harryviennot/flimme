import type { RoomRow, RoomSeat } from '@flimme/contract';

import type { WinnerView } from '@/features/winner/use-winner';

import { recapNumbers } from './numbers';

// What the recap sheet shows (recap.md#states), derived from the reads the winner screen already
// holds: the room, its seats and the pick's card.

export const DEFAULT_SITE = 'flimme.com';

export type RecapView =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'error'; retry: () => void }
  /** Not a pick of a group room (a stray link): the route closes. */
  | { status: 'closed' }
  | {
      status: 'ready';
      title: string;
      posterUri: string | null;
      thumbhash: string | undefined;
      seconds: number | null;
      people: number;
      swipes: number;
      site: string;
    };

export type RecapInputs = {
  room: {
    data: Pick<RoomRow, 'state' | 'mode' | 'started_at' | 'decided_at'> | null | undefined;
    isError: boolean;
  };
  seats: { data: readonly Pick<RoomSeat, 'swipe_count'>[] | undefined; isError: boolean };
  winner: WinnerView;
  online: boolean;
  imageBase: string | undefined;
  inviteBase: string | undefined;
  retry: () => void;
};

/** The host of the invite link (`flimme.com`): the card names the site, not a link. */
export function siteOf(inviteBase: string | undefined): string {
  if (!inviteBase) return DEFAULT_SITE;
  try {
    return new URL(inviteBase).host || DEFAULT_SITE;
  } catch {
    return DEFAULT_SITE;
  }
}

/** The recap card's poster, w342 (tmdb.md#images). */
export function recapPosterUrl(imageBase: string | undefined, posterPath: string | null) {
  if (!imageBase || !posterPath) return null;
  return `${imageBase.replace(/\/+$/, '')}/w342/${posterPath.replace(/^\/+/, '')}`;
}

export function deriveRecapView(input: RecapInputs): RecapView {
  const { room, seats, winner } = input;
  if (room.data === null) return { status: 'closed' };
  if (room.data && (room.data.state !== 'done' || room.data.mode === 'solo')) {
    return { status: 'closed' };
  }
  if (winner.status === 'no_pick') return { status: 'closed' };
  if (room.data && seats.data && winner.status === 'ready') {
    const numbers = recapNumbers(room.data, seats.data);
    return {
      status: 'ready',
      title: winner.card.title,
      posterUri: recapPosterUrl(input.imageBase, winner.card.poster_path),
      thumbhash: winner.card.poster_placeholder ?? undefined,
      ...numbers,
      site: siteOf(input.inviteBase),
    };
  }
  if (!input.online) return { status: 'offline' };
  if ((room.isError && !room.data) || (seats.isError && !seats.data) || winner.status === 'error') {
    return { status: 'error', retry: input.retry };
  }
  return { status: 'loading' };
}
