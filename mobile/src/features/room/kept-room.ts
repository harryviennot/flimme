import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

/** The room the phone is in, kept so a restart can offer it back (app-structure.md#invites-and-deep-links). */
export type KeptRoom = { id: string; code: string };
type Saved = { room: KeptRoom | null };

export type KeptRoomState = Saved & {
  keep: (room: KeptRoom) => void;
  /** Without an id, forgets whatever is kept. With one, only that room. */
  forget: (id?: string) => void;
};

export const KEPT_ROOM_VERSION = 1;

/** Anything that isn't `{ room: { id, code } }` of two non-empty strings reads as no room. */
export function readKeptRoom(saved: unknown): Saved {
  const room = (saved as { room?: unknown } | null | undefined)?.room as
    Partial<Record<keyof KeptRoom, unknown>> | null | undefined;
  if (
    room &&
    typeof room === 'object' &&
    typeof room.id === 'string' &&
    room.id !== '' &&
    typeof room.code === 'string' &&
    room.code !== ''
  ) {
    return { room: { id: room.id, code: room.code } };
  }
  return { room: null };
}

export function createKeptRoomStore(kv?: KeyValueStore) {
  return create<KeptRoomState>()(
    persist(
      (set, get) => ({
        room: null,
        keep: (room) => {
          const kept = get().room;
          if (kept?.id === room.id && kept.code === room.code) return;
          set({ room: { id: room.id, code: room.code } });
        },
        forget: (id) => {
          const kept = get().room;
          if (kept && (id === undefined || kept.id === id)) set({ room: null });
        },
      }),
      persistOptions<KeptRoomState, Saved>({
        name: 'room',
        version: KEPT_ROOM_VERSION,
        migrate: readKeptRoom,
        sanitize: readKeptRoom,
        partialize: ({ room }) => ({ room }),
        kv,
      }),
    ),
  );
}

export const keptRoomStore = createKeptRoomStore();

/** The kept room and the two ways to change it. */
export function useKeptRoom() {
  const room = keptRoomStore((state) => state.room);
  const keep = keptRoomStore((state) => state.keep);
  const forget = keptRoomStore((state) => state.forget);
  return { room, keep, forget };
}
