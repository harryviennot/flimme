import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { layout } from '@/theme/motion';

// "Watch it again tonight?" (swipe.md#seen-it-the-rewatch-question): it takes the buttons row's
// place while a Seen it waits for its answer. Yes is a like, No a nope; anything else closes it
// with no vote (the screen decides, this only draws the two answers).

export type SeenQuestionProps = {
  /** The question shows (a Seen it waits for its answer). */
  open: boolean;
  onYes: () => void;
  onNo: () => void;
  /** A screen reader's escape gesture: close with no vote. */
  onEscape: () => void;
};

export function SeenQuestion({ open, onYes, onNo, onEscape }: SeenQuestionProps) {
  const { t } = useTranslation('swipe');

  // A screen reader hears the question when it opens.
  useEffect(() => {
    if (open) AccessibilityInfo.announceForAccessibility(t('seenQuestion.title'));
  }, [open, t]);

  if (!open) return null;
  return (
    <Animated.View
      entering={layout.fadeIn}
      exiting={layout.fadeOut}
      testID="seen-question"
      className="absolute inset-x-0 bottom-0 gap-3 px-5 pb-2"
      onAccessibilityEscape={onEscape}
    >
      <View accessible accessibilityRole="header">
        <Text variant="title-m" className="text-center">
          {t('seenQuestion.title')}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            variant="secondary"
            size="l"
            icon="x"
            label={t('seenQuestion.no')}
            accessibilityLabel={t('a11y.seenNo')}
            onPress={onNo}
          />
        </View>
        <View className="flex-1">
          <Button
            variant="primary"
            size="l"
            icon="heart"
            label={t('seenQuestion.yes')}
            accessibilityLabel={t('a11y.seenYes')}
            onPress={onYes}
          />
        </View>
      </View>
    </Animated.View>
  );
}
