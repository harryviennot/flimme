import type { NextCard, VoteAnswer } from '@flimme/contract';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { CardStack } from './card-stack';
import type { QueuedUndo, QueuedVote } from './vote-queue';

// Undo (swipe.md#undo, moments.md#the-swipe): the last card comes back on top, front side up,
// and its answer is taken back. Once in a row: the button wakes after an answer and sleeps
// after an undo. The phone never waits: a vote still in the queue is simply removed; one that
// already left gets an undo in the same queue, behind it and ahead of whatever is answered
// next, so the server never undoes the wrong card. The queue sends it and handles the
// server's answers (`locked`, `closed`, `nothing_to_undo`, a failed call).

export type UndoDeps = {
  stack: CardStack;
  queue: {
    /** Takes the room's last vote out if it is the one for `titleId` and still waiting. */
    removeLast: (roomId: string, titleId?: number) => QueuedVote | null;
    enqueueUndo: (item: Omit<QueuedUndo, 'undo'>) => void;
  };
  roomId: string;
  memberId: string;
  /** The room moved on (a match, the finale): no more input. */
  locked: () => boolean;
};

export type LastAnswer = {
  card: NextCard;
  kind: VoteAnswer;
  /** The server never recorded this vote (`no_super_likes`, a card not dealt): nothing to take back. */
  dropped?: boolean;
};

export type UndoState = {
  /** The last answer given on this phone, until it is undone; null before the first answer. */
  last: LastAnswer | null;
};

export function createUndoer(deps: UndoDeps) {
  const state: StoreApi<UndoState> = createStore<UndoState>(() => ({ last: null }));

  return {
    state,

    /** Called after every answer: the button wakes. */
    record(card: NextCard, kind: VoteAnswer): void {
      state.setState({ last: { card, kind } });
    },

    /** The queue says the server never recorded this film's vote: Undo must not ask it to. */
    markNotRecorded(titleId: number): void {
      const { last } = state.getState();
      if (last?.card.title_id === titleId) state.setState({ last: { ...last, dropped: true } });
    },

    /** Brings the last card back; null when there is nothing to undo or the room moved on. */
    undo(): LastAnswer | null {
      const { last } = state.getState();
      if (!last || deps.locked()) return null;
      state.setState({ last: null });
      const titleId = last.card.title_id;
      if (!last.dropped && !deps.queue.removeLast(deps.roomId, titleId)) {
        deps.queue.enqueueUndo({
          room_id: deps.roomId,
          member_id: deps.memberId,
          title_id: titleId,
        });
      }
      deps.stack.getState().putBack(last.card);
      return last;
    },
  };
}

export type Undoer = ReturnType<typeof createUndoer>;
