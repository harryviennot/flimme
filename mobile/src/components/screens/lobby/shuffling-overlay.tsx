import { useEffect, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Spotlight } from '@/components/ui/gradients';
import { MarqueeBulbs } from '@/components/ui/marquee-bulbs';
import { Text } from '@/components/ui/text';
import { layout } from '@/theme/motion';

export type ShufflingOverlayProps = {
  /** Past 20 seconds: the "taking longer" line. */
  slow: boolean;
  /** The host's Retry; guests get no button. */
  onRetry?: () => void;
};

/** "Shuffling the deck…" over the lobby while the room is dealing (lobby.md#starting). */
export function ShufflingOverlay({ slow, onRetry }: ShufflingOverlayProps) {
  const { t } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const title = useRef<ComponentRef<typeof View>>(null);

  // The overlay takes screen reader focus and reads its title.
  useEffect(() => {
    const node = title.current ? findNodeHandle(title.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  return (
    <Animated.View
      entering={layout.fadeIn}
      exiting={layout.fadeOut}
      accessibilityViewIsModal
      className="absolute inset-0 items-center justify-center gap-6 bg-overlay-card px-5"
    >
      <Spotlight tone="marquee" />
      <View ref={title} accessible accessibilityRole="header">
        <Text variant="display-m" align="center">
          {t('shuffling')}
        </Text>
      </View>
      <MarqueeBulbs count={12} />
      {slow ? (
        <View className="items-center gap-3">
          <Text variant="body-m" tone="secondary" align="center">
            {t('shufflingSlow')}
          </Text>
          {onRetry ? (
            <Button label={tc('actions.retry')} variant="secondary" size="s" onPress={onRetry} />
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}
