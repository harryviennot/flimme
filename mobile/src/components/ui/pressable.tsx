import type { ComponentRef, ReactNode, Ref } from 'react';
import { Pressable as RNPressable, type PressableProps as RNPressableProps } from 'react-native';

import { haptics, type HapticName } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

/** What a ref to a Pressable points at. */
export type PressableNode = ComponentRef<typeof RNPressable>;

export type PressableProps = Omit<RNPressableProps, 'style' | 'children' | 'accessibilityLabel'> & {
  children?: ReactNode;
  /** Required: what a screen reader says. Icon-only buttons have no other name. */
  accessibilityLabel: string;
  /** The haptic on press-in, by meaning. `false` for none. */
  haptic?: HapticName | false;
  /**
   * The button tick, played with the haptic on press-in. Every press ticks by default, except one
   * with no haptic (a touch surface that isn't a button, like the card or an overlay). `false`
   * for none; never when disabled.
   */
  sound?: 'tap' | false;
  className?: string;
  /** For moving a screen reader's focus here. */
  ref?: Ref<PressableNode>;
};

/**
 * The one touchable everything tappable uses: a 44-point minimum target, a haptic, and a
 * required accessibility label. Animated feedback is the caller's (Button, SwipeAction).
 */
export function Pressable({
  haptic = 'press',
  sound = haptic === false ? false : 'tap',
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
        if (sound && !disabled) void playSound(sound);
        onPressIn?.(event);
      }}
    />
  );
}
