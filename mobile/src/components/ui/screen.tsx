import type { ReactNode } from 'react';
import { ScrollView as NativeScrollView, View } from 'react-native';
import {
  GestureHandlerRootView,
  ScrollView as SheetScrollView,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

export type ScreenProps = {
  children: ReactNode;
  /** A top bar, pinned above the content. */
  header?: ReactNode;
  /** A footer (usually the main button), pinned above the home indicator. */
  footer?: ReactNode;
  /** Scrolls when the content is taller than the screen. */
  scroll?: boolean;
  /**
   * The screen is a form sheet. React Native's ScrollView paints nothing in an iOS form sheet, so
   * a sheet that scrolls uses Gesture Handler's, under its own root view (a native sheet is its own tree).
   */
  sheet?: boolean;
  /** Reserve the home indicator space at the bottom. Off under the tab bar, which does it. */
  insetBottom?: boolean;
  /** Content padding: the standard 20-point gutter, or none for full-bleed screens. */
  padded?: boolean;
};

/** Every screen's frame: the canvas, safe areas, an optional header and footer. */
export function Screen({
  children,
  header,
  footer,
  scroll = false,
  sheet = false,
  padded = true,
  insetBottom = true,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const content = <View className={cn('flex-1', padded && 'px-5')}>{children}</View>;
  return (
    <View className="flex-1 bg-bg-canvas" style={{ paddingTop: insets.top }}>
      {header}
      {scroll && sheet ? (
        <GestureHandlerRootView className="flex-1">
          <SheetScrollView contentContainerClassName="grow" keyboardShouldPersistTaps="handled">
            {content}
          </SheetScrollView>
        </GestureHandlerRootView>
      ) : scroll ? (
        <NativeScrollView contentContainerClassName="grow" keyboardShouldPersistTaps="handled">
          {content}
        </NativeScrollView>
      ) : (
        content
      )}
      {footer ? (
        <View
          className={cn(padded && 'px-5', 'pt-3')}
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {footer}
        </View>
      ) : insetBottom ? (
        <View style={{ height: insets.bottom }} />
      ) : null}
    </View>
  );
}
