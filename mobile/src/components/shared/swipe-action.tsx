import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text, type TextTone } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import type { HapticName } from '@/lib/haptics';
import type { ColorToken } from '@/theme/generated/tokens';
import { timing } from '@/theme/motion';

// Figma "Swipe action": the swipe screen's buttons. Flat caps on the same 4-point lip as
// the main buttons. Pressed sinks onto the lip; lit glows while a card is dragged toward
// that button. Super shows the super likes left.

export type SwipeActionKind = 'nope' | 'undo' | 'super' | 'like' | 'seen';

type Look = {
  size: string;
  outer: string;
  cap: string;
  pressed: string;
  lit: string;
  lip: string;
  icon: IconName;
  iconSize: number;
  iconColor: ColorToken;
  filled?: boolean;
  stroke: number;
  tone: TextTone;
  haptic: HapticName;
};

const looks: Record<SwipeActionKind, Look> = {
  nope: {
    size: 'size-17',
    outer: 'h-18 w-17',
    cap: 'bg-nope-default',
    pressed: 'bg-nope-strong',
    lit: 'bg-nope-default glow-nope',
    lip: 'bg-nope-strong',
    icon: 'x',
    iconSize: 30,
    iconColor: 'text-inverse',
    stroke: 2.2,
    tone: 'nope',
    haptic: 'throw',
  },
  like: {
    size: 'size-17',
    outer: 'h-18 w-17',
    cap: 'bg-like-default',
    pressed: 'bg-like-strong',
    lit: 'bg-like-default glow-like',
    lip: 'bg-like-strong',
    icon: 'heart',
    iconSize: 30,
    iconColor: 'text-inverse',
    filled: true,
    stroke: 2.2,
    tone: 'like',
    haptic: 'throw',
  },
  super: {
    size: 'size-14',
    outer: 'h-15 w-14',
    cap: 'bg-marquee-default',
    pressed: 'bg-marquee-strong',
    lit: 'bg-marquee-default glow-marquee',
    lip: 'bg-marquee-strong',
    icon: 'star',
    iconSize: 26,
    iconColor: 'text-inverse',
    filled: true,
    stroke: 2,
    tone: 'marquee',
    haptic: 'throw',
  },
  undo: {
    size: 'size-12',
    outer: 'h-13 w-12',
    cap: 'border border-border-strong bg-border-default',
    pressed: 'border border-border-strong bg-bg-raised',
    lit: 'border border-accent-default bg-border-default glow-accent',
    lip: 'border border-border-default bg-bg-sunken',
    icon: 'undo',
    iconSize: 22,
    iconColor: 'text-secondary',
    stroke: 2.45,
    tone: 'muted',
    haptic: 'press',
  },
  seen: {
    size: 'size-12',
    outer: 'h-13 w-12',
    cap: 'border border-border-strong bg-border-default',
    pressed: 'border border-border-strong bg-bg-raised',
    lit: 'border border-accent-default bg-border-default glow-accent',
    lip: 'border border-border-default bg-bg-sunken',
    icon: 'eye',
    iconSize: 22,
    iconColor: 'text-secondary',
    stroke: 2.45,
    tone: 'muted',
    haptic: 'throw',
  },
};

export type SwipeActionProps = {
  kind: SwipeActionKind;
  onPress?: () => void;
  /** Glows: a card is being dragged toward this answer. */
  lit?: boolean;
  /** Super likes left, shown on the super button. */
  left?: number;
  /** Hides the label under the button. */
  hideLabel?: boolean;
  disabled?: boolean;
};

export function SwipeAction({
  kind,
  onPress,
  lit = false,
  left,
  hideLabel = false,
  disabled,
}: SwipeActionProps) {
  const { t } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const offset = useSharedValue(0);
  const capStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const look = looks[kind];
  const label = t(`answers.${kind}`);
  const glowing = lit && !pressed;

  return (
    <View className="items-center gap-2">
      <Pressable
        accessibilityLabel={label}
        haptic={look.haptic}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          setPressed(true);
          offset.set(withTiming(4, timing.press));
        }}
        onPressOut={() => {
          setPressed(false);
          offset.set(withTiming(0, timing.release));
        }}
        className={cn('relative', look.outer, disabled && 'opacity-disabled')}
      >
        <View className={cn('absolute top-1 left-0 rounded-pill', look.size, look.lip)} />
        <Animated.View
          style={capStyle}
          className={cn(
            'absolute top-0 left-0 items-center justify-center rounded-pill',
            look.size,
            pressed ? look.pressed : glowing ? look.lit : look.cap,
          )}
        >
          <Icon
            name={look.icon}
            size={look.iconSize}
            color={glowing && (kind === 'undo' || kind === 'seen') ? 'accent-text' : look.iconColor}
            filled={look.filled}
            strokeWidth={look.stroke}
          />
        </Animated.View>
        {kind === 'super' && left !== undefined ? (
          <View className="absolute -top-1.5 left-10 size-5.5 items-center justify-center rounded-pill stroke-badge border-marquee-default bg-bg-canvas">
            <Text variant="mono-eyebrow" tone="marquee">
              {left}
            </Text>
          </View>
        ) : null}
      </Pressable>
      {hideLabel ? null : (
        <Text
          variant="mono-eyebrow"
          tone={glowing && (kind === 'undo' || kind === 'seen') ? 'accent' : look.tone}
        >
          {label}
        </Text>
      )}
    </View>
  );
}
