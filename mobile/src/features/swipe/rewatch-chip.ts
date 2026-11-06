import { useCallback, useEffect, useRef, useState } from 'react';

// The rewatch chip's lifetime (swipe.md#seen-it-the-rewatch-question). A Seen it has already
// been sent as a plain `seen`; the chip offers to turn it into a rewatch. It stays until the next
// answer or this long, and never on a timer while a screen reader is on (the player may still be
// reading). After Yes, the confirmation shows for a moment.

/** How long the chip waits for a Yes. */
export const REWATCH_CHIP_MS = 5000;
/** How long "Up for a rewatch" shows after Yes. */
export const REWATCH_DONE_MS = 1500;

type ChipState = { phase: 'idle' } | { phase: 'ask'; titleId: number } | { phase: 'done' };

export function useRewatchChip(screenReader: boolean) {
  const [state, setState] = useState<ChipState>({ phase: 'idle' });
  // What a double tap on Yes reads: the second press finds the chip already claimed.
  const asked = useRef<number | null>(null);

  const set = useCallback((next: ChipState) => {
    asked.current = next.phase === 'ask' ? next.titleId : null;
    setState(next);
  }, []);

  useEffect(() => {
    if (state.phase === 'ask' && !screenReader) {
      const timer = setTimeout(() => set({ phase: 'idle' }), REWATCH_CHIP_MS);
      return () => clearTimeout(timer);
    }
    if (state.phase === 'done') {
      const timer = setTimeout(() => set({ phase: 'idle' }), REWATCH_DONE_MS);
      return () => clearTimeout(timer);
    }
  }, [state, screenReader, set]);

  const offer = useCallback((titleId: number) => set({ phase: 'ask', titleId }), [set]);
  const clear = useCallback(() => set({ phase: 'idle' }), [set]);
  /** Yes: returns the film once and shows the confirmation; null if the chip is not there. */
  const claim = useCallback((): number | null => {
    const titleId = asked.current;
    if (titleId === null) return null;
    set({ phase: 'done' });
    return titleId;
  }, [set]);

  return {
    /** The film the chip is offered for, or null when it is not showing. */
    titleId: state.phase === 'ask' ? state.titleId : null,
    /** "Up for a rewatch" is showing. */
    done: state.phase === 'done',
    /** A Seen it was just sent for this film. */
    offer,
    /** The chip goes: the next answer, an Undo, the room moving on. */
    clear,
    claim,
  };
}
