import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

export type PinBoxProps = {
  /** The digit, once typed. */
  digit?: string;
  /** The box the next digit goes into. */
  active?: boolean;
  /** The code was refused: a red border until the next keystroke. */
  error?: boolean;
};

/** Figma "PIN box": one digit of a room code. Empty shows a dash, active a caret. */
export function PinBox({ digit, active = false, error = false }: PinBoxProps) {
  const filled = !!digit;
  return (
    <View
      className={cn(
        'h-15 w-12 items-center justify-center rounded-md bg-bg-sunken',
        error
          ? 'border-2 border-nope-default'
          : filled
            ? 'border border-border-strong'
            : active
              ? 'border-2 border-accent-default glow-focus'
              : 'border border-border-control',
      )}
    >
      {filled ? (
        <Text variant="display-m">{digit}</Text>
      ) : active ? (
        <View className="h-7.5 w-0.5 bg-accent-default" />
      ) : (
        <View className="h-0.5 w-3 bg-text-muted" />
      )}
    </View>
  );
}
