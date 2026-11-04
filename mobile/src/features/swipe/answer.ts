import type { VoteAnswer } from '@flimme/contract';

import type { AnsweredCard, CardStack } from './card-stack';
import { MAX_DWELL_MS } from './feel';
import type { QueuedVote } from './vote-queue';

// The answer path (swipe.md#the-screen's files): one function takes the top card off the stack
// and puts its vote in the queue. M6.12 changes it for the rewatch question. It is synchronous
// and never touches the network: the swipe doesn't wait (rule 5).

/** The four answers a card can be given. */
export type AnswerKind = Extract<VoteAnswer, 'like' | 'nope' | 'super_like' | 'seen'>;

/** Presence carries the swipe count every this many answers (decision M4.21, Q21.2). */
export const PRESENCE_EVERY = 5;

export type AnswererDeps = {
  stack: CardStack;
  queue: {
    enqueue: (vote: QueuedVote) => void;
    pendingSuperLikes: (roomId: string) => number;
  };
  roomId: string;
  memberId: string;
  /** `room_seats.super_likes_left` for this seat when the screen opened. */
  initialSuperLikes: number;
  /** The seat's swipe count when the screen opened, plus votes still waiting. */
  initialCount: number;
  /** The room moved on (a match, the finale): no more input. */
  locked: () => boolean;
  now: () => number;
  /** Called with the new total at every 5th answer. */
  onCount: (count: number) => void;
};

export function createAnswerer(deps: AnswererDeps) {
  // A super like is spent on the phone at once. The seat's value only moves once the server
  // has the vote, so the phone keeps its own count: what it opened with, minus what it spent.
  let superLikes = Math.max(0, deps.initialSuperLikes - deps.queue.pendingSuperLikes(deps.roomId));
  let count = deps.initialCount;

  return {
    /** Takes the top card and queues the vote; null when nothing was answered. */
    answer(kind: AnswerKind): AnsweredCard | null {
      if (deps.locked()) return null;
      if (kind === 'super_like' && superLikes <= 0) return null;
      const done = deps.stack.getState().answer();
      if (!done) return null;
      deps.queue.enqueue({
        room_id: deps.roomId,
        member_id: deps.memberId,
        title_id: done.card.title_id,
        answer: kind,
        dwell_ms: Math.min(done.dwellMs, MAX_DWELL_MS),
        client_at: new Date(deps.now()).toISOString(),
        flipped: done.flipped,
      });
      if (kind === 'super_like') superLikes -= 1;
      count += 1;
      if (count % PRESENCE_EVERY === 0) deps.onCount(count);
      return done;
    },

    superLikesLeft: () => superLikes,

    /** The server had none to spend (`no_super_likes`), or Undo took one back. */
    giveBackSuperLike(): void {
      superLikes += 1;
    },

    count: () => count,
  };
}

export type Answerer = ReturnType<typeof createAnswerer>;
