import type { VoteAnswer } from '@flimme/contract';

import type { AnsweredCard, CardStack } from './card-stack';
import { MAX_DWELL_MS } from './feel';
import type { QueuedVote } from './vote-queue';

// The answer path (swipe.md#the-screen's files): one function takes the top card off the stack
// and puts its vote in the queue. Seen it is a plain `seen` at once (a nope); in a room that
// allows rewatches the rewatch chip (M6.49) can turn it into `seen_rewatch` afterwards, through
// `change`. It is synchronous and never touches the network: the swipe doesn't wait (rule 5).

/** The four answers a card can be given. */
export type AnswerKind = Extract<
  VoteAnswer,
  'like' | 'nope' | 'super_like' | 'seen' | 'seen_rewatch'
>;

/** The room's seen rule (`api.rooms.seen_rule`). */
export type SeenRule = 'hide_seen' | 'allow_rewatch' | 'show_all';

/**
 * Whether the room lets a seen film come back (swipe.md#seen-it-the-rewatch-question). Under
 * `hide_seen` the film leaves the room, so there is nothing to offer.
 */
export function asksRewatch(rule: SeenRule | undefined): boolean {
  return rule === 'allow_rewatch' || rule === 'show_all';
}

/** Whether this answer brings up the rewatch chip: a Seen it in a room that allows rewatches. */
export function offersRewatch(kind: AnswerKind, rule: SeenRule | undefined): boolean {
  return kind === 'seen' && asksRewatch(rule);
}

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
  /** A solo room: its votes are marked so they are sent although the room is not kept. */
  solo?: () => boolean;
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
  // The last count sent to the others (presence), to correct it when an undo lowers it.
  let sent: number | null = null;
  // The last vote queued, so the rewatch chip can send the same card again with another answer.
  let lastVote: QueuedVote | null = null;

  return {
    /** Takes the top card and queues the vote; null when nothing was answered. */
    answer(kind: AnswerKind): AnsweredCard | null {
      if (deps.locked()) return null;
      if (kind === 'super_like' && superLikes <= 0) return null;
      const done = deps.stack.getState().answer();
      if (!done) return null;
      const vote: QueuedVote = {
        room_id: deps.roomId,
        member_id: deps.memberId,
        title_id: done.card.title_id,
        answer: kind,
        dwell_ms: Math.min(done.dwellMs, MAX_DWELL_MS),
        client_at: new Date(deps.now()).toISOString(),
        flipped: done.flipped,
        ...(deps.solo?.() && { solo: true }),
      };
      lastVote = vote;
      deps.queue.enqueue(vote);
      if (kind === 'super_like') superLikes -= 1;
      count += 1;
      if (count % PRESENCE_EVERY === 0) {
        sent = count;
        deps.onCount(count);
      }
      return done;
    },

    /**
     * Queues the last answer again with another kind (the rewatch chip's Yes). The caller has
     * taken the first vote back (`undoer.change`) so the queue holds the undo, then this vote.
     * Nothing is counted: it is still one answer. False when `titleId` is not the last answer.
     */
    change(titleId: number, kind: AnswerKind): boolean {
      if (deps.locked() || !lastVote || lastVote.title_id !== titleId) return false;
      lastVote = { ...lastVote, answer: kind, client_at: new Date(deps.now()).toISOString() };
      deps.queue.enqueue(lastVote);
      return true;
    },

    superLikesLeft: () => superLikes,

    /** The server had none to spend (`no_super_likes`), or Undo took one back. */
    giveBackSuperLike(): void {
      superLikes += 1;
    },

    /** Undo took the last answer back: one fewer, and the others hear it if they were told more. */
    undone(): void {
      count = Math.max(0, count - 1);
      if (sent !== null && count < sent) {
        sent = count;
        deps.onCount(count);
      }
    },

    /** The undone card matched after all, so its answer stands again. */
    redone(spentSuperLike: boolean): void {
      count += 1;
      if (spentSuperLike) superLikes = Math.max(0, superLikes - 1);
    },

    count: () => count,
  };
}

export type Answerer = ReturnType<typeof createAnswerer>;
