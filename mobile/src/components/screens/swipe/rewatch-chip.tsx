import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { layout } from '@/theme/motion';

// The rewatch chip (swipe.md#seen-it-the-rewatch-question): after a Seen it in a room that
// allows rewatches, it takes the hint line, centred and far from the Seen it button, and offers
// Yes. The answer was already sent as a plain `seen`; Yes turns it into a rewatch. The screen
// decides when it shows and leaves; this only draws the text, the button and the confirmation.

export type RewatchChipProps = {
  /** The offer shows (a Seen it was just sent). */
  open: boolean;
  /** Yes was tapped: "Up for a rewatch" shows instead. */
  done: boolean;
  onYes: () => void;
};

export function RewatchChip({ open, done, onYes }: RewatchChipProps) {
  const { t } = useTranslation('swipe');

  // A screen reader hears the offer when it shows, and the confirmation after Yes.
  useEffect(() => {
    if (open) AccessibilityInfo.announceForAccessibility(t('rewatchChip.text'));
  }, [open, t]);
  useEffect(() => {
    if (done) AccessibilityInfo.announceForAccessibility(t('rewatchChip.done'));
  }, [done, t]);

  if (!open && !done) return null;
  return (
    <Animated.View
      key={done ? 'done' : 'ask'}
      entering={layout.fadeIn}
      exiting={layout.fadeOut}
      testID="rewatch-chip"
      className="absolute inset-0 items-center justify-center px-6"
    >
      {done ? (
        <Text variant="body-s" tone="like" className="text-center">
          {t('rewatchChip.done')}
        </Text>
      ) : (
        <View className="flex-row items-center justify-center gap-3">
          <Text variant="body-s" tone="secondary" className="shrink text-center">
            {t('rewatchChip.text')}
          </Text>
          <Button
            variant="primary"
            size="s"
            label={t('rewatchChip.yes')}
            accessibilityLabel={t('a11y.seenYes')}
            onPress={onYes}
            block={false}
          />
        </View>
      )}
    </Animated.View>
  );
}
