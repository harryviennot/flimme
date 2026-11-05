import type { MyFilmTile, MyFilmsFilter, MyFilmsSegment } from '@flimme/contract';
import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { FilmTile } from '@/components/shared/film-tile';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { badgeOf, emptyKind, GRID_COLUMNS, tileLabel, type GridState } from '@/features/my-films';
import { posterUrl } from '@/features/swipe/poster-url';
import { duration, layout } from '@/theme/motion';

// The grid of My films (my-films.md): three columns, the chips and the accounts line in the
// header (they scroll away with it), and every state of the list under it.

const FILTERS: readonly MyFilmsFilter[] = ['all', 'friends', 'solo'];
const SKELETON_TILES = 9;

export type FilmsGridProps = {
  segment: MyFilmsSegment;
  filter: MyFilmsFilter;
  onFilter: (filter: MyFilmsFilter) => void;
  films: readonly MyFilmTile[];
  state: GridState;
  online: boolean;
  /** Where posters come from (`app_config.tmdb_image_base`). */
  imageBase: string | undefined;
  tileWidth: number;
  windowWidth: number;
  fetchingMore: boolean;
  moreFailed: boolean;
  onEnd: () => void;
  onRetryMore: () => void;
  onRetry: () => void;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (titleId: number) => void;
  /** Only once Play alone exists: the empty Liked and Solo lines offer it. */
  onPlayAlone?: () => void;
  listRef: RefObject<FlatList<MyFilmTile> | null>;
};

function SkeletonTiles({ count, width, label }: { count: number; width: number; label?: string }) {
  return (
    <View
      className="flex-row flex-wrap gap-2"
      accessible={!!label}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width, height: width * 1.5 }}>
          <Skeleton className="flex-1" />
        </View>
      ))}
    </View>
  );
}

export function FilmsGrid(props: FilmsGridProps) {
  const {
    segment,
    filter,
    onFilter,
    films,
    state,
    online,
    imageBase,
    tileWidth,
    windowWidth,
    fetchingMore,
    moreFailed,
    onEnd,
    onRetryMore,
    onRetry,
    refreshing,
    onRefresh,
    onOpen,
    onPlayAlone,
    listRef,
  } = props;
  const { t } = useTranslation('myFilms');
  const { t: tc } = useTranslation();

  // Each segment and chip keeps its own scroll position. Scroll events between the render that
  // changes the list and the effect that restores its offset belong to the old list: dropped.
  const listKey = `${segment}:${segment === 'liked' ? filter : 'all'}`;
  const offsets = useRef(new Map<string, number>());
  const settledKey = useRef(listKey);
  useEffect(() => {
    settledKey.current = listKey;
    listRef.current?.scrollToOffset({ offset: offsets.current.get(listKey) ?? 0, animated: false });
  }, [listKey, listRef]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settledKey.current === listKey) offsets.current.set(listKey, e.nativeEvent.contentOffset.y);
  };
  const kind = emptyKind(segment, filter);
  const header = (
    <View className="gap-3 pt-4 pb-3">
      {state === 'ready' && !online ? <Banner tone="warn" message={t('offlineBanner')} /> : null}
      {segment === 'liked' ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('filters.label')}
          className="flex-row flex-wrap gap-2"
        >
          {FILTERS.map((key) => (
            <Chip
              key={key}
              role="radio"
              label={t(`filters.${key}`)}
              selected={filter === key}
              onPress={() => onFilter(key)}
            />
          ))}
        </View>
      ) : null}
      <Text variant="body-s" tone="muted">
        {t('accounts')}
      </Text>
    </View>
  );

  let empty: React.ReactElement | undefined;
  if (state === 'loading') {
    empty = <SkeletonTiles count={SKELETON_TILES} width={tileWidth} label={t('a11y.loading')} />;
  } else if (state === 'offline') {
    empty = <EmptyState icon="wifi-off" title={t('offline.title')} body={t('offline.body')} />;
  } else if (state === 'error') {
    empty = (
      <EmptyState
        icon="alert"
        error
        title={t('error.title')}
        action={{ label: tc('actions.retry'), onPress: onRetry }}
      />
    );
  } else if (state === 'empty') {
    const playAlone =
      onPlayAlone && (kind === 'liked' || kind === 'solo')
        ? { label: t('empty.playAlone'), onPress: onPlayAlone }
        : undefined;
    const icon = { liked: 'heart', friends: 'users', solo: 'user', seen: 'eye' } as const;
    empty = (
      <EmptyState
        icon={icon[kind]}
        title={t('empty.title')}
        body={t(`empty.${kind}`)}
        action={playAlone}
      />
    );
  }

  const footer = fetchingMore ? (
    <View className="pt-2">
      <SkeletonTiles count={GRID_COLUMNS} width={tileWidth} />
    </View>
  ) : moreFailed ? (
    <View className="items-center gap-1 pt-3">
      <Text variant="body-s" tone="muted" align="center">
        {t('error.more')}
      </Text>
      <Button label={tc('actions.retry')} variant="ghost" size="s" onPress={onRetryMore} />
    </View>
  ) : undefined;

  return (
    <FlatList
      ref={listRef}
      testID="films-grid"
      data={state === 'ready' ? films : []}
      keyExtractor={(film) => String(film.title_id)}
      numColumns={GRID_COLUMNS}
      columnWrapperClassName="gap-2"
      ItemSeparatorComponent={RowGap}
      contentContainerClassName="px-4 pb-6"
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={onEnd}
      onEndReachedThreshold={0.5}
      refreshing={refreshing}
      onRefresh={onRefresh}
      renderItem={({ item }) => {
        const badge = badgeOf(segment, item);
        const url = posterUrl(imageBase, item.poster_path, windowWidth);
        return (
          <Animated.View exiting={layout.fadeOut} layout={LinearTransition.duration(duration.base)}>
            <FilmTile
              width={tileWidth}
              title={item.title}
              year={item.year}
              poster={url ? { uri: url } : null}
              badge={
                badge === 'picked'
                  ? { kind: 'picked', label: t('tile.picked') }
                  : badge === 'super'
                    ? { kind: 'super' }
                    : undefined
              }
              accessibilityLabel={tileLabel(segment, item, (key, options) =>
                t(key as never, options),
              )}
              accessibilityHint={t('a11y.tileHint')}
              onPress={() => onOpen(item.title_id)}
            />
          </Animated.View>
        );
      }}
    />
  );
}

function RowGap() {
  return <View className="h-2" />;
}
