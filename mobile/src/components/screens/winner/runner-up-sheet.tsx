import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside a formSheet (see the film sheet).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

import { MovieCard } from '@/components/shared/movie-card';
import { WhereToWatch } from '@/components/shared/where-to-watch';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useMatchCard } from '@/features/match/use-match-card';
import { sheetCardProps } from '@/features/my-films';
import { useOnline } from '@/features/network';
import { serviceLogos, servicesLabel } from '@/features/winner/services';
import { useRunnersUp } from '@/features/winner/use-runners-up';

export type RunnerUpSheetProps = { roomId: string; titleId: number; onClose: () => void };

/**
 * A runner-up's card back and where to watch it (winner.md#the-runner-up-sheet). No likers, no
 * counts and no way to pick it instead: the group's pick stays the pick.
 */
export function RunnerUpSheet({ roomId, titleId, onClose }: RunnerUpSheetProps) {
  const { t, i18n } = useTranslation('winner');
  const { t: tc } = useTranslation();
  const { t: ts } = useTranslation('swipe');
  const online = useOnline();
  const window = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const { card, failed, retry } = useMatchCard(roomId, titleId, i18n.language);
  const { ids, answered } = useRunnersUp(roomId, i18n.language);

  // The film isn't one of the room's runners-up (or the room isn't done): nothing to show.
  const unlisted = answered && !ids.includes(titleId);
  useEffect(() => {
    if (unlisted) onClose();
  }, [unlisted, onClose]);

  const body = card ? (
    <>
      <MovieCard
        {...sheetCardProps(card, {
          language: i18n.language,
          imageBase,
          screenWidth: window.width,
          noSynopsis: ts('card.noSynopsis'),
        })}
        flipped
      />
      <WhereToWatch
        services={serviceLogos(card.providers, imageBase)}
        watchLink={card.watch_link}
        servicesLabel={servicesLabel(serviceLogos(card.providers, imageBase), i18n.language)}
        notListed={t('notListed')}
        isGroupWinner={false}
      />
    </>
  ) : failed ? (
    <View className="items-center gap-3 pt-2">
      <Text variant="body-m" tone="secondary" align="center">
        {online ? t('error.title') : t('error.offline')}
      </Text>
      {online ? (
        <Button label={tc('actions.retry')} variant="secondary" size="s" onPress={retry} />
      ) : null}
    </View>
  ) : (
    <View
      className="gap-4"
      accessible
      accessibilityLabel={t('a11y.loading')}
      testID="runner-up-sheet-loading"
    >
      <View className="w-full" style={{ aspectRatio: 345 / 518 }}>
        <Skeleton className="flex-1 rounded-xl" />
      </View>
    </View>
  );

  return (
    <GestureHandlerRootView className="flex-1 bg-bg-canvas">
      <ScrollView className="flex-1" contentContainerClassName="grow">
        <View className="flex-1 gap-4 px-5 pt-5 pb-8">
          <View className="items-end">
            <IconButton
              icon="x"
              variant="plain"
              accessibilityLabel={tc('actions.close')}
              onPress={onClose}
            />
          </View>
          {body}
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
