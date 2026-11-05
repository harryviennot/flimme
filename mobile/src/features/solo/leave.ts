import { ApiError } from '@flimme/contract';
import { router } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/api';
import { useOnline } from '@/features/network';
import { releaseRoomGuards, useExitRoomToHome } from '@/features/room';
import { voteQueue } from '@/features/swipe';
import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

import { forgetSoloSession } from './session';

// Leaving a solo session (swipe.md#the-solo-top-bar): the phone goes to Play at once with no alert,
// and in the background the queue sends the room's waiting votes, then `api.leave_room`. A leave
// that can't go yet (offline, votes still waiting) is kept on the phone and tried again on the next
// launch or when the phone is back. If it never goes, the sweeper ends the room after 30 minutes.

type Saved = { rooms: string[] };
export type PendingLeavesState = Saved & {
  add: (roomId: string) => void;
  remove: (roomId: string) => void;
};

export function readSavedLeaves(saved: unknown): Saved {
  const rooms = (saved as { rooms?: unknown } | null | undefined)?.rooms;
  return {
    rooms: Array.isArray(rooms) ? rooms.filter((r): r is string => typeof r === 'string') : [],
  };
}

export function createPendingLeaves(kv?: KeyValueStore) {
  return create<PendingLeavesState>()(
    persist(
      (set, get) => ({
        rooms: [],
        add: (roomId) => {
          if (!get().rooms.includes(roomId)) set({ rooms: [...get().rooms, roomId] });
        },
        remove: (roomId) => set({ rooms: get().rooms.filter((r) => r !== roomId) }),
      }),
      persistOptions<PendingLeavesState, Saved>({
        name: 'solo-leaves',
        version: 1,
        migrate: readSavedLeaves,
        sanitize: readSavedLeaves,
        partialize: ({ rooms }) => ({ rooms }),
        kv,
      }),
    ),
  );
}

export const pendingLeaves = createPendingLeaves();

/** Rooms this phone is leaving right now: the room layout doesn't treat their end as news. */
const leaving = new Set<string>();
export const isLeavingSolo = (roomId: string) => leaving.has(roomId);

export type SettleDeps = {
  flush: () => Promise<void>;
  waitingVotes: (roomId: string) => number;
  leaveRoom: (roomId: string) => Promise<unknown>;
};

const liveDeps: SettleDeps = {
  flush: () => voteQueue.flush(),
  waitingVotes: (roomId) => voteQueue.pending(roomId),
  leaveRoom: (roomId) => api.leaveRoom({ room_id: roomId }),
};

let settling: Promise<void> | null = null;

/**
 * Tries every waiting leave: the votes first, then `leave_room`. A room whose votes still wait, or
 * whose call hit the network, stays for next time; any other answer settles it.
 */
export function settleLeaves(
  store: { getState: () => PendingLeavesState } = pendingLeaves,
  deps: SettleDeps = liveDeps,
): Promise<void> {
  settling ??= (async () => {
    // A leave added while this pass runs is picked up by the next round of the loop.
    const tried = new Set<string>();
    for (;;) {
      const next = store.getState().rooms.find((roomId) => !tried.has(roomId));
      if (next === undefined) return;
      tried.add(next);
      await deps.flush();
      if (deps.waitingVotes(next) > 0) continue;
      try {
        await deps.leaveRoom(next);
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'network') continue;
      }
      store.getState().remove(next);
      leaving.delete(next);
    }
  })().finally(() => {
    settling = null;
  });
  return settling;
}

/** Remembers the leave and starts it. Never throws. */
export function leaveSolo(roomId: string): Promise<void> {
  leaving.add(roomId);
  forgetSoloSession(roomId);
  pendingLeaves.getState().add(roomId);
  return settleLeaves().catch(() => {});
}

/** Leave, the edge swipe and Android's back in a solo room: Play at once, then the leave. */
export function useLeaveSolo(roomId: string | undefined): () => void {
  const exitToHome = useExitRoomToHome();
  return useCallback(() => {
    if (roomId) void leaveSolo(roomId);
    exitToHome();
  }, [roomId, exitToHome]);
}

/** Leaves the session, then opens My films or host setup (the end cards' buttons). */
export function useLeaveSoloTo(roomId: string | undefined): {
  myFilms: () => void;
  host: () => void;
} {
  const exitToMyFilms = useExitRoomToHome('/my-films');
  const myFilms = useCallback(() => {
    if (roomId) void leaveSolo(roomId);
    exitToMyFilms();
  }, [roomId, exitToMyFilms]);
  const host = useCallback(() => {
    if (roomId) void leaveSolo(roomId);
    releaseRoomGuards();
    router.replace('/host');
  }, [roomId]);
  return { myFilms, host };
}

/**
 * Play sends what a solo session left behind: the votes still queued (a solo room is never
 * reopened, so nothing else would) and the leaves that could not go. On open and when back online.
 */
export function useSettleSolo(): void {
  const online = useOnline();
  useEffect(() => {
    if (!online) return;
    if (voteQueue.store.getState().votes.some((v) => v.solo)) void voteQueue.flush();
    if (pendingLeaves.getState().rooms.length > 0) void settleLeaves().catch(() => {});
  }, [online]);
}
