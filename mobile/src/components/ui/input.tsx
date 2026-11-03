import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable as FieldPressable, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

export type InputProps = Omit<TextInputProps, 'style' | 'className' | 'placeholderTextColor'> & {
  label: string;
  /** Shown under the field; replaced by the error when there is one. */
  helper?: string;
  error?: string;
};

/** Figma "Input": a labelled text field (names). Focused glows; an error turns it red. */
export function Input({ label, helper, error, onFocus, onBlur, autoFocus, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  // Focus on open, and again if the caller turns it on later (a screen reader check that
  // answers after the first frame). Not the TextInput's own autoFocus, which only runs once.
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);
  return (
    <View className="gap-2 self-stretch">
      <Text variant="mono-eyebrow" tone="secondary">
        {label}
      </Text>
      {/* The whole 56-point field focuses the input, not only the text. */}
      <FieldPressable
        testID="input-field"
        accessible={false}
        onPress={() => field.current?.focus()}
        className={cn(
          'h-14 flex-row items-center rounded-md bg-bg-raised',
          // The idle border is 1 point and the others 2: the idle side padding is 1 point
          // wider, so the value never moves sideways when focus or an error shows.
          error
            ? 'border-2 border-nope-default px-4'
            : focused
              ? 'border-2 border-accent-default px-4 glow-accent'
              : 'border border-border-control px-4.25',
        )}
      >
        <TextInput
          {...props}
          ref={field}
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className="flex-1 type-input text-text-primary"
          placeholderTextColorClassName="accent-text-muted"
          cursorColorClassName="accent-accent-default"
          selectionColorClassName="accent-accent-default"
        />
      </FieldPressable>
      {error || helper ? (
        <Text variant="body-s" tone={error ? 'nope' : 'muted'}>
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
}
