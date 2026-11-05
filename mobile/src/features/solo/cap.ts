import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// The daily cap needs no read (Q42.4): the phone keeps the Paris date of the last `daily_limit`
// answer and shows the cap card on Play alone that day. `api.start_solo` stays the authority, so a
// reinstalled phone gets `daily_limit` at Start.

/** The calendar day in Paris, `YYYY-MM-DD`; the cap resets at midnight there. */
export function parisDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

type Saved = { day: string | null };
export type SoloCapState = Saved & {
  /** A `daily_limit` answer came back now. */
  reached: (now?: Date) => void;
  /** Forgets the day, so Play alone asks `api.start_solo` again (Dev menu, after raising the cap). */
  forget: () => void;
};

export const SOLO_CAP_VERSION = 1;

export function readSavedCap(saved: unknown): Saved {
  const day = (saved as { day?: unknown } | null | undefined)?.day;
  return { day: typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null };
}

export function createSoloCapStore(kv?: KeyValueStore) {
  return create<SoloCapState>()(
    persist(
      (set) => ({
        day: null,
        reached: (now = new Date()) => set({ day: parisDay(now) }),
        forget: () => set({ day: null }),
      }),
      persistOptions<SoloCapState, Saved>({
        name: 'solo-cap',
        version: SOLO_CAP_VERSION,
        migrate: readSavedCap,
        sanitize: readSavedCap,
        partialize: ({ day }) => ({ day }),
        kv,
      }),
    ),
  );
}

export const soloCapStore = createSoloCapStore();

/** Whether the last `daily_limit` came today (Paris). */
export function capIsToday(day: string | null, now: Date = new Date()): boolean {
  return day !== null && day === parisDay(now);
}

/** True on the day of the last `daily_limit` answer. */
export function useCapToday(): boolean {
  const day = soloCapStore((s) => s.day);
  return capIsToday(day);
}

export function markCapReached(now?: Date): void {
  soloCapStore.getState().reached(now);
}
