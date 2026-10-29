import { cn } from '@/lib/cn';
import type { ColorToken } from '@/theme/generated/tokens';

import { Icon, type IconName } from './icon';
import { Pressable } from './pressable';

export type IconButtonProps = {
  icon: IconName;
  /** What a screen reader says: "Back", "Settings", "Share". */
  accessibilityLabel: string;
  onPress?: () => void;
  /** Filled sits on a raised disc; plain is the icon alone. */
  variant?: 'filled' | 'plain';
  color?: ColorToken;
  disabled?: boolean;
};

/** Figma "Icon button": round, 40 points, a 20-point icon. Back, settings, share. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'filled',
  color = 'text-primary',
  disabled,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'size-10 items-center justify-center rounded-pill active:opacity-70',
        variant === 'filled' && 'border border-border-default bg-bg-raised',
        disabled && 'opacity-disabled',
      )}
    >
      <Icon name={icon} size={20} color={color} />
    </Pressable>
  );
}
