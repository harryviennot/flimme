import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * How a screen reader announces it: `checkbox` for filters that combine (the default), `radio`
   * for one choice among several. Put radios in a `View` with `accessibilityRole="radiogroup"`.
   */
  role?: 'checkbox' | 'radio';
};

/** Figma "Chip": a selectable filter (moods, time budget). A check appears when selected. */
export function Chip({ label, selected = false, onPress, disabled, role = 'checkbox' }: ChipProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'h-9 flex-row items-center self-start rounded-pill',
        selected
          ? 'gap-1.5 bg-accent-default pr-3.5 pl-2.5'
          : 'border border-border-default bg-bg-raised px-3.5',
        disabled && 'opacity-disabled',
      )}
    >
      {selected ? <Icon name="check" size={16} color="text-on-accent" /> : null}
      <Text variant="body-m-strong" tone={selected ? 'on-accent' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}
