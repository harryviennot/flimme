import type { MyFilmTile, MyFilmsFilter, MyFilmsSegment } from '@flimme/contract';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View, type FlatList } from 'react-native';

import { SegmentedControl } from '@/components/ui/segmented-control';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { trackMyFilmsGrid } from '@/features/analytics/solo-events';
import { useAppConfig } from '@/features/app-config/use-app-config';
import {
  gridState,
  mergePages,
  onScrollToTop,
  tileWidth,
  useFlushRemovalsInBackground,
  useHiddenFilms,
  useMyFilms,
} from '@/features/my-films';
import { useOnline } from '@/features/network';

import { FilmsGrid } from './films-grid';

export type MyFilmsScreenProps = {
  onOpenFilm: (titleId: number) => void;
  /** Opens Play alone, once that screen exists. */
  onPlayAlone?: () => void;
};

/** My films (my-films.md): the title, Liked and Seen, and the grid of the player's own films. */
export function MyFilmsScreen({ onOpenFilm, onPlayAlone }: MyFilmsScreenProps) {
  const { t, i18n } = useTranslation('myFilms');
  const online = useOnline();
  const window = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const [segment, setSegment] = useState<MyFilmsSegment>('liked');
  const [filter, setFilter] = useState<MyFilmsFilter>('all');
  const [pulling, setPulling] = useState(false);
  const list = useRef<FlatList<MyFilmTile> | null>(null);
  const hidden = useHiddenFilms();
  useFlushRemovalsInBackground();

  const query = useMyFilms(segment, filter, i18n.language);
  const { refetch } = query;

  // A film liked a minute ago shows when the tab comes back into view. The first focus is the
  // mount, which is already reading.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void refetch({ cancelRefetch: false });
      focused.current = true;
    }, [refetch]),
  );

  // The first page of each segment or chip, once per choice per visit.
  const tracked = useRef<string | null>(null);
  const firstPage = query.data?.pages[0];
  useEffect(() => {
    if (!firstPage) return;
    const key = `${segment}:${segment === 'liked' ? filter : 'none'}`;
    if (tracked.current === key) return;
    tracked.current = key;
    trackMyFilmsGrid({
      segment,
      filter,
      count: firstPage.films.length,
      hasMore: firstPage.next_cursor !== null,
    });
  }, [firstPage, segment, filter]);

  // The selected tab tapped again.
  useEffect(
    () => onScrollToTop(() => list.current?.scrollToOffset({ offset: 0, animated: true })),
    [],
  );

  const films = mergePages(query.data?.pages ?? []).filter((film) => !hidden.has(film.title_id));
  const state = gridState({
    status: query.status,
    fetchStatus: query.fetchStatus,
    films: films.length,
    online,
  });
  const moreFailed = query.isFetchNextPageError;

  return (
    <Screen insetBottom={false} padded={false}>
      <View className="gap-4 px-5 pt-3">
        <Text variant="display-m" accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('title')}
        </Text>
        <SegmentedControl
          segments={[
            { key: 'liked', label: t('segments.liked') },
            { key: 'seen', label: t('segments.seen') },
            { key: 'later', label: t('segments.later') },
          ]}
          selected={segment}
          onSelect={(key) => setSegment(key as MyFilmsSegment)}
        />
      </View>
      <FilmsGrid
        listRef={list}
        segment={segment}
        filter={filter}
        onFilter={setFilter}
        films={films}
        state={state}
        online={online}
        imageBase={imageBase}
        tileWidth={tileWidth(window.width)}
        windowWidth={window.width}
        fetchingMore={query.isFetchingNextPage}
        moreFailed={moreFailed}
        onEnd={() => {
          if (query.hasNextPage && !query.isFetchingNextPage && !moreFailed) {
            void query.fetchNextPage();
          }
        }}
        onRetryMore={() => void query.fetchNextPage()}
        onRetry={() => void refetch()}
        refreshing={pulling}
        onRefresh={() => {
          setPulling(true);
          void refetch().finally(() => setPulling(false));
        }}
        onOpen={onOpenFilm}
        onPlayAlone={onPlayAlone}
      />
    </Screen>
  );
}
