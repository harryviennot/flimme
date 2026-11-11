import type { Card, RoomRound } from '@flimme/contract';

import type { PosterSource } from '@/components/shared/poster';
import { posterUrl } from '@/features/swipe/poster-url';

// What the Final Cut screen reads about the round, without JSX.

/** The room's open round: the latest one that has not closed. */
export function openRound(rounds: readonly RoomRound[] | undefined): RoomRound | null {
  if (!rounds) return null;
  const open = rounds.filter((round) => round.stage !== 'closed');
  return open.length === 0 ? null : open.reduce((a, b) => (b.seq > a.seq ? b : a));
}

/** One finalist as the screen shows it. A missing card still has an id, so the ballot works. */
export type FinalistView = {
  titleId: number;
  title: string | null;
  year: number | null;
  poster: PosterSource | null;
  placeholder: string | null;
  /** The card is here but has no poster (the film icon shows). */
  noPoster: boolean;
  /** The card has a title and an overview: the info button can open its synopsis. */
  hasSynopsis: boolean;
};

function posterSourceOf(
  card: Card | undefined,
  imageBase: string | undefined,
  screenWidth: number,
): PosterSource | null {
  const uri = card ? posterUrl(imageBase, card.poster_path, screenWidth) : null;
  return uri ? { uri } : null;
}

/** The finalists in seed order, with the cards that have arrived. */
export function finalistViews(
  seedOrder: readonly number[],
  cards: readonly Card[] | undefined,
  imageBase: string | undefined,
  screenWidth: number,
): FinalistView[] {
  return seedOrder.map((titleId) => {
    const card = cards?.find((c) => c.title_id === titleId);
    return {
      titleId,
      title: card?.title ?? null,
      year: card?.year ?? null,
      poster: posterSourceOf(card, imageBase, screenWidth),
      placeholder: card?.poster_placeholder ?? null,
      noPoster: !!card && !card.poster_path,
      hasSynopsis: !!card && !!card.title && !!card.overview,
    };
  });
}

/** The cards' query key part: the same finalists in any order are one read. */
export function cardsKey(titleIds: readonly number[]): string {
  return [...titleIds].sort((a, b) => a - b).join(',');
}
