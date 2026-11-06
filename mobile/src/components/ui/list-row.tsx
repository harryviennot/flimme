import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { cn } from '@/lib/cn';
import { tokens } from '@/theme/generated/tokens';

import { Icon, type IconName } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';

export type ListRowProps = {
  label: string;
  icon?: IconName;
  /** The current value, on the right ("English"). */
  value?: string;
  /** Something on the right instead of the value and chevron (a Toggle). */
  trailing?: ReactNode;
  /** Makes the row tappable and shows a chevron. */
  onPress?: () => void;
  /** `danger` is for the one destructive row: red icon and label, no chevron. */
  tone?: 'default' | 'danger';
  /** A spinner replaces the value and chevron, and presses are ignored. */
  loading?: boolean;
  /** Dimmed, and presses are ignored. */
  disabled?: boolean;
  /** What a screen reader adds, e.g. that the row opens the browser. */
  accessibilityHint?: string;
};

/** Figma "List row": a settings or profile row inside a grouped surface. */
export function ListRow({
  label,
  icon,
  value,
  trailing,
  onPress,
  tone = 'default',
  loading = false,
  disabled = false,
  accessibilityHint,
}: ListRowProps) {
  const danger = tone === 'danger';
  // A row with a control on the right (a Toggle) reads once, through the control: the label
  // is hidden from screen readers so it isn't announced twice.
  const hideLabel = trailing !== undefined;
  const content = (
    <>
      {icon ? <Icon name={icon} size={20} color={danger ? 'nope-text' : 'text-secondary'} /> : null}
      <Text
        variant="body-l"
        tone={danger ? 'nope' : 'primary'}
        className={value ? 'max-w-1/2 shrink-0' : 'flex-1'}
        numberOfLines={2}
        accessibilityElementsHidden={hideLabel}
        importantForAccessibility={hideLabel ? 'no-hide-descendants' : 'auto'}
      >
        {label}
      </Text>
      {trailing ??
        (loading ? (
          <ActivityIndicator color={tokens.color['text-muted']} />
        ) : (
          <>
            {value ? (
              <Text
                variant="body-m"
                tone="muted"
                numberOfLines={1}
                className="min-w-0 flex-1 text-right"
              >
                {value}
              </Text>
            ) : null}
            {onPress && !danger ? <Icon name="chevron-right" size={18} color="text-muted" /> : null}
          </>
        ))}
    </>
  );
  const row = cn(
    'min-h-14 flex-row items-center gap-3.5 border-b border-border-subtle px-4 py-3',
    disabled && 'opacity-disabled',
  );
  return onPress ? (
    <Pressable
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading, disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      haptic={loading ? false : 'press'}
      className={cn(row, 'active:bg-bg-raised')}
    >
      {content}
    </Pressable>
  ) : (
    <View className={row}>{content}</View>
  );
}
