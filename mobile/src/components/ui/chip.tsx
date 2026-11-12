import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';

export type ChipProps = {
  label: string;
  /** A small number after the label ("Comedy 3"): how many in the room picked it. */
  count?: number;
  /** What a screen reader says instead of the label, when the count needs words. */
  accessibilityLabel?: string;
  /** What a screen reader adds, e.g. what a press on a removable chip does. */
  accessibilityHint?: string;
  selected?: boolean;
  /** `accent` (the default) or `nope`: a selected `nope` chip is a skip (red fill, a ban icon). */
  tone?: 'accent' | 'nope';
  /**
   * A short marker ("out tonight"): the chip is shown as not available, dashed, with the marker
   * after the label. It ignores presses and is announced as disabled, but is not dimmed.
   */
  unavailable?: string;
  onPress?: () => void;
  /**
   * Draws a trailing `x` and makes the chip a button whose press calls this (a skipped person
   * that a tap takes off the list). `selected` still sets the look; `role` is ignored.
   */
  onRemove?: () => void;
  disabled?: boolean;
  /**
   * How a screen reader announces it: `checkbox` for filters that combine (the default), `radio`
   * for one choice among several. Put radios in a `View` with `accessibilityRole="radiogroup"`.
   */
  role?: 'checkbox' | 'radio';
  /** Wait this long (ms) before the press starts, for a chip in a list that scrolls. */
  pressDelay?: number;
};

/** Figma "Chip": a selectable filter (moods, time budget). A check appears when selected. */
export function Chip({
  label,
  count,
  accessibilityLabel,
  accessibilityHint,
  selected = false,
  tone = 'accent',
  unavailable,
  onPress,
  onRemove,
  disabled,
  role = 'checkbox',
  pressDelay,
}: ChipProps) {
  const skip = tone === 'nope' && selected;
  if (unavailable !== undefined) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole={role}
        accessibilityState={role === 'radio' ? { selected: false } : { checked: false }}
        disabled
        haptic={false}
        className="h-9 flex-row items-center gap-1.5 self-start rounded-pill border border-dashed border-border-strong bg-bg-canvas pr-3.5 pl-2.5"
      >
        <Icon name="ban" size={16} color="text-muted" />
        <Text variant="body-m-strong" tone="muted">
          {label}
        </Text>
        <Text variant="mono-data" tone="nope">
          {unavailable}
        </Text>
      </Pressable>
    );
  }
  const removable = onRemove !== undefined;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityRole={removable ? 'button' : role}
      accessibilityState={
        removable ? undefined : role === 'radio' ? { selected } : { checked: selected }
      }
      onPress={removable ? onRemove : onPress}
      disabled={disabled}
      unstable_pressDelay={pressDelay}
      className={cn(
        'h-9 flex-row items-center gap-1.5 self-start rounded-pill',
        skip
          ? 'border border-nope-default bg-nope-soft pr-3.5 pl-2.5'
          : selected
            ? 'bg-accent-default pr-3.5 pl-2.5'
            : 'border border-border-default bg-bg-raised px-3.5',
        disabled && 'opacity-disabled',
      )}
    >
      {skip ? <Icon name="ban" size={16} color="nope-text" /> : null}
      {selected && !skip ? <Icon name="check" size={16} color="text-on-accent" /> : null}
      <Text variant="body-m-strong" tone={selected && !skip ? 'on-accent' : 'primary'}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="mono-data" tone={selected && !skip ? 'on-accent' : 'secondary'}>
          {count}
        </Text>
      ) : null}
      {removable ? <Icon name="x" size={16} color="text-secondary" /> : null}
    </Pressable>
  );
}
