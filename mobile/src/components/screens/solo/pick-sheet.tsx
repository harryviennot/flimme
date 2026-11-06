import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, withSpring } from 'react-native-reanimated';

import { api } from '@/api';
import { Poster } from '@/components/shared/poster';
import { Banner } from '@/components/ui/banner';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Pressable } from '@/components/ui/pressable';
import { showToast } from '@/components/ui/toast';
import { Text } from '@/components/ui/text';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useOnline } from '@/features/network';
import { ROOM_KEY } from '@/features/room';
import { trackSoloPick } from '@/features/analytics/solo-events';
import { markJustPicked, pickFilm } from '@/features/solo/pick';
import { likesOf, soloSessionOf, useSoloEntries, type SessionEntry } from '@/features/solo/session';
import { voteQueue } from '@/features/swipe';
import { posterUrl } from '@/features/swipe/poster-url';
import { errorFeedback } from '@/lib/feedback';
import { layout, spring } from '@/theme/motion';

// The pick sheet (swipe.md#the-pick-sheet): this session's likes, super likes first and newest
// first, in three columns. A tap is tonight's pick: the tile lifts at once, the queued votes go,
// then `api.solo_pick`. The room turning `done` brings the solo pick screen (the room layout).

function Tile({
  entry,
  lifted,
  disabled,
  imageBase,
  screenWidth,
  onPress,
}: {
  entry: SessionEntry;
  lifted: boolean;
  disabled: boolean;
  imageBase: string | undefined;
  screenWidth: number;
  onPress: () => void;
}) {
  const { t } = useTranslation('solo');
  const { card } = entry;
  const uri = posterUrl(imageBase, card.poster_path, screenWidth);
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : withSpring(lifted ? 1.05 : 1, spring.snappy) }],
  }));
  return (
    <Animated.View exiting={layout.fadeOut} style={style} className="flex-1 basis-0">
      <Pressable
        accessibilityLabel={card.year ? `${card.title}, ${card.year}` : card.title}
        accessibilityHint={t('pickSheet.a11yHint')}
        disabled={disabled}
        onPress={onPress}
        className={disabled && !lifted ? 'opacity-disabled' : ''}
      >
        <View
          style={{ aspectRatio: 2 / 3 }}
          className="items-center justify-center overflow-hidden rounded-sm bg-bg-raised"
        >
          {uri ? (
            <Poster source={{ uri }} thumbhash={card.poster_placeholder ?? undefined} />
          ) : (
            <View className="items-center gap-1 p-2">
              <Icon name="film" size={24} color="text-muted" />
              <Text variant="body-s" align="center" numberOfLines={3}>
                {card.title}
              </Text>
              {card.year ? (
                <Text variant="mono-data" tone="muted">
                  {card.year}
                </Text>
              ) : null}
            </View>
          )}
        </View>
        {entry.kind === 'super_like' ? (
          <View className="absolute top-1 right-1 size-6 items-center justify-center rounded-pill bg-bg-canvas">
            <Icon name="star" size={14} filled color="marquee-default" />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function PickSheet({ roomId }: { roomId: string }) {
  const { t } = useTranslation('solo');
  const { t: tc } = useTranslation();
  const online = useOnline();
  const client = useQueryClient();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const entries = useSoloEntries(roomId);
  const likes = likesOf(entries);
  const [pending, setPending] = useState<number | null>(null);
  const busy = useRef(false);

  const pick = async (titleId: number) => {
    if (busy.current) return;
    busy.current = true;
    setPending(titleId);
    const outcome = await pickFilm(roomId, titleId, {
      flush: () => voteQueue.flush(),
      waitingVotes: (id) => voteQueue.pending(id),
      soloPick: (args) => api.soloPick(args),
    });
    switch (outcome.kind) {
      case 'picked':
        // The room is `done` now: the layout closes this sheet and shows the pick. The tile stays lifted.
        markJustPicked(roomId);
        trackSoloPick(soloSessionOf(roomId).getState().entries.length);
        void client.invalidateQueries({ queryKey: ROOM_KEY(roomId) });
        return;
      case 'closed':
        void client.invalidateQueries({ queryKey: ROOM_KEY(roomId) });
        return;
      case 'not_liked':
        soloSessionOf(roomId).getState().undo(titleId);
        showToast({ tone: 'warn', title: t('pickSheet.notLiked') });
        break;
      case 'failed':
        showToast({ tone: 'warn', title: t('pickSheet.error') });
        errorFeedback();
        break;
    }
    busy.current = false;
    setPending(null);
  };

  const rows: SessionEntry[][] = [];
  for (let i = 0; i < likes.length; i += 3) rows.push(likes.slice(i, i + 3));

  return (
    // A form sheet's scroll view fills the sheet and covers anything beside it, so the header is
    // the first thing inside it.
    <GestureHandlerRootView className="flex-1">
      <ScrollView
        className="bg-bg-canvas"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      >
        <View className="gap-1 px-5 pt-6">
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="display-s" accessibilityRole="header" className="flex-1">
              {t('pickSheet.title')}
            </Text>
            <IconButton
              icon="x"
              variant="plain"
              accessibilityLabel={tc('actions.close')}
              onPress={() => router.back()}
            />
          </View>
          <Text variant="body-s" tone="muted">
            {t('pickSheet.helper')}
          </Text>
        </View>
        <View className="px-5">
          {online ? null : <Banner tone="warn" message={t('pickSheet.offline')} />}
          <View className="gap-2 pt-4 pb-4">
            {rows.map((row) => (
              <View key={row[0]!.card.title_id} className="flex-row gap-2">
                {row.map((entry) => (
                  <Tile
                    key={entry.card.title_id}
                    entry={entry}
                    lifted={pending === entry.card.title_id}
                    disabled={!online || pending !== null}
                    imageBase={imageBase}
                    screenWidth={width}
                    onPress={() => void pick(entry.card.title_id)}
                  />
                ))}
                {Array.from({ length: 3 - row.length }, (_, i) => (
                  <View key={`pad-${i}`} className="flex-1 basis-0" />
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
