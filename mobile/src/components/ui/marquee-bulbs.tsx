import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { duration } from '@/theme/motion';

export type MarqueeBulbsProps = {
  /** How many bulbs in the row. */
  count?: number;
  /** Chase the light along the row (the match reveal); otherwise all lit and still. */
  chasing?: boolean;
};

function Bulb({
  index,
  count,
  phase,
}: {
  index: number;
  count: number;
  phase: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Each bulb peaks as the chase passes it; three bulbs in a row are lit at once.
    const distance = Math.abs(((phase.value * count - index) % count) + count) % count;
    return {
      opacity: interpolate(
        Math.min(distance, count - distance),
        [0, 1.5, 3],
        [1, 0.6, 0.35],
        'clamp',
      ),
    };
  });
  return (
    <Animated.View style={style} className="size-1.5 rounded-pill bg-marquee-bright glow-marquee" />
  );
}

/** The marquee's chasing lights, the brand's signature (headers, the match, the winner). */
export function MarqueeBulbs({ count = 16, chasing = false }: MarqueeBulbsProps) {
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!chasing) return;
    phase.set(
      withRepeat(
        withTiming(1, { duration: duration.celebrate * 2, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(phase);
  }, [chasing, phase]);

  return (
    <View className="flex-row gap-3" accessible={false}>
      {Array.from({ length: count }, (_, i) =>
        chasing ? (
          <Bulb key={i} index={i} count={count} phase={phase} />
        ) : (
          <View key={i} className="size-1.5 rounded-pill bg-marquee-bright glow-marquee" />
        ),
      )}
    </View>
  );
}
