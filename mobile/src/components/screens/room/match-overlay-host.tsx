import type { RoomSeat } from '@flimme/contract';
import { useTranslation } from 'react-i18next';

import { seatedSeats } from '@/features/lobby/seats';
import type { PlayingMatch } from '@/features/match/controller';
import { matchMeta } from '@/features/match/format';
import { useMatchCard } from '@/features/match/use-match-card';
import { toAvatarColor } from '@/features/profile';

import { MatchOverlay } from './match-overlay';

/**
 * Mounted once in the room layout, above whichever room screen shows, with what
 * `useMatchOverlay` says. Resolves the film's card and the seated players for the overlay.
 */
export function MatchOverlayHost({
  roomId,
  match,
  seats,
  onContinue,
}: {
  roomId: string;
  match: PlayingMatch | null;
  seats: readonly RoomSeat[] | undefined;
  onContinue: () => void;
}) {
  const { i18n } = useTranslation();
  const { card, posterUri } = useMatchCard(roomId, match?.title_id, i18n.language);
  if (!match) return null;

  return (
    <MatchOverlay
      film={card ? { title: card.title, meta: matchMeta(card, i18n.language) } : null}
      poster={posterUri ? { uri: posterUri } : null}
      thumbhash={card?.poster_placeholder ?? undefined}
      count={
        match.likes !== null && match.of !== null ? { likes: match.likes, of: match.of } : null
      }
      players={seatedSeats(seats).map((seat) => ({
        id: seat.member_id,
        name: seat.display_name,
        color: toAvatarColor(seat.avatar_key),
      }))}
      language={i18n.language}
      onContinue={onContinue}
    />
  );
}
