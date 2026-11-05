import type { NextCard } from '@flimme/contract';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { AnswerKind } from '@/features/swipe/answer';

// A solo session on this phone (swipe.md#solo): the answers it gave, in order, so the likes count,
// the checkpoint and the pick sheet all read the same list, and none of them waits on the network.
// It lives in memory, one per room, because a solo room is never reopened after the app restarts.

/** A checkpoint comes after this many answered cards, then every this many more (Q44.1). */
export const CHECKPOINT_EVERY = 20;
/** The checkpoint's fan shows at most this many posters. */
export const FAN_SIZE = 5;

export type SessionEntry = {
  card: NextCard;
  kind: AnswerKind;
  /** Order of the answer in the session; a larger number is newer. */
  seq: number;
};

export type SoloSessionState = {
  /** The answers the session holds, oldest first. Undo takes the last one out. */
  entries: readonly SessionEntry[];
  /** The multiple of 20 whose checkpoint is on top now, or null. */
  open: number | null;
  /** Every multiple whose checkpoint already showed this session: each shows once. */
  shown: readonly number[];
  seq: number;
  /** Records an answer; opens the checkpoint when it is the 20th, 40th... not shown before. */
  answer: (card: NextCard, kind: AnswerKind) => void;
  /** Undo took this film's answer back. The checkpoint, if on top, leaves with it. */
  undo: (titleId: number) => void;
  /** Keep going, or a swipe on the checkpoint: it goes back to the deck. */
  dismiss: () => void;
};

export type SoloSession = StoreApi<SoloSessionState>;

const isLike = (kind: AnswerKind) =>
  kind === 'like' || kind === 'super_like' || kind === 'seen_rewatch';

/** This session's likes: super likes first, then newest first (swipe.md#the-pick-sheet). */
export function likesOf(entries: readonly SessionEntry[]): SessionEntry[] {
  return entries
    .filter((entry) => isLike(entry.kind))
    .sort((a, b) => {
      const superA = a.kind === 'super_like' ? 1 : 0;
      const superB = b.kind === 'super_like' ? 1 : 0;
      return superB - superA || b.seq - a.seq;
    });
}

export function createSoloSession(): SoloSession {
  return createStore<SoloSessionState>()((set, get) => ({
    entries: [],
    open: null,
    shown: [],
    seq: 0,

    answer: (card, kind) => {
      const { entries, shown, seq } = get();
      const next = [
        ...entries.filter((e) => e.card.title_id !== card.title_id),
        { card, kind, seq },
      ];
      const count = next.length;
      const opens = count % CHECKPOINT_EVERY === 0 && !shown.includes(count);
      set({
        entries: next,
        seq: seq + 1,
        open: opens ? count : get().open,
        shown: opens ? [...shown, count] : shown,
      });
    },

    undo: (titleId) => {
      const { entries } = get();
      if (!entries.some((e) => e.card.title_id === titleId)) return;
      set({ entries: entries.filter((e) => e.card.title_id !== titleId), open: null });
    },

    dismiss: () => set({ open: null }),
  }));
}

const sessions = new Map<string, SoloSession>();

/** The room's session, made on first use and kept while the app runs. */
export function soloSessionOf(roomId: string): SoloSession {
  let session = sessions.get(roomId);
  if (!session) {
    session = createSoloSession();
    sessions.set(roomId, session);
  }
  return session;
}

export function forgetSoloSession(roomId: string): void {
  sessions.delete(roomId);
}

/** The room's likes in pick order, as the top bar, the checkpoint and the pick sheet read them. */
export function useSoloEntries(roomId: string): readonly SessionEntry[] {
  return useStore(soloSessionOf(roomId), (s) => s.entries);
}
