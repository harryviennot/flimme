import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';
import type { ColorToken } from '@/theme/generated/tokens';
import { layout } from '@/theme/motion';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

// Figma "Toast": a live room event ("Sam joined"), the near miss ("2 of 3 liked this"),
// or a warning ("Reconnecting"). showToast() from anywhere; ToastHost in the root layout.

export type ToastTone = 'info' | 'like' | 'success' | 'warn';

const tones: Record<ToastTone, { border: string; icon: IconName; color: ColorToken }> = {
  info: { border: 'border-accent-text', icon: 'info', color: 'accent-text' },
  like: { border: 'border-like-default', icon: 'heart', color: 'like-default' },
  success: { border: 'border-like-default', icon: 'check', color: 'like-default' },
  warn: { border: 'border-marquee-default', icon: 'wifi-off', color: 'marquee-default' },
};

export type ToastAction = { label: string; onPress: () => void };

export type ToastProps = {
  title: string;
  message?: string;
  tone?: ToastTone;
  /** One ghost button at the right ("Undo"). Pressing it closes the toast. */
  action?: ToastAction;
};

export function Toast({ title, message, tone = 'info', action }: ToastProps) {
  const look = tones[tone];
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'flex-row items-center gap-3 self-stretch rounded-md border bg-bg-raised py-3 pl-3.5 elevation-card',
        action ? 'pr-2' : 'pr-4',
        look.border,
      )}
    >
      <Icon name={look.icon} size={20} color={look.color} />
      <View className="flex-1">
        <Text variant="body-m-strong">{title}</Text>
        {message ? (
          <Text variant="body-s" tone="secondary">
            {message}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Button label={action.label} variant="ghost" size="s" onPress={action.onPress} />
      ) : null}
    </View>
  );
}

// A tiny store: one toast at a time, newest wins.
type ToastOptions = {
  /** How long it stays, in milliseconds (3000 by default). */
  duration?: number;
  /** Called when the toast goes away without its action being pressed: it timed out, was hidden
   * or was replaced by a newer one. A caller that waits for the toast to close (Remove with Undo)
   * sends its call here. */
  onDismiss?: () => void;
};
type Shown = ToastProps & ToastOptions & { id: number };
let current: Shown | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function close(acted: boolean) {
  const previous = current;
  current = null;
  emit();
  if (!acted) previous?.onDismiss?.();
}

export function showToast(toast: ToastProps & ToastOptions) {
  if (current) close(false);
  current = { ...toast, id: nextId++ };
  emit();
}

export function hideToast() {
  if (current) close(false);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const DEFAULT_DURATION = 3000;
/** With a screen reader on, a toast that has an action stays long enough to be reached. */
const SCREEN_READER_MIN = 10_000;

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => live && setOn(enabled))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return on;
}

/** Renders the current toast under the status bar. Mounted once, in the root layout. */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReader();

  useEffect(() => {
    if (!toast) return;
    const base = toast.duration ?? DEFAULT_DURATION;
    const ms = screenReader && toast.action ? Math.max(base, SCREEN_READER_MIN) : base;
    const timer = setTimeout(() => {
      if (current?.id === toast.id) close(false);
    }, ms);
    return () => clearTimeout(timer);
  }, [toast, screenReader]);

  if (!toast) return null;
  const { action } = toast;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-5" style={{ top: insets.top + 8 }}>
      <Animated.View key={toast.id} entering={layout.toastIn} exiting={layout.toastOut}>
        <Toast
          title={toast.title}
          message={toast.message}
          tone={toast.tone}
          action={
            action
              ? {
                  label: action.label,
                  onPress: () => {
                    if (current?.id !== toast.id) return;
                    close(true);
                    action.onPress();
                  },
                }
              : undefined
          }
        />
      </Animated.View>
    </View>
  );
}
