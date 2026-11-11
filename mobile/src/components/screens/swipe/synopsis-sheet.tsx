import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside a formSheet (see the film sheet).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardMetaLine } from '@/components/shared/movie-card';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { backMeta, formatScore } from '@/features/swipe/card-props';
import { useSynopsisCard } from '@/features/swipe/synopsis';

export type SynopsisSheetProps = { titleId: number; onClose: () => void };

/**
 * The whole synopsis of the card on top (swipe.md#the-synopsis-sheet): the title, the back's
 * meta line and the overview in a larger size. It reads the card already on the phone, so it
 * opens offline; a card that is gone closes the sheet. No Trailer, no services, no answers.
 */
export function SynopsisSheet({ titleId, onClose }: SynopsisSheetProps) {
  const { t, i18n } = useTranslation('common');
  const { t: ts } = useTranslation('swipe');
  const insets = useSafeAreaInsets();
  const card = useSynopsisCard(titleId);

  useEffect(() => {
    if (!card) onClose();
  }, [card, onClose]);

  if (!card) return null;
  const language = i18n.language;
  return (
    <GestureHandlerRootView className="flex-1 bg-bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <Text variant="title-m" accessibilityRole="header">
              {card.title}
            </Text>
          </View>
          <IconButton
            icon="x"
            variant="plain"
            accessibilityLabel={t('actions.close')}
            onPress={onClose}
          />
        </View>
        <CardMetaLine
          meta={backMeta(card, language)}
          score={card.tmdb_score !== null ? formatScore(card.tmdb_score, language) : undefined}
        />
        <Text variant="mono-eyebrow" tone="secondary">
          {t('card.synopsis')}
        </Text>
        <Text variant="body-m">{card.overview ?? ts('card.noSynopsis')}</Text>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
