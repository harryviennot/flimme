import type { ComponentRef, ReactNode, Ref } from 'react';
import { Pressable as RNPressable, type PressableProps as RNPressableProps } from 'react-native';

import { haptics, type HapticName } from '@/lib/haptics';
import { playSound, type ButtonSound } from '@/lib/sound';

/**
 * For a tile or chip in a list that scrolls (and in a sheet that can be dragged down): the press
 * starts this long after the finger lands, so a scroll that starts on it cancels it before the
 * tick. A tap shorter than this still presses in on release, right with the selection.
 */
export const SCROLL_PRESS_DELAY_MS = 130;

/** What a ref to a Pressable points at. */
export type PressableNode = ComponentRef<typeof RNPressable>;

export type PressableProps = Omit<RNPressableProps, 'style' | 'children' | 'accessibilityLabel'> & {
  children?: ReactNode;
  /** Required: what a screen reader says. Icon-only buttons have no other name. */
  accessibilityLabel: string;
  /** The haptic on press-in, by meaning. `false` for none. */
  haptic?: HapticName | false;
  /**
   * Played with the haptic on press-in. Every press ticks by default, except one with no haptic (a
   * touch surface that isn't a button, like the card or an overlay); Lock in sets its own latch.
   * `false` for none; never when disabled.
   */
  sound?: ButtonSound | false;
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
