import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { timing } from '@/theme/motion';

import { Avatar, type AvatarColor } from './avatar';
import { Pressable } from './pressable';

export type AvatarPickerProps = {
  colors: readonly AvatarColor[];
  value: AvatarColor | null;
  onChange: (color: AvatarColor) => void;
  /** The letter every swatch shows; empty when there is none yet. */
  initial: string;
  /** What a screen reader calls the group. */
  label?: string;
};

const rings: Record<AvatarColor, string> = {
  blue: 'border-avatar-blue',
  green: 'border-avatar-green',
  gold: 'border-avatar-gold',
  red: 'border-avatar-red',
  violet: 'border-avatar-violet',
  teal: 'border-avatar-teal',
  pink: 'border-avatar-pink',
  orange: 'border-avatar-orange',
  sky: 'border-avatar-sky',
  lime: 'border-avatar-lime',
};

const RING = 'absolute inset-0 rounded-pill border-2';

/** The selection ring: 2 points out from the disc, in the swatch's own color. */
function Ring({ color }: { color: AvatarColor }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) progress.set(withTiming(1, timing.toggle));
  }, [progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.8 + 0.2 * progress.get() }],
  }));
  if (reduceMotion) {
    return <View testID="avatar-ring" pointerEvents="none" className={cn(RING, rings[color])} />;
  }
  return (
    <Animated.View
      testID="avatar-ring"
      pointerEvents="none"
      style={style}
      className={cn(RING, rings[color])}
    />
  );
}

/** One row of colored swatches showing the player's initial; one of them is chosen. */
export function AvatarPicker({ colors, value, onChange, initial, label }: AvatarPickerProps) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row items-center justify-between self-stretch"
    >
      {colors.map((color) => {
        const selected = color === value;
        const colorName = t(`colors.${color}` as 'colors.blue');
        return (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityLabel={selected ? t('colors.selected', { color: colorName }) : colorName}
            accessibilityState={{ selected }}
            onPress={() => onChange(color)}
            className="size-12 items-center justify-center"
          >
            {selected ? <Ring color={color} /> : null}
            <Avatar name={initial} color={color} size="m" />
          </Pressable>
        );
      })}
    </View>
  );
}
