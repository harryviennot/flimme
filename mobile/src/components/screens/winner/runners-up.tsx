import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PosterThumb } from '@/components/shared/poster';
import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { posterUrl } from '@/features/swipe/poster-url';
import {
  MAX_FACES,
  runnerUpDetail,
  type RunnerUpItem,
  type RunnersUpData,
} from '@/features/winner/runners-up';
import { useRunnersUp } from '@/features/winner/use-runners-up';
import { layout } from '@/theme/motion';

// The other finalists, or the most liked films (winner.md#the-runners-up), below the pick's block.
// Party names only who liked each film; Blind says how many. Nothing here comes from anywhere but
// the read: no total, no nope, no rank. Loading, empty, failed and offline all show nothing.

// A runner-up's poster at the size of a 72 point thumb on a 3x screen.
const THUMB_WIDTH = 216;

function RunnerUp({
  item,
  language,
  imageBase,
  onPress,
}: {
  item: RunnerUpItem;
  language: string;
  imageBase: string | undefined;
  onPress: () => void;
}) {
  const { t } = useTranslation('winner');
  const { card } = item;
  const detail = runnerUpDetail(item, language);
  const detailText =
    detail === null
      ? null
      : detail.kind === 'likedBy'
        ? t('a11y.likedBy', { names: detail.names })
        : t('runnersUp.likes', { count: detail.count });
  const url = posterUrl(imageBase, card.poster_path, THUMB_WIDTH);
  return (
    <Pressable
      accessibilityLabel={
        detailText
          ? t('a11y.runnerUp', { title: card.title, detail: detailText })
          : t('a11y.runnerUpTitle', { title: card.title })
      }
      accessibilityHint={t('a11y.runnerUpHint')}
      onPress={onPress}
      className="w-24 items-center gap-1.5"
      testID={`runner-up-${card.title_id}`}
    >
      {url ? (
        <PosterThumb
          size="m"
          source={{ uri: url }}
          thumbhash={card.poster_placeholder ?? undefined}
        />
      ) : (
        <View className="h-27 w-18 items-center justify-center rounded-sm bg-bg-raised">
          <Icon name="film" size={24} color="text-muted" />
        </View>
      )}
      <Text variant="body-s" align="center" numberOfLines={2}>
        {card.title}
      </Text>
      {item.likers ? (
        <>
          <View
            className="flex-row"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {item.likers.slice(0, MAX_FACES).map((liker, index) => (
              <Avatar
                key={liker.memberId}
                name={liker.name}
                color={liker.color}
                size="s"
                overlap={index > 0}
              />
            ))}
          </View>
          <Text variant="body-s" tone="secondary" align="center" numberOfLines={2}>
            {detail?.kind === 'likedBy' ? detail.names : ''}
          </Text>
        </>
      ) : item.likes !== null ? (
        <Text variant="mono-data" tone="secondary" align="center">
          {t('runnersUp.likes', { count: item.likes })}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function RunnersUpList({
  data,
  language,
  imageBase,
  onOpen,
}: {
  data: RunnersUpData;
  language: string;
  imageBase: string | undefined;
  onOpen: (titleId: number) => void;
}) {
  const { t } = useTranslation('winner');
  return (
    <Animated.View entering={layout.fadeIn} className="gap-3 self-stretch pt-4" testID="runners-up">
      <View className="mt-4 h-px self-stretch bg-border-default" />
      <Text variant="mono-eyebrow" tone="secondary" accessibilityRole="header">
        {data.source === 'finalists' ? t('runnersUp.finalists') : t('runnersUp.mostLiked')}
      </Text>
      <Text variant="body-s" tone="muted">
        {t('runnersUp.hint')}
      </Text>
      <View className="flex-row flex-wrap justify-center gap-3">
        {data.items.map((item) => (
          <RunnerUp
            key={item.card.title_id}
            item={item}
            language={language}
            imageBase={imageBase}
            onPress={() => onOpen(item.card.title_id)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

/** The section: nothing until the read and its cards are in, and nothing when they fail. */
export function RunnersUp({
  roomId,
  language,
  onOpen,
}: {
  roomId: string;
  language: string;
  onOpen: (titleId: number) => void;
}) {
  const { data } = useRunnersUp(roomId, language);
  const imageBase = useAppConfig().data?.tmdb_image_base;
  if (!data) return null;
  return <RunnersUpList data={data} language={language} imageBase={imageBase} onOpen={onOpen} />;
}
