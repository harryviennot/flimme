import type { NextCard } from '@flimme/contract';
import { useSyncExternalStore } from 'react';

// The card whose synopsis sheet is open (swipe.md#the-synopsis-sheet). The sheet is its own route,
// so the card on top hands itself over when "Read more" is tapped; the sheet reads it from here
// by title id. Everything is in the card's payload: it opens offline. A sheet that finds no card
// (a re-read cleared it) closes.

let current: NextCard | null = null;
const listeners = new Set<() => void>();

/** Keeps the card for the sheet that is about to open. */
export function setSynopsisCard(card: NextCard | null): void {
  current = card;
  listeners.forEach((listener) => listener());
}

/** The kept card, if it is the film asked for. */
export function synopsisCardOf(titleId: number): NextCard | null {
  return current?.title_id === titleId ? current : null;
}

/** The kept card for a title id; `null` when there is none. */
export function useSynopsisCard(titleId: number): NextCard | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => synopsisCardOf(titleId),
    () => null,
  );
}
