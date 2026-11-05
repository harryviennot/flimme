import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  ReduceMotion,
  useReducedMotion,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useStore } from 'zustand';

import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import type { CardStack } from '@/features/swipe/card-stack';
import { LEAN_SHARE, commitLines } from '@/features/swipe/feel';
import {
  hintsToFinish,
  useHintsStore,
  visibleHint,
  type HintId,
  type HintSignalsStore,
} from '@/features/swipe/hints';
import { useTopCard } from '@/features/swipe/top-card';
import { duration, easing, layout, spring } from '@/theme/motion';

// The first-game hint line between the stack and the buttons (swipe.md#first-game-hints): one
// hint at a time, never over the card or the buttons. Card 1 also leans the top card right and
// then left once, through the registered top card's values (the stamps follow from its x).

export type SwipeHintsProps = {
  /** The room hides seen films. */
  hideSeen: boolean;
  stack: CardStack;
  signals: HintSignalsStore;
  /** What the super likes hint says: how many each player gets. */
  superLikes: number;
};

export function SwipeHints({ hideSeen, stack, signals, superLikes }: SwipeHintsProps) {
  const { t } = useTranslation('swipe');
  const done = useStore(useHintsStore, (s) => s.done);
  const finish = useStore(useHintsStore, (s) => s.finish);
  const game = useStore(signals);
  const flips = useStore(stack, (s) => s.flips);

  const g = useMemo(() => ({ ...game, flips }), [game, flips]);
  const visible = visibleHint(done, g);

  // A hint is remembered once it is gone: its signal came, or a later one took its place.
  const previous = useRef<HintId | null>(null);
  useEffect(() => {
    const gone = new Set(hintsToFinish(done, g));
    if (previous.current && previous.current !== visible) gone.add(previous.current);
    gone.forEach((id) => finish(id));
    previous.current = visible;
  }, [done, g, visible, finish]);

  useLean(visible === 'swipe');

  const text =
    visible === 'swipe'
      ? t('hints.swipe')
      : visible === 'seen'
        ? t(hideSeen ? 'hints.seenHide' : 'hints.seen')
        : visible === 'flip'
          ? t('hints.flip')
          : visible === 'superLikes'
            ? t('hints.superLikes', { count: superLikes })
            : null;

  // The line's room stays while a hint is still to come, so the stack never changes size.
  const anyLeft = Object.values(done).some((isDone) => !isDone);
  if (!anyLeft) return null;

  return (
    <View className="min-h-12 items-center justify-center px-6 py-2">
      {visible && text ? (
        <Animated.View key={visible} entering={layout.fadeIn} exiting={layout.fadeOut}>
          {visible === 'superLikes' ? (
            <Pressable
              accessibilityLabel={t('hints.dismiss')}
              accessibilityHint={text}
              onPress={() => signals.getState().dismissSuperLikes()}
              className="flex-row items-center justify-center gap-2"
            >
              <Text variant="body-s" tone="secondary" className="shrink text-center">
                {text}
              </Text>
              <Icon name="x" size={14} color="text-secondary" />
            </Pressable>
          ) : (
            <Text variant="body-s" tone="secondary" className="text-center">
              {text}
            </Text>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

// Card 1: after the hint delay with no touch, the card leans right to a third of the commit
// line (LIKE at that share), comes back, then leans left (NOPE), once. A touch cancels it:
// the card's own pan gesture cancels every animation on its values when a finger lands. With
// Reduce Motion the stamps show still (no tilt, no spring) for the same time.
export function useLean(active: boolean) {
  const motion = useTopCard();
  const reduced = useReducedMotion();
  const screen = useWindowDimensions();
  const ran = useRef<unknown>(null);

  useEffect(() => {
    if (!active || !motion || ran.current === motion) return;
    ran.current = motion;
    const reach = commitLines(screen.width, screen.height).x * LEAN_SHARE;
    const never = { reduceMotion: ReduceMotion.Never };
    const out = (to: number) =>
      reduced
        ? withTiming(to, { duration: 1, ...never })
        : withTiming(to, { duration: duration.slow, easing: easing.standard, ...never });
    const back = reduced
      ? withDelay(duration.slow, withTiming(0, { duration: 1, ...never }), ReduceMotion.Never)
      : withSpring(0, spring.card);
    motion.x.set(
      // Every wrapper says Never too: under Reduce Motion Reanimated would skip the whole
      // sequence to its end, and the stamps are what replaces the lean.
      withDelay(
        duration['hint-delay'],
        withSequence(
          ReduceMotion.Never,
          withSequence(ReduceMotion.Never, out(reach), back),
          withSequence(ReduceMotion.Never, out(-reach), back),
        ),
        ReduceMotion.Never,
      ),
    );
  }, [active, motion, reduced, screen.width, screen.height]);
}
