import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { tokens, type ColorToken } from '@/theme/generated/tokens';
import { timing } from '@/theme/motion';

import { Icon, type IconName } from './icon';
import { Pressable } from './pressable';
import { Text, type TextTone } from './text';

// The arcade button (Figma "Button"): a face on a hard 4-point lip. Pressing moves the
// face down 4 points over duration/fast and darkens it; releasing springs back with
// easing/arcade. Disabled has no lip.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'marquee';
export type ButtonSize = 'l' | 's';

const LIP = 4;

const looks: Record<
  ButtonVariant,
  {
    face: string;
    pressed: string;
    lip?: string;
    tone: TextTone;
    pressedTone?: TextTone;
    icon: ColorToken;
  }
> = {
  primary: {
    face: 'bg-accent-default',
    pressed: 'bg-accent-pressed',
    lip: 'bg-accent-pressed',
    tone: 'on-accent',
    icon: 'text-on-accent',
  },
  secondary: {
    face: 'bg-bg-raised border border-border-default',
    pressed: 'bg-bg-surface border border-border-strong',
    lip: 'bg-bg-sunken',
    tone: 'primary',
    icon: 'text-primary',
  },
  ghost: { face: '', pressed: 'bg-accent-soft', tone: 'accent', icon: 'accent-text' },
  danger: {
    face: 'bg-nope-default',
    pressed: 'bg-nope-strong',
    lip: 'bg-nope-strong',
    tone: 'inverse',
    pressedTone: 'on-accent',
    icon: 'text-inverse',
  },
  marquee: {
    face: 'bg-marquee-default',
    pressed: 'bg-marquee-strong',
    lip: 'bg-marquee-strong',
    tone: 'inverse',
    icon: 'text-inverse',
  },
};

const sizes = {
  l: { face: 'h-14 px-6 gap-2.5 rounded-md', lip: 'rounded-md', text: 'label-button-l', icon: 20 },
  s: { face: 'h-10 px-4 gap-2 rounded-sm', lip: 'rounded-sm', text: 'label-button-s', icon: 18 },
} as const;

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  disabled?: boolean;
  /** Shows a spinner and ignores presses. */
  loading?: boolean;
  /** Takes the full width of its container (the default for size L). */
  block?: boolean;
  /** Defaults to the label. */
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'l',
  icon,
  disabled = false,
  loading = false,
  block = size === 'l',
  accessibilityLabel,
}: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const offset = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  const look = looks[variant];
  const dims = sizes[size];
  const inactive = disabled || loading;
  const hasLip = !!look.lip && !disabled;
  const tone: TextTone = disabled
    ? 'disabled'
    : pressed && look.pressedTone
      ? look.pressedTone
      : look.tone;
  const faceClass = disabled
    ? variant === 'ghost'
      ? ''
      : 'bg-state-disabled'
    : pressed
      ? look.pressed
      : look.face;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading }}
      disabled={inactive}
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        if (hasLip) offset.set(withTiming(LIP, timing.press));
      }}
      onPressOut={() => {
        setPressed(false);
        if (hasLip) offset.set(withTiming(0, timing.release));
      }}
      className={cn('relative', block ? 'self-stretch' : 'self-start', hasLip && 'pb-1')}
    >
      {hasLip ? (
        <View className={cn('absolute inset-x-0 top-1 bottom-0', dims.lip, look.lip)} />
      ) : null}
      <Animated.View
        style={faceStyle}
        className={cn('flex-row items-center justify-center', dims.face, faceClass)}
      >
        {loading ? (
          <ActivityIndicator color={tokens.color[disabled ? 'text-disabled' : look.icon]} />
        ) : (
          <>
            {icon ? (
              <Icon name={icon} size={dims.icon} color={disabled ? 'text-disabled' : look.icon} />
            ) : null}
            <Text variant={dims.text} tone={tone} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
