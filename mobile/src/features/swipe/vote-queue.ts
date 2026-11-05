import type {
  CastVoteResult,
  MatchKind,
  RoomState,
  UndoLastVoteResult,
  VoteAnswer,
} from '@flimme/contract';
import { ApiError, VOTE_ANSWERS } from '@flimme/contract';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// The vote queue (app-structure.md#the-vote-queue). Every answer a player gives goes in here at
// release, is saved on the device, and is sent one at a time, in order, until the server has
// it. The swipe never waits for any of this: `enqueue` returns at once.

export type QueuedVote = {
  room_id: string;
  member_id: string;
  title_id: number;
  answer: VoteAnswer;
  /** How long the card was on screen. */
  dwell_ms: number;
  /** The phone's time at the swipe (ISO). */
  client_at: string;
  /** Whether the card was turned over before the answer; sent as `p_flipped`. */
  flipped: boolean;
};

/**
 * Taking back the last vote that already left the phone. It waits in line behind the votes
 * before it and ahead of the ones after it, so the server never undoes the wrong one.
 */
export type QueuedUndo = {
  undo: true;
  room_id: string;
  member_id: string;
  /** The film whose vote is taken back (for the queue's bookkeeping only). */
  title_id: number;
};

export type QueueItem = QueuedVote | QueuedUndo;

const isUndo = (item: QueueItem): item is QueuedUndo => 'undo' in item;

/** What the screens hear about. Nothing here says a swipe was lost. */
export type VoteQueueEvent =
  | { type: 'match'; room_id: string; title_id: number; kind?: MatchKind; decided?: boolean }
  /** An undo came back `locked`: the card matched, so it leaves again (and the shortlist has it). */
  | { type: 'undo_locked'; room_id: string; title_id: number }
  | { type: 'finale'; room_id: string; round_id: string }
  | { type: 'closed'; room_id: string; state: RoomState }
  | { type: 'no_super_likes'; room_id: string; title_id: number }
  /** The film was never this seat's to swipe: refetch the cards. */
  | { type: 'card_not_dealt'; room_id: string; title_id: number }
  /** The vote left the queue without the server recording it (dropped, or denied for good). */
  | { type: 'dropped'; room_id: string; title_id: number };

export type VoteQueueDeps = {
  /** Tests pass their own; the app uses the SQLite store. */
  kv?: KeyValueStore;
  castVote: (args: {
    room_id: string;
    title_id: number;
    answer: VoteAnswer;
    member_id: string;
    dwell_ms: number;
    client_at: string;
    flipped: boolean;
  }) => Promise<CastVoteResult>;
  undoLastVote: (args: { room_id: string; member_id: string }) => Promise<UndoLastVoteResult>;
  /** Gets a fresh session; throws if it can't. */
  refreshSession: () => Promise<unknown>;
  /** Re-reads the room after a `closed` answer. */
  invalidateRoom: (roomId: string) => void;
  /** Room and film ids only, never names (privacy rule 7). */
  report: (error: unknown, context: { room_id: string; title_id?: number }) => void;
  /** The room the phone keeps; votes for any other room are dropped unsent. */
  keptRoomId: () => string | null;
};

/** After 1, 2, 4, 8 and 16 seconds, then every 30. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export const VOTE_QUEUE_VERSION = 1;

type Saved = { votes: QueueItem[] };
type QueueState = Saved;

function readVote(raw: unknown): QueueItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (
    v.undo === true &&
    typeof v.room_id === 'string' &&
    typeof v.member_id === 'string' &&
    typeof v.title_id === 'number'
  ) {
    return { undo: true, room_id: v.room_id, member_id: v.member_id, title_id: v.title_id };
  }
  if (
    typeof v.room_id !== 'string' ||
    typeof v.member_id !== 'string' ||
    typeof v.title_id !== 'number' ||
    typeof v.answer !== 'string' ||
    !(VOTE_ANSWERS as readonly string[]).includes(v.answer) ||
    typeof v.client_at !== 'string'
  ) {
    return null;
  }
  return {
    room_id: v.room_id,
    member_id: v.member_id,
    title_id: v.title_id,
    answer: v.answer as VoteAnswer,
    dwell_ms: typeof v.dwell_ms === 'number' ? v.dwell_ms : 0,
    client_at: v.client_at,
    flipped: v.flipped === true,
  };
}

/** Anything that isn't a list of well-formed votes reads as the votes that are. */
export function readSavedVotes(saved: unknown): Saved {
  const list = (saved as { votes?: unknown } | null | undefined)?.votes;
  if (!Array.isArray(list)) return { votes: [] };
  return { votes: list.map(readVote).filter((v): v is QueueItem => v !== null) };
}

