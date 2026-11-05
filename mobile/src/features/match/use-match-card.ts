import type { Card } from '@flimme/contract';
import { useQuery } from '@tanstack/react-query';
import { useWindowDimensions } from 'react-native';

import { api } from '@/api';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { posterUrl } from '@/features/swipe/poster-url';

// The matched film's card. The swipe screen's card stack keeps every card of the game, so the
// overlay asks it first (`setHeldCardSource`); otherwise one `api.title_cards` read fetches it
// (pool films only). The overlay never waits for either: its poster placeholder shows meanwhile.

type CardSource = (titleId: number) => Card | undefined;
let source: CardSource | null = null;

/** The swipe screen registers where the phone's cards are, and passes null when it leaves. */
export function setHeldCardSource(next: CardSource | null) {
  source = next;
}

/** A card the swipe screen still holds, if it is mounted (the Final Cut asks before reading). */
export function heldCardOf(titleId: number): Card | undefined {
  return source?.(titleId);
}

export function useMatchCard(
  roomId: string,
  titleId: number | undefined,
  language: string,
): {
  card: Card | null;
  posterUri: string | null;
  /** The read failed (a refusal, no card, or the network) and no card is held. */
  failed: boolean;
  retry: () => void;
} {
  const { width } = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const held = titleId === undefined ? undefined : source?.(titleId);
  const read = useQuery({
    queryKey: ['room', roomId, 'title-card', titleId, language],
    enabled: titleId !== undefined && !held,
    queryFn: async () => {
      const answer = await api.titleCards({
        room_id: roomId,
        title_ids: [titleId ?? 0],
        language,
      });
      const found = answer.status === 'ok' ? answer.cards[0] : undefined;
      // A refusal or an `ok` with no card is a failed read, so the winner screen can retry it.
      if (!found) throw new Error(`title_cards: ${answer.status}`);
      return found;
    },
    staleTime: Infinity,
    retry: 1,
  });
  const card = held ?? read.data ?? null;
  return {
    card,
    posterUri: card ? posterUrl(imageBase, card.poster_path, width) : null,
    failed: !card && read.isError,
    retry: () => void read.refetch(),
  };
}
