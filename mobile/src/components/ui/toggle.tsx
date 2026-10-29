import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { timing } from '@/theme/motion';

import { Pressable } from './pressable';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** What a screen reader says, e.g. "Hide films anyone has seen". */
  accessibilityLabel: string;
  disabled?: boolean;
};

// Track 52 by 32; the 24-point knob sits 4 points from the edge when on, 5 when off (the
// off track has a 1-point border).
const KNOB_ON = 24;
const KNOB_OFF = 5;

/** Figma "Toggle": an on/off switch. */
export function Toggle({ value, onValueChange, accessibilityLabel, disabled }: ToggleProps) {
  const x = useSharedValue(value ? KNOB_ON : KNOB_OFF);
  useEffect(() => {
    x.set(withTiming(value ? KNOB_ON : KNOB_OFF, timing.toggle));
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      className={cn('h-8 w-13 justify-center rounded-pill', disabled && 'opacity-disabled')}
    >
      <View
        className={cn(
          'absolute inset-0 rounded-pill',
          value ? 'bg-accent-default' : 'border border-border-control bg-bg-raised',
        )}
      />
      <Animated.View
        style={knob}
        className={cn(
          'absolute top-1 size-6 rounded-pill',
          value ? 'bg-text-on-accent' : 'bg-text-secondary',
        )}
      />
    </Pressable>
  );
}
