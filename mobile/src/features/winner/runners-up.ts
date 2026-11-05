import type { Card, RunnersUpResult } from '@flimme/contract';

import type { AvatarColor } from '@/components/ui/avatar';
import { formatList } from '@/features/lobby/names';
import { toAvatarColor } from '@/features/profile';

// What the winner screen shows under the pick (winner.md#the-runners-up): the read's films, in the
// read's order, each with what the read says about who liked it and nothing else. Party carries the
// likers and no count; Blind carries the count and no one. Never a total, a nope or a rank
// (decisions.md, Q48.1).

/** Avatars shown on a runner-up; the names below list everyone. */
export const MAX_FACES = 3;

export type Liker = { memberId: string; name: string; color: AvatarColor };

export type RunnerUpItem = {
  card: Card;
  /** Party: who liked it, in the read's order. Null in Blind and when nobody did. */
  likers: Liker[] | null;
  /** Blind: how many liked it. Null in Party and when nobody did. */
  likes: number | null;
};

export type RunnersUpData = {
  source: 'finalists' | 'most_liked';
  items: RunnerUpItem[];
};

/** The section's films, or null when it shows nothing. */
export function buildRunnersUp(
  answer: RunnersUpResult | undefined,
  cards: readonly Card[] | undefined,
): RunnersUpData | null {
  if (!answer || answer.status !== 'ok' || answer.source === null || !cards) return null;
  const party = answer.reveal === 'party';
  const items: RunnerUpItem[] = [];
  for (const entry of answer.runners_up) {
    const card = cards.find((c) => c.title_id === entry.title_id);
    if (!card) continue;
    const likers =
      party && entry.likers && entry.likers.length > 0
        ? entry.likers.map((l) => ({
            memberId: l.member_id,
            name: l.display_name,
            color: toAvatarColor(l.avatar_key),
          }))
        : null;
    const likes = !party && entry.likes > 0 ? entry.likes : null;
    items.push({ card, likers, likes });
  }
  return items.length > 0 ? { source: answer.source, items } : null;
}

export type RunnerUpDetail = { kind: 'likedBy'; names: string } | { kind: 'likes'; count: number };

/** What a runner-up says about its likes (its names, or its count), or null for none. */
export function runnerUpDetail(
  item: Pick<RunnerUpItem, 'likers' | 'likes'>,
  language: string,
): RunnerUpDetail | null {
  if (item.likers) {
    return {
      kind: 'likedBy',
      names: formatList(
        item.likers.map((l) => l.name),
        language,
      ),
    };
  }
  if (item.likes !== null) return { kind: 'likes', count: item.likes };
  return null;
}
