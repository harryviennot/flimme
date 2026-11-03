import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Poster } from '@/components/shared/poster';
import { Icon } from '@/components/ui/icon';
import { tokens } from '@/theme/generated/tokens';
import { duration, layout } from '@/theme/motion';

const posters = {
  left: require('@/assets/posters/southbound-summer.png'),
  middle: require('@/assets/posters/neon-harbor.png'),
  right: require('@/assets/posters/signal-and-noise.png'),
};

const fan = tokens.rotation['poster-fan'];

/**
 * Three fictional posters fanned behind each other, a heart on the front one. Decorative:
 * hidden from screen readers. They pop in once, 80 ms apart, and then stay still. The entering
 * animation sits on an outer view and the tilt on the inner one, so they don't fight.
 */
export function Hero() {
  const reduceMotion = useReducedMotion();
  const enter = (index: number) =>
    reduceMotion ? undefined : layout.popIn.delay(index * duration.instant);

  return (
    <View
      className="h-60 items-center justify-center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="welcome-hero"
    >
      <Animated.View entering={enter(0)} className="absolute left-10">
        <View
          className="h-44 w-30 overflow-hidden rounded-md bg-bg-raised"
          style={{ transform: [{ rotate: `${-fan}deg` }] }}
        >
          <Poster source={posters.left} />
        </View>
      </Animated.View>
      <Animated.View entering={enter(1)} className="absolute right-10">
        <View
          className="h-44 w-30 overflow-hidden rounded-md bg-bg-raised"
          style={{ transform: [{ rotate: `${fan}deg` }] }}
        >
          <Poster source={posters.right} />
        </View>
      </Animated.View>
      <Animated.View entering={enter(2)} className="h-52 w-35">
        <View className="size-full overflow-hidden rounded-md bg-bg-raised">
          <Poster source={posters.middle} />
        </View>
        <View className="absolute -top-3 -right-3 size-11 items-center justify-center rounded-pill bg-like-default">
          <Icon name="heart" size={22} filled color="text-inverse" />
        </View>
      </Animated.View>
    </View>
  );
}