export function createVoteQueue(deps: VoteQueueDeps) {
  const store = create<QueueState>()(
    persist(
      () => ({ votes: [] as QueueItem[] }),
      persistOptions<QueueState, Saved>({
        name: 'vote-queue',
        version: VOTE_QUEUE_VERSION,
        migrate: readSavedVotes,
        sanitize: readSavedVotes,
        partialize: ({ votes }) => ({ votes }),
        kv: deps.kv,
      }),
    ),
  );

  const listeners = new Set<(event: VoteQueueEvent) => void>();
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  const votes = () => store.getState().votes;
  const same = (a: QueueItem, b: QueueItem) =>
    a.room_id === b.room_id && a.title_id === b.title_id && isUndo(a) === isUndo(b);
  /** The head, from its first send until it settles: it may have reached the server, so it can't be taken back from the queue. */
  let inFlight: QueueItem | undefined;

  function emit(event: VoteQueueEvent) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        deps.report(error, { room_id: event.room_id });
      }
    }
  }

  function remove(vote: QueueItem) {
    store.setState({ votes: votes().filter((v) => v !== vote) });
  }

  /** The server never recorded this vote, so an undo queued behind it would take back another. */
  function removeUndoFor(vote: QueuedVote) {
    store.setState({
      votes: votes().filter(
        (v) => !(isUndo(v) && v.room_id === vote.room_id && v.title_id === vote.title_id),
      ),
    });
  }

  function removeRoom(roomId: string) {
    store.setState({ votes: votes().filter((v) => v.room_id !== roomId) });
  }

  function dropUnkept() {
    const kept = deps.keptRoomId();
    if (votes().some((v) => v.room_id !== kept)) {
      store.setState({ votes: votes().filter((v) => v.room_id === kept) });
    }
  }

  /** An undo: the same session and retry rules as a vote, its own answers. */
  async function attemptUndo(item: QueuedUndo): Promise<'next' | 'retry'> {
    const context = { room_id: item.room_id, title_id: item.title_id };
    let refreshed = false;
    for (;;) {
      let result: UndoLastVoteResult;
      try {
        result = await deps.undoLastVote({ room_id: item.room_id, member_id: item.member_id });
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'denied') {
          if (refreshed) {
            deps.report(error, context);
            remove(item);
            return 'next';
          }
          refreshed = true;
          try {
            await deps.refreshSession();
          } catch {
            return 'retry';
          }
          continue;
        }
        return 'retry';
      }
      switch (result.status) {
        case 'ok':
          break;
        case 'nothing_to_undo':
          // The phone and the server disagree: the card stays, the server owns the truth.
          deps.report(new Error('undo_last_vote: nothing_to_undo'), context);
          break;
        case 'locked':
          // The card matched or became a finalist: the room's next screen takes over, or, while
          // swiping, the card leaves again and the shortlist shows the film.
          deps.invalidateRoom(item.room_id);
          emit({ type: 'undo_locked', room_id: item.room_id, title_id: item.title_id });
          break;
        case 'closed':
          removeRoom(item.room_id);
          deps.invalidateRoom(item.room_id);
          // The answer carries no state: the room is read again and the layout follows it.
          emit({ type: 'closed', room_id: item.room_id, state: 'done' });
          failures = 0;
          return 'next';
      }
      remove(item);
      failures = 0;
      return 'next';
    }
  }

  /** 'next' when the vote is settled, 'retry' when it must stay and wait. */
  async function attempt(vote: QueuedVote): Promise<'next' | 'retry'> {
    const context = { room_id: vote.room_id, title_id: vote.title_id };
    let refreshed = false;
    for (;;) {
      let result: CastVoteResult;
      try {
        result = await deps.castVote({
          room_id: vote.room_id,
          title_id: vote.title_id,
          answer: vote.answer,
          member_id: vote.member_id,
          dwell_ms: vote.dwell_ms,
          client_at: vote.client_at,
          flipped: vote.flipped,
        });
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'denied') {
          if (refreshed) {
            // Denied after a fresh session: a bug or an attack. Drop it and say so.
            deps.report(error, context);
            remove(vote);
            removeUndoFor(vote);
            emit({ type: 'dropped', ...context });
            return 'next';
          }
          refreshed = true;
          try {
            await deps.refreshSession();
          } catch {
            return 'retry';
          }
          continue;
        }
        if (error instanceof ApiError && error.kind === 'unexpected' && error.code === '22023') {
          deps.report(error, context);
          remove(vote);
          removeUndoFor(vote);
          emit({ type: 'card_not_dealt', ...context });
          return 'next';
        }
        // Network error, timeout, server error: the vote stays first in line.
        return 'retry';
      }

      switch (result.status) {
        case 'ok':
          remove(vote);
          if (result.match) {
            // A match can't be undone: an undo queued behind this vote never goes out.
            removeUndoFor(vote);
            emit({
              type: 'match',
              ...context,
              kind: result.kind,
              decided: result.decided,
            });
          }
          if (result.finale_round_id) {
            emit({ type: 'finale', room_id: vote.room_id, round_id: result.finale_round_id });
          } else if (result.state) {
            // The vote ended the room (one film, no pick): the screens learn it as if it had
            // answered closed, and the votes behind it are not sent.
            removeRoom(vote.room_id);
            deps.invalidateRoom(vote.room_id);
            emit({ type: 'closed', room_id: vote.room_id, state: result.state });
          }
          break;
        case 'duplicate':
          remove(vote);
          break;
        case 'dropped':
          // Never recorded: Undo must not take back the vote before it.
          remove(vote);
          removeUndoFor(vote);
          emit({ type: 'dropped', ...context });
          break;
        case 'closed':
          removeRoom(vote.room_id);
          deps.invalidateRoom(vote.room_id);
          emit({ type: 'closed', room_id: vote.room_id, state: result.state });
          break;
        case 'no_super_likes':
          remove(vote);
          removeUndoFor(vote);
          emit({ type: 'no_super_likes', ...context });
          break;
      }
      failures = 0;
      return 'next';
    }
  }

  async function loop() {
    dropUnkept();
    for (;;) {
      const head = votes()[0];
      if (!head) return;
      inFlight = head;
      // A head whose send failed may still have reached the server (only the answer was lost),
      // so it stays "sent" until it settles.
      const outcome = await (isUndo(head) ? attemptUndo(head) : attempt(head));
      if (outcome === 'next') inFlight = undefined;
      if (outcome === 'retry') {
        const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]!;
        failures += 1;
        timer = setTimeout(() => {
          timer = undefined;
          start();
        }, delay);
        return;
      }
    }
  }

  function start(): Promise<void> {
    running ??= loop().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    store,

    /** Appends the vote and starts sending. Returns at once; a repeat for the same film is ignored. */
    enqueue(vote: QueuedVote): void {
      // A repeat is ignored, unless an undo for the film sits between the two.
      const list = votes();
      const undone = list.findLastIndex((v) => isUndo(v) && v.title_id === vote.title_id);
      if (list.some((v, i) => i > undone && same(v, vote))) return;
      store.setState({ votes: [...list, vote] });
      // While a retry is pending the network is down: don't hammer it.
      if (timer === undefined) void start();
    },

    /** Queues the taking back of the last vote that was already sent (or is being sent). */
    enqueueUndo(item: Omit<QueuedUndo, 'undo'>): void {
      store.setState({ votes: [...votes(), { ...item, undo: true }] });
      if (timer === undefined) void start();
    },

    /**
     * Takes the room's last vote out of the queue if it is still waiting, and returns it.
     * Null when the last item was sent already, is being sent now, or is an undo.
     */
    removeLast(roomId: string, titleId?: number): QueuedVote | null {
      const list = votes();
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i]!;
        if (item.room_id !== roomId) continue;
        if (isUndo(item) || item === inFlight) return null;
        if (titleId !== undefined && item.title_id !== titleId) return null;
        store.setState({ votes: list.filter((_, index) => index !== i) });
        return item;
      }
      return null;
    },

    /** Votes waiting for this room (for "Offline: 6 swipes waiting"). */
    pending(roomId: string): number {
      return votes().filter((v) => v.room_id === roomId && !isUndo(v)).length;
    },

    /** Super likes spent on the phone and not yet confirmed by the server. */
    pendingSuperLikes(roomId: string): number {
      return votes().filter((v) => v.room_id === roomId && !isUndo(v) && v.answer === 'super_like')
        .length;
    },

    /** The card stack's `isAnswered`. */
    has(roomId: string, titleId: number): boolean {
      return votes().some((v) => v.room_id === roomId && v.title_id === titleId && !isUndo(v));
    },

    onAnswer(listener: (event: VoteQueueEvent) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Forgets every waiting vote and stops retrying (the wipe after a deletion). */
    clear(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      failures = 0;
      store.setState({ votes: [] });
    },

    /** On start, on reconnect, on foreground: tries at once and starts the delays again. */
    flush(): Promise<void> {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      failures = 0;
      return start();
    },
  };
}

export type VoteQueue = ReturnType<typeof createVoteQueue>;
