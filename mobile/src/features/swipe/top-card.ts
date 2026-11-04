import { useSyncExternalStore } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

// The top card's drag values, shared so the first-game hint (M6.18) can lean the card without
// touching the gesture code: it moves `x` (the stamps and the tilt follow from it). Every
// swipe card owns its values (a thrown card keeps flying on its own); only the card on top is
// registered here.

export type CardMotion = {
  /** Distance from the middle, in points. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** The answer a button forces (0 none, 1 like, 2 nope, 3 seen, 4 super) and its progress. */
  forced: SharedValue<number>;
  forcedProgress: SharedValue<number>;
};

/** Creates one card's values. */
export function useCardMotion(): CardMotion {
  return {
    x: useSharedValue(0),
    y: useSharedValue(0),
    forced: useSharedValue(0),
    forcedProgress: useSharedValue(0),
  };
}

let current: CardMotion | null = null;
const listeners = new Set<() => void>();

/** The swipe card on top registers its values; null when none is. */
export function registerTopCard(motion: CardMotion | null): void {
  if (current === motion) return;
  current = motion;
  listeners.forEach((listener) => listener());
}

/** The top card's drag values, or null while there is no card on top. */
export function useTopCard(): CardMotion | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
