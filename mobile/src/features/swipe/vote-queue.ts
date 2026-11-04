import type { CastVoteResult, MatchKind, RoomState, VoteAnswer } from '@flimme/contract';
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
  /** Kept now, sent once `api.cast_vote` takes `p_flipped` (M6.2). */
  flipped: boolean;
};

/** What the screens hear about. Nothing here says a swipe was lost. */
export type VoteQueueEvent =
  | { type: 'match'; room_id: string; title_id: number; kind?: MatchKind; decided?: boolean }
  | { type: 'finale'; room_id: string; round_id: string }
  | { type: 'closed'; room_id: string; state: RoomState }
  | { type: 'no_super_likes'; room_id: string; title_id: number }
  /** The film was never this seat's to swipe: refetch the cards. */
  | { type: 'card_not_dealt'; room_id: string; title_id: number };

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
  }) => Promise<CastVoteResult>;
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

type Saved = { votes: QueuedVote[] };
type QueueState = Saved;

function readVote(raw: unknown): QueuedVote | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
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
  return { votes: list.map(readVote).filter((v): v is QueuedVote => v !== null) };
}

export function createVoteQueue(deps: VoteQueueDeps) {
  const store = create<QueueState>()(
    persist(
      () => ({ votes: [] as QueuedVote[] }),
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
  const same = (a: QueuedVote, b: QueuedVote) =>
    a.room_id === b.room_id && a.title_id === b.title_id;

  function emit(event: VoteQueueEvent) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        deps.report(error, { room_id: event.room_id });
      }
    }
  }

  function remove(vote: QueuedVote) {
    store.setState({ votes: votes().filter((v) => !same(v, vote)) });
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
        });
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'denied') {
          if (refreshed) {
            // Denied after a fresh session: a bug or an attack. Drop it and say so.
            deps.report(error, context);
            remove(vote);
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
            emit({
              type: 'match',
              ...context,
              kind: result.kind,
              decided: result.decided,
            });
          }
          if (result.finale_round_id) {
            emit({ type: 'finale', room_id: vote.room_id, round_id: result.finale_round_id });
          }
          break;
        case 'duplicate':
        case 'dropped':
          remove(vote);
          break;
        case 'closed':
          removeRoom(vote.room_id);
          deps.invalidateRoom(vote.room_id);
          emit({ type: 'closed', room_id: vote.room_id, state: result.state });
          break;
        case 'no_super_likes':
          remove(vote);
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
      if ((await attempt(head)) === 'retry') {
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
      if (votes().some((v) => same(v, vote))) return;
      store.setState({ votes: [...votes(), vote] });
      // While a retry is pending the network is down: don't hammer it.
      if (timer === undefined) void start();
    },

    /** Votes waiting for this room (for "Offline: 6 swipes waiting"). */
    pending(roomId: string): number {
      return votes().filter((v) => v.room_id === roomId).length;
    },

    /** Super likes spent on the phone and not yet confirmed by the server. */
    pendingSuperLikes(roomId: string): number {
      return votes().filter((v) => v.room_id === roomId && v.answer === 'super_like').length;
    },

    /** The card stack's `isAnswered`. */
    has(roomId: string, titleId: number): boolean {
      return votes().some((v) => v.room_id === roomId && v.title_id === titleId);
    },

    onAnswer(listener: (event: VoteQueueEvent) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
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
