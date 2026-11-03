import type { ComponentRef, Ref } from 'react';
import { TextInput, type KeyboardTypeOptions } from 'react-native';

export type HiddenInputHandle = ComponentRef<typeof TextInput>;

export type HiddenInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Read out by a screen reader; what the screen draws over it is hidden from it. */
  accessibilityLabel: string;
  /** What a screen reader says about the current value (for example the digits typed). */
  accessibilityValueText?: string;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  /** Call `ref.current?.focus()` to bring the keyboard up. */
  ref?: Ref<HiddenInputHandle>;
};

/**
 * An invisible input that owns a value and draws nothing: it fills its parent (which must be
 * `relative`) and sits over whatever the screen draws. The caret is hidden and autocomplete,
 * autocorrect and content hints are off. It is the one accessible element of what it covers.
 */
export function HiddenInput({
  value,
  onChangeText,
  accessibilityLabel,
  accessibilityValueText,
  maxLength,
  keyboardType = 'default',
  ref,
}: HiddenInputProps) {
  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoComplete="off"
      autoCorrect={false}
      caretHidden
      textContentType="none"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValueText ? { text: accessibilityValueText } : undefined}
      className="absolute inset-0 opacity-0"
    />
  );
}
