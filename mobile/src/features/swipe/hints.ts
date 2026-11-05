import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

import type { AnswerKind } from './answer';

// The first-game hints (swipe.md#first-game-hints): which hint shows under the card, and which
// are gone for good. Each hint is remembered on its own, per phone: one not finished in the
// first game shows in the next (Q18.2). "Card N" is this game's Nth card on this phone, so
// card 1 is zero answers given.

export type HintId = 'swipe' | 'seen' | 'flip' | 'superLikes';

/** Later hints replace earlier ones. */
export const HINT_ORDER: readonly HintId[] = ['swipe', 'seen', 'flip', 'superLikes'];

/** Card 10 (nine answers given): the Seen it and flip hints give up. */
export const LAST_HINT_ANSWERS = 9;
/** Card 5 (four answers given): the super likes hint shows even without a star tap. */
export const SUPER_HINT_ANSWERS = 4;
/** The super likes hint leaves this many answers after it appeared. */
export const SUPER_HINT_LIFE = 3;

export type HintDone = Record<HintId, boolean>;

export type HintSignals = {
  answers: number;
  seenAnswered: boolean;
  starTapped: boolean;
  /** The answer count when the super likes hint became due, or null. */
  superFrom: number | null;
  superDismissed: boolean;
  flips: number;
};

/** Which hints this game's signals have finished, shown or not. */
export function hintsToFinish(done: HintDone, g: HintSignals): HintId[] {
  const gone: Record<HintId, boolean> = {
    swipe: g.answers >= 1,
    seen: g.seenAnswered || g.answers >= LAST_HINT_ANSWERS,
    flip: g.flips > 0 || g.answers >= LAST_HINT_ANSWERS,
    superLikes:
      g.superDismissed || (g.superFrom !== null && g.answers >= g.superFrom + SUPER_HINT_LIFE),
  };
  return HINT_ORDER.filter((id) => gone[id] && !done[id]);
}

/** The one hint to show now: the latest due hint that is neither done nor finished. */
export function visibleHint(done: HintDone, g: HintSignals): HintId | null {
  const finished = new Set(hintsToFinish(done, g));
  const due: Record<HintId, boolean> = {
    swipe: g.answers === 0,
    seen: g.answers >= 1,
    flip: g.answers >= 2,
    superLikes: g.starTapped || g.answers >= SUPER_HINT_ANSWERS,
  };
  const shown = HINT_ORDER.filter((id) => due[id] && !done[id] && !finished.has(id));
  return shown[shown.length - 1] ?? null;
}

/** This game's signals. Flips come from the card stack, not from here. */
export function createHintSignals() {
  return create<
    HintSignals & {
      record: (kind: AnswerKind) => void;
      dismissSuperLikes: () => void;
    }
  >()((set) => ({
    answers: 0,
    seenAnswered: false,
    starTapped: false,
    superFrom: null,
    superDismissed: false,
    flips: 0,
    record: (kind) =>
      set((s) => {
        const answers = s.answers + 1;
        const starTapped = s.starTapped || kind === 'super_like';
        const due = starTapped || answers >= SUPER_HINT_ANSWERS;
        return {
          answers,
          starTapped,
          seenAnswered: s.seenAnswered || kind === 'seen' || kind === 'seen_rewatch',
          superFrom: s.superFrom ?? (due ? answers : null),
        };
      }),
    dismissSuperLikes: () => set({ superDismissed: true }),
  }));
}

export type HintSignalsStore = ReturnType<typeof createHintSignals>;

type HintsSaved = { done: HintDone };
export type HintsState = HintsSaved & { finish: (id: HintId) => void; reset: () => void };

export const HINTS_VERSION = 1;

const noneDone = (): HintDone => ({ swipe: false, seen: false, flip: false, superLikes: false });

/** Saved values read into today's shape: anything that isn't `true` counts as not done. */
export function migrateHints(saved: unknown): HintsSaved {
  const done = ((saved ?? {}) as { done?: Partial<Record<HintId, unknown>> }).done ?? {};
  const out = noneDone();
  for (const id of HINT_ORDER) out[id] = done[id] === true;
  return { done: out };
}

export function createHintsStore(kv?: KeyValueStore) {
  return create<HintsState>()(
    persist(
      (set) => ({
        done: noneDone(),
        reset: () => set({ done: noneDone() }),
        finish: (id) => set((s) => (s.done[id] ? s : { done: { ...s.done, [id]: true } })),
      }),
      persistOptions<HintsState, HintsSaved>({
        name: 'hints',
        version: HINTS_VERSION,
        migrate: migrateHints,
        sanitize: migrateHints,
        partialize: ({ done }) => ({ done }),
        kv,
      }),
    ),
  );
}

/** The phone's hint memory. */
export const useHintsStore = createHintsStore();
