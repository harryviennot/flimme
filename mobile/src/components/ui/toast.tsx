import { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';
import type { ColorToken } from '@/theme/generated/tokens';
import { layout } from '@/theme/motion';

import { Icon, type IconName } from './icon';
import { Text } from './text';

// Figma "Toast": a live room event ("Sam joined"), the near miss ("2 of 3 liked this"),
// or a warning ("Reconnecting"). showToast() from anywhere; ToastHost in the root layout.

export type ToastTone = 'info' | 'like' | 'warn';

const tones: Record<ToastTone, { border: string; icon: IconName; color: ColorToken }> = {
  info: { border: 'border-accent-text', icon: 'info', color: 'accent-text' },
  like: { border: 'border-like-default', icon: 'heart', color: 'like-default' },
  warn: { border: 'border-marquee-default', icon: 'wifi-off', color: 'marquee-default' },
};

export type ToastProps = { title: string; message?: string; tone?: ToastTone };

export function Toast({ title, message, tone = 'info' }: ToastProps) {
  const look = tones[tone];
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'flex-row items-center gap-3 self-stretch rounded-md border bg-bg-raised py-3 pr-4 pl-3.5 elevation-card',
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
    </View>
  );
}

// A tiny store: one toast at a time, newest wins.
type Shown = ToastProps & { id: number; durationMs: number };
let current: Shown | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function showToast(toast: ToastProps & { durationMs?: number }) {
  current = { durationMs: 3000, ...toast, id: nextId++ };
  emit();
}

export function hideToast() {
  current = null;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Renders the current toast under the status bar. Mounted once, in the root layout. */
export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => current);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      if (current?.id === toast.id) hideToast();
    }, toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <View pointerEvents="box-none" className="absolute inset-x-5" style={{ top: insets.top + 8 }}>
      <Animated.View key={toast.id} entering={layout.toastIn} exiting={layout.toastOut}>
        <Toast title={toast.title} message={toast.message} tone={toast.tone} />
      </Animated.View>
    </View>
  );
}
