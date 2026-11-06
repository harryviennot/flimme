import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// Saves for Later waiting to reach the server (swipe.md#the-bookmark). A save is not an answer,
// so it does not go through the vote queue (which belongs to a room and is dropped with it); it
// follows the same pattern: kept on the device, sent in the background, in order, until the
// server has it. One wish per film: the last one wins.

export type PendingSave = { title_id: number; saved: boolean };
type Saved = { items: PendingSave[] };
export type PendingSavesState = Saved & {
  put: (titleId: number, saved: boolean) => void;
  /** The server has this wish. A newer wish for the same film stays. */
  settle: (item: PendingSave) => void;
};

export function readSavedSaves(saved: unknown): Saved {
  const list = (saved as { items?: unknown } | null | undefined)?.items;
  if (!Array.isArray(list)) return { items: [] };
  const items: PendingSave[] = [];
  for (const raw of list) {
    const v = raw as Record<string, unknown> | null;
    if (v && typeof v.title_id === 'number' && typeof v.saved === 'boolean') {
      items.push({ title_id: v.title_id, saved: v.saved });
    }
  }
  return { items };
}

export function createPendingSaves(kv?: KeyValueStore) {
  return create<PendingSavesState>()(
    persist(
      (set, get) => ({
        items: [],
        put: (titleId, saved) => {
          const items = get().items;
          const at = items.findIndex((i) => i.title_id === titleId);
          set({
            items:
              at === -1
                ? [...items, { title_id: titleId, saved }]
                : items.map((i, index) => (index === at ? { title_id: titleId, saved } : i)),
          });
        },
        settle: (item) =>
          set({
            items: get().items.filter(
              (i) => !(i.title_id === item.title_id && i.saved === item.saved),
            ),
          }),
      }),
      persistOptions<PendingSavesState, Saved>({
        name: 'later-saves',
        version: 1,
        migrate: readSavedSaves,
        sanitize: readSavedSaves,
        partialize: ({ items }) => ({ items }),
        kv,
      }),
    ),
  );
}

export const pendingSaves = createPendingSaves();
