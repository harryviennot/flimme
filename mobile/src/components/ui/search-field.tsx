import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable as FieldPressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { cn } from '@/lib/cn';
import { tokens } from '@/theme/generated/tokens';

import { Icon } from './icon';
import { IconButton } from './icon-button';

export type SearchFieldProps = Omit<
  TextInputProps,
  'style' | 'className' | 'placeholderTextColor' | 'accessibilityLabel'
> & {
  /** What a screen reader says for the field. There is no visible label. */
  accessibilityLabel: string;
  /** A search is on its way: the leading icon becomes a spinner. */
  busy?: boolean;
};

/**
 * A one-line search box: `Input`'s surface and focus look without the label. The clear button
 * shows only with text, empties the field and keeps focus.
 */
export function SearchField({
  accessibilityLabel,
  busy = false,
  value,
  onChangeText,
  onFocus,
  onBlur,
  autoFocus,
  ...props
}: SearchFieldProps) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);
  const hasText = (value ?? '').length > 0;
  return (
    <View
      accessibilityRole="search"
      className={cn(
        'h-12 flex-row items-center gap-2 rounded-md bg-bg-raised',
        // 1 point of idle border against 2 focused: the padding makes up, so the text stays put.
        focused
          ? 'border-2 border-accent-default pr-0.75 pl-3 glow-accent'
          : 'border border-border-control pr-1 pl-3.25',
      )}
    >
      <FieldPressable
        accessible={false}
        onPress={() => field.current?.focus()}
        className="flex-1 flex-row items-center gap-2"
      >
        <View className="size-5 items-center justify-center">
          {busy ? (
            <ActivityIndicator
              testID="search-busy"
              size="small"
              color={tokens.color['text-muted']}
            />
          ) : (
            <Icon name="search" size={20} color="text-muted" />
          )}
        </View>
        <TextInput
          {...props}
          ref={field}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ busy }}
          maxFontSizeMultiplier={1.5}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          className="min-w-0 flex-1 type-input text-text-primary"
          placeholderTextColorClassName="accent-text-muted"
          cursorColorClassName="accent-accent-default"
          selectionColorClassName="accent-accent-default"
        />
      </FieldPressable>
      {hasText ? (
        <IconButton
          icon="x"
          variant="plain"
          accessibilityLabel={t('actions.clear')}
          onPress={() => {
            onChangeText?.('');
            field.current?.focus();
          }}
        />
      ) : null}
    </View>
  );
}
