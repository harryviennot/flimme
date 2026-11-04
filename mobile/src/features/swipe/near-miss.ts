import { useEffect, useState, useSyncExternalStore } from 'react';

import { useRoom, useRoomEvent } from '@/features/room';
import { duration } from '@/theme/motion';

import { voteQueue } from './index';

// The near miss (swipe.md#the-near-miss): "2 of 3 of you liked this" on a film one like short
// of a match that this player has not answered, while its card is on top. The server sends
// `near_miss` after a like (and again with the corrected count after an undone like); the phone
// keeps the latest count per film in memory for the game and shows it, nothing else. A missed
// event shows nothing and nothing is invented or queued.

export type NearMiss = { likes: number; of: number };
type Count = { likes: number; of: number; needed: number };

const listeners = new Set<() => void>();
// room id, then film id.
let counts: Record<string, Record<number, Count>> = {};

const emit = () => listeners.forEach((listener) => listener());

/** Reads a `near_miss` payload; null when it is not shaped like one. */
export function parseNearMiss(payload: unknown): ({ title_id: number } & Count) | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const { title_id, likes, of, needed } = p;
  if (
    !Number.isInteger(title_id) ||
    !Number.isInteger(likes) ||
    !Number.isInteger(of) ||
    !Number.isInteger(needed)
  ) {
    return null;
  }
  return { title_id, likes, of, needed } as { title_id: number } & Count;
}

/** Keeps the latest count for a film of this room. */
export function recordNearMiss(roomId: string, payload: unknown): void {
  const parsed = parseNearMiss(payload);
  if (!parsed) return;
  const { title_id, ...count } = parsed;
  counts = { ...counts, [roomId]: { ...counts[roomId], [title_id]: count } };
  emit();
}

/** Forgets what was kept for a room, or for every room. */
export function clearNearMisses(roomId?: string): void {
  if (roomId === undefined) counts = {};
  else counts = Object.fromEntries(Object.entries(counts).filter(([id]) => id !== roomId));
  emit();
}

/**
 * What to show for a film: its latest count while it is exactly one like short of the rule (at
 * least 2 likes), in a Party room, and only if this player has not answered it. A count that an
 * undo dropped below the line, or one that reached the rule, shows nothing.
 */
export function nearMissFor(
  count: Count | undefined,
  options: { party: boolean; answered: boolean },
): NearMiss | null {
  if (!count || !options.party || options.answered) return null;
  if (count.likes < 2 || count.likes !== count.needed - 1) return null;
  return { likes: count.likes, of: count.of };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * The near miss for the card on top, once that card has settled. Listens for `near_miss` on
 * the room; `answered` says whether this phone already answered a film (the queue, this session).
 */
export function useNearMiss(
  roomId: string,
  titleId: number | undefined,
  answered: (titleId: number) => boolean = (id) => voteQueue.has(roomId, id),
): NearMiss | null {
  useRoomEvent(roomId, 'near_miss', (payload) => recordNearMiss(roomId, payload));
  const kept = useSyncExternalStore(
    subscribe,
    () => counts,
    () => counts,
  );
  const party = useRoom(roomId).data?.reveal === 'party';

  // The toast and the glow come together, after the card has settled on top (its fade-in and
  // the spring from behind), so a card that arrives already close to a match does not flash.
  const [settled, setSettled] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (titleId === undefined) return;
    const timer = setTimeout(() => setSettled(titleId), duration.base);
    return () => clearTimeout(timer);
  }, [titleId]);

  if (titleId === undefined || settled !== titleId) return null;
  return nearMissFor(kept[roomId]?.[titleId], { party, answered: answered(titleId) });
}
