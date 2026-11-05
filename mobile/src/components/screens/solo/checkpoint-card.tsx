import { useEffect, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, ScrollView, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { SessionEntry } from '@/features/solo/session';
import {
  commitLines,
  decideRelease,
  progressOf,
  SECOND_CARD_SCALE,
  THROW_DISTANCE,
  TOUCH_SLOP,
} from '@/features/swipe/feel';
import { haptics } from '@/lib/haptics';
import { duration, easing, spring, timing } from '@/theme/motion';

import { LikesFan } from './likes-fan';

// The checkpoint (swipe.md#the-checkpoint-card, moments.md#the-checkpoint): a card in the phone's
// own stack after every 20th answer. It never moves on by itself: Keep going, or a drag past the
// commit line in any direction, sends it away like a card, with no stamp and no vote.

type Size = { width: number; height: number };

export type CheckpointCardProps = {
  size: Size;
  screen: { width: number; height: number };
  /** This session's likes, in pick order. */
  likes: readonly SessionEntry[];
  imageBase: string | undefined;
  onPick: () => void;
  /** The card is gone: back to the deck. */
  onDismiss: () => void;
};

export function CheckpointCard({
  size,
  screen,
  likes,
  imageBase,
  onPick,
  onDismiss,
}: CheckpointCardProps) {
  const { t } = useTranslation('solo');
  const reduced = useReducedMotion();
  const line = useRef<ComponentRef<typeof View>>(null);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const crossed = useSharedValue(0);
  const scale = useSharedValue(reduced ? 1 : SECOND_CARD_SCALE);
  const lines = commitLines(screen.width, screen.height);
  const count = likes.length;

  // It rises from behind like any next card, and says it is there: one light buzz, focus on its line.
  useEffect(() => {
    scale.set(withTiming(1, timing.base));
    haptics.checkpoint();
    const node = line.current ? findNodeHandle(line.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [scale]);

  const pan = usePanGesture({
    testID: 'checkpoint-pan',
    minDistance: TOUCH_SLOP,
    onBegin: () => {
      'worklet';
      cancelAnimation(x);
      cancelAnimation(y);
      startX.set(x.get());
      startY.set(y.get());
    },
    onUpdate: (e) => {
      'worklet';
      x.set(startX.get() + e.translationX);
      y.set(startY.get() + e.translationY);
      const past = progressOf(x.get(), y.get(), lines) >= 1;
      if (past && crossed.get() === 0) {
        crossed.set(1);
        scheduleOnRN(haptics.commit);
      } else if (!past) {
        crossed.set(0);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const direction = e.canceled
        ? null
        : decideRelease({ dx: x.get(), dy: y.get(), vx: e.velocityX, vy: e.velocityY }, lines);
      if (direction === null) {
        x.set(withSpring(0, spring.card));
        y.set(withSpring(0, spring.card));
        return;
      }
      const toX =
        direction === 'up' ? 0 : (direction === 'left' ? -1 : 1) * screen.width * THROW_DISTANCE;
      const toY = direction === 'up' ? -screen.height * THROW_DISTANCE : 0;
      scheduleOnRN(haptics.throw);
      x.set(withTiming(toX, { duration: duration.slow, easing: easing.exit }));
      y.set(
        withTiming(toY, { duration: duration.slow, easing: easing.exit }, (finished) => {
          if (finished) scheduleOnRN(onDismiss);
        }),
      );
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        testID="checkpoint-card"
        // Above the cards waiting behind it (their zIndex is 10 or less), under a card still in the air.
        style={[style, { width: size.width, height: size.height, zIndex: 15 }]}
        className="absolute rounded-xl border border-marquee-strong bg-bg-surface"
      >
        <ScrollView contentContainerClassName="grow items-center justify-center gap-4 p-6">
          {count > 0 ? (
            <>
              <LikesFan likes={likes} imageBase={imageBase} screenWidth={screen.width} />
              <Text
                variant="display-xl"
                tone="marquee"
                importantForAccessibility="no"
                accessibilityElementsHidden
              >
                {new Intl.NumberFormat().format(count)}
              </Text>
            </>
          ) : (
            <Icon name="popcorn" size={32} color="text-muted" />
          )}
          <View ref={line} accessible accessibilityRole="header">
            <Text variant="title-m" align="center">
              {count > 0 ? t('checkpoint.liked', { count }) : t('checkpoint.none')}
            </Text>
          </View>
          <View className="gap-3 self-stretch">
            {count > 0 ? (
              <Button
                label={t('checkpoint.pick')}
                variant="marquee"
                size="l"
                icon="ticket"
                block
                onPress={onPick}
              />
            ) : null}
            <Button
              label={t('checkpoint.continue')}
              variant="secondary"
              size="l"
              block
              onPress={onDismiss}
            />
          </View>
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
