import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
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
  /** Content padding: the standard 20-point gutter, or none for full-bleed screens. */
  padded?: boolean;
};

/** Every screen's frame: the canvas, safe areas, an optional header and footer. */
export function Screen({ children, header, footer, scroll = false, padded = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const content = <View className={cn('flex-1', padded && 'px-5')}>{children}</View>;
  return (
    <View className="flex-1 bg-bg-canvas" style={{ paddingTop: insets.top }}>
      {header}
      {scroll ? (
        <ScrollView contentContainerClassName="grow" keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
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
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
    </View>
  );
}
