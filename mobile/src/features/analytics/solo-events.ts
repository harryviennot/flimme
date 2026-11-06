import { track, trackWhenRoomKnown, type EventProps } from '@/lib/analytics';
import { countBucket, type CountBucket } from '@/lib/analytics-core';

// The solo and My films events (analytics.md#events). Counts leave as buckets or as the session's
// card count; never a film, a room or a name. A solo room capped under 13 sends nothing: the wrapper
// applies the room's cap, as for every event inside a room.

/** `api.start_solo` answered `ok` or `dealing`. About a room not entered yet, so it waits for its cap. */
export function trackSoloStart(input: { serviceCount: number; runtimeMax: number | null }) {
  trackWhenRoomKnown('solo:session_start', {
    service_count: input.serviceCount,
    has_time_budget: input.runtimeMax !== null,
  });
}

const checkpointsShown = new Set<string>();

/**
 * A checkpoint card is on top: `cardCount` is 20, 40... The swipe screen can mount again while the
 * checkpoint is open, so a room counts each checkpoint once (the id only de-duplicates here).
 */
export function trackCheckpointView(roomId: string, cardCount: number, likeCount: number) {
  const key = `${roomId}:${cardCount}`;
  if (checkpointsShown.has(key)) return;
  checkpointsShown.add(key);
  track('solo:checkpoint_view', { card_count: cardCount, like_count: countBucket(likeCount) });
}

/** `api.solo_pick` answered `ok`. */
export function trackSoloPick(answeredCards: number) {
  track('solo:pick_submit', { card_count: answeredCards });
}

/** The cap card shows: at the end of the stack (`deck`) or in Play alone setup (`play`). */
export function trackCapShow(placement: EventProps<'solo:cap_show'>['placement']) {
  track('solo:cap_show', { placement });
}

const deckCapRooms = new Set<string>();

/**
 * The cap card at the end of the stack. The card can mount again while the room stays on it, so a
 * room counts once (the id only de-duplicates here and never leaves the phone).
 */
export function trackDeckCap(roomId: string) {
  if (deckCapRooms.has(roomId)) return;
  deckCapRooms.add(roomId);
  trackCapShow('deck');
}

/** The first page of a segment or chip shows. More pages mean at least a full page (60). */
export function trackMyFilmsGrid(input: {
  segment: EventProps<'my_films:grid_view'>['segment'];
  filter: 'all' | 'friends' | 'solo';
  count: number;
  hasMore: boolean;
}) {
  const filmCount: CountBucket = input.hasMore ? '20_plus' : countBucket(input.count);
  track('my_films:grid_view', {
    segment: input.segment,
    filter: input.segment === 'liked' ? input.filter : 'none',
    film_count: filmCount,
  });
}
