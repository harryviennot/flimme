import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics, type HapticName } from '@/lib/haptics';
import { spring, timing } from '@/theme/motion';

import type { GalleryEntry } from '../gallery';
import { Button } from './button';
import { Text } from './text';

type Play = (x: { set: (v: number) => void }) => void;

const moves: { name: string; play: Play }[] = [
  ...(['press', 'release', 'toggle', 'base', 'flip', 'exit', 'celebrate'] as const).map((key) => ({
    name: `timing.${key}`,
    play: ((x) =>
      x.set(withSequence(withTiming(1, timing[key]), withTiming(0, timing[key])))) as Play,
  })),
  ...(['card', 'snappy', 'bouncy'] as const).map((key) => ({
    name: `spring.${key}`,
    play: ((x) =>
      x.set(withSequence(withSpring(1, spring[key]), withSpring(0, spring[key])))) as Play,
  })),
];

function Move({ name, play }: { name: string; play: Play }) {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 200 }] }));
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text variant="mono-data" tone="secondary">
          {name}
        </Text>
        <Button label="Play" variant="ghost" size="s" onPress={() => play(x)} />
      </View>
      <View className="h-6 justify-center rounded-pill bg-bg-raised px-1">
        <Animated.View style={style} className="size-4 rounded-pill bg-marquee-default" />
      </View>
    </View>
  );
}

const hapticNames: HapticName[] = [
  'commit',
  'press',
  'throw',
  'match',
  'veto',
  'countdown',
  'error',
];

export const gallery: GalleryEntry = {
  name: 'Motion and haptics',
  tier: 'ui',
  description:
    'Every timing and spring from the motion tokens, and every haptic by meaning. Feel them on a phone.',
  render: () => (
    <View className="gap-4">
      {moves.map((move) => (
        <Move key={move.name} {...move} />
      ))}
      <View className="flex-row flex-wrap gap-2">
        {hapticNames.map((name) => (
          <Button
            key={name}
            label={name}
            variant="secondary"
            size="s"
            onPress={() => haptics[name]()}
          />
        ))}
      </View>
    </View>
  ),
};
