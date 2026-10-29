import type { ReactNode } from 'react';
import { Pressable as RNPressable, type PressableProps as RNPressableProps } from 'react-native';

import { haptics, type HapticName } from '@/lib/haptics';

export type PressableProps = Omit<RNPressableProps, 'style' | 'children' | 'accessibilityLabel'> & {
  children?: ReactNode;
  /** Required: what a screen reader says. Icon-only buttons have no other name. */
  accessibilityLabel: string;
  /** The haptic on press-in, by meaning. `false` for none. */
  haptic?: HapticName | false;
  className?: string;
};

/**
 * The one touchable everything tappable uses: a 44-point minimum target, a haptic, and a
 * required accessibility label. Animated feedback is the caller's (Button, SwipeAction).
 */
export function Pressable({
  haptic = 'press',
  hitSlop = 8,
  accessibilityRole = 'button',
  onPressIn,
  disabled,
  accessibilityState,
  ...props
}: PressableProps) {
  return (
    <RNPressable
      {...props}
      hitSlop={hitSlop}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      onPressIn={(event) => {
        if (haptic && !disabled) haptics[haptic]();
        onPressIn?.(event);
      }}
    />
  );
}
