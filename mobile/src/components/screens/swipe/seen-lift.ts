import { useCallback } from 'react';
import {
  useReducedMotion,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { SEEN_LIFT } from '@/features/swipe/feel';
import { useTopCard } from '@/features/swipe/top-card';
import { duration, easing, spring } from '@/theme/motion';

// What the rewatch question does to the top card (swipe.md#seen-it-the-rewatch-question): it
// lifts a little and holds, with the SEEN IT stamp at full, and nothing flies. Closing without
// a vote puts it back. It moves the card through the shared values the top card registers, so
// the card itself stays out of it.

const SEEN_STAMP = 3;

type Value = SharedValue<number>;

export function useSeenLift() {
  const motion = useTopCard();
  const reduced = useReducedMotion();

  /** Lifts the top card and holds it with the SEEN IT stamp at full. */
  const lift = useCallback(() => {
    const card = motion;
    if (!card) return;
    card.forced.set(SEEN_STAMP);
    card.forcedProgress.set(withTiming(1, { duration: duration.instant, easing: easing.standard }));
    card.x.set(withSpring(0, spring.snappy));
    // Reduce Motion: no lift, the stamp alone says the card is held.
    card.y.set(reduced ? 0 : withSpring(-SEEN_LIFT, spring.snappy));
  }, [motion, reduced]);

  /** Closes without a vote: the stamp goes, and the card returns unless a finger has it. */
  const drop = useCallback(
    (springBack: boolean) => {
      const card = motion;
      if (!card) return;
      card.forced.set(0);
      card.forcedProgress.set(0);
      if (!springBack) return;
      const back = (value: Value) => value.set(withSpring(0, spring.card));
      back(card.x);
      back(card.y);
    },
    [motion],
  );

  return { lift, drop };
}
