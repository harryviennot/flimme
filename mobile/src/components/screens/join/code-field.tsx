import { useEffect, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
// The hidden input that owns the value is the one accessible element (join-code.md#layout).
// eslint-disable-next-line no-restricted-imports
import { AccessibilityInfo, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PinBox } from '@/components/ui/pin-box';
import { CODE_LENGTH } from '@/features/join/link';
import { tokens } from '@/theme/generated/tokens';
import { duration, timing } from '@/theme/motion';

export type CodeFieldProps = {
  /** The digits typed so far (the screen owns them). */
  code: string;
  onChangeCode: (text: string) => void;
  /** The code was refused: red boxes until the next keystroke. */
  error?: boolean;
  /** Plays the wrong-code shake, then calls `onShakeEnd`. */
  shaking?: boolean;
  onShakeEnd?: () => void;
};

const STEP = tokens.space['8'];
const SHAKE_MS = duration.instant * 4;

/**
 * Six boxes over a hidden number-pad input that owns the value. The input is the one
 * accessible element (join-code.md#accessibility); the boxes are only drawn.
 */
export function CodeField({
  code,
  onChangeCode,
  error = false,
  shaking = false,
  onShakeEnd,
}: CodeFieldProps) {
  const { t } = useTranslation('join');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  // Focused on open, unless a screen reader is on, so the title is read first.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => alive && !on && input.current?.focus())
      .catch(() => alive && input.current?.focus());
    return () => {
      alive = false;
    };
  }, []);

  // The shake: 8 points left, right, left and back, 80 ms each. Reduce Motion skips it.
  useEffect(() => {
    if (!shaking) return;
    if (reduceMotion) {
      onShakeEnd?.();
      return;
    }
    offset.set(
      withSequence(
        withTiming(-STEP, timing.toggle),
        withTiming(STEP, timing.toggle),
        withTiming(-STEP, timing.toggle),
        withTiming(0, timing.toggle),
      ),
    );
    const done = setTimeout(() => onShakeEnd?.(), SHAKE_MS);
    return () => clearTimeout(done);
  }, [shaking, reduceMotion, offset, onShakeEnd]);

  // After the digits clear, the caret goes back to the first box.
  const previous = useRef(code);
  useEffect(() => {
    if (code === '' && previous.current !== '') input.current?.focus();
    previous.current = code;
  }, [code]);

  return (
    <View>
      <Animated.View
        style={rowStyle}
        className="flex-row gap-2"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <PinBox key={i} digit={code[i]} active={i === code.length} error={error} />
        ))}
      </Animated.View>
      <TextInput
        ref={input}
        value={code}
        onChangeText={onChangeCode}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoComplete="off"
        autoCorrect={false}
        caretHidden
        textContentType="none"
        accessibilityLabel={t('a11y.field')}
        accessibilityValue={{
          text: t('a11y.progress', { digits: code.split('').join(' '), count: code.length }),
        }}
        className="absolute inset-0 opacity-0"
      />
    </View>
  );
}
