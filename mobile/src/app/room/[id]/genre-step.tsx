import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { api } from '@/api';
import { GenreChips } from '@/components/shared/genre-chips';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { groupedCode, showsCounts, stepFooter } from '@/features/genres/step';
import { genreChips, saveGenres, toggleGenre } from '@/features/lobby/genres';
import { useGenres } from '@/features/lobby/queries';
import { presentSeats, seatedSeats } from '@/features/lobby/seats';
import { useOnline } from '@/features/network';
import {
  GENRES_KEY,
  SEATS_KEY,
  useRoom,
  useRoomGenres,
  useRoomPresence,
  useRoomSeats,
} from '@/features/room';
import { errorFeedback } from '@/lib/feedback';
import { reportError } from '@/lib/sentry';
import { layout } from '@/theme/motion';

/**
 * The genre step (docs/design/screens/genre-step.md): the one question that changes tonight's deck,
 * asked once as a player arrives in a lobby. Up to 3 genres or any genre; skipping never waits.
 * Counts show only when others are present, never who picked what. Genre ids stay out of analytics.
 */
export default function GenreStepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const room = useRoom(id).data;
  const read = useRoomGenres(id);
  const names = useGenres();
  const seats = useRoomSeats(id);
  const { away } = useRoomPresence(id);
  const counts = showsCounts(presentSeats(seatedSeats(seats.data), away).length);

  // Start can replace this step while a save is in flight: a late answer must not go to the lobby
  // a second time.
  const segments = useSegments() as string[];
  const stillOpen = useRef(true);
  const onStep = segments[segments.length - 1] === 'genre-step';
  useEffect(() => {
    stillOpen.current = onStep;
  }, [onStep]);
  const toLobby = () => {
    if (stillOpen.current) router.replace(`/room/${id}/lobby`);
  };

  const offered = new Set(read.data?.options.map((option) => option.genre_id));
  const start = (read.data?.mine ?? []).filter((genre) => offered.has(genre));
  const [picked, setPicked] = useState<number[] | null>(null);
  const selection = picked ?? start;
  const [capped, setCapped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(false);

  const ready = read.isSuccess && names.isSuccess;
  const failed = !ready && (read.isError || names.isError || !online);

  // No offer tonight: straight to the lobby, with no message (its row says so).
  // Loading announces once (genre-step.md#accessibility).
  const loadingAnnounced = useRef(false);
  const loading = !read.isSuccess && !read.isError;
  useEffect(() => {
    if (loading && !loadingAnnounced.current && Platform.OS === 'ios') {
      loadingAnnounced.current = true;
      AccessibilityInfo.announceForAccessibility(t('genreStep.a11yLoading'));
    }
  }, [loading, t]);

  const noOffer = ready && read.data.options.length === 0;
  useEffect(() => {
    if (noOffer && stillOpen.current) router.replace(`/room/${id}/lobby`);
  }, [noOffer, id]);

  const chips = ready
    ? genreChips(read.data.options, names.data, i18n.language, selection, start)
    : [];
  const footer = stepFooter({
    picks: selection.length,
    ready,
    failed,
    saveFailed,
    online,
  });

  const toggle = (genre: number) => {
    const next = toggleGenre(selection, genre);
    setPicked(next.selection);
    setCapped(next.capped);
    if (next.capped && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(t('genresSheet.cap'));
    }
  };

  const retry = () => {
    void read.refetch();
    void names.refetch();
  };

  const go = async () => {
    if (busy.current) return;
    // Skipping never waits: nothing loaded, nothing to save.
    if (!ready) {
      toLobby();
      return;
    }
    const changed =
      selection.length !== start.length || selection.some((genre) => !start.includes(genre));
    if (changed && !online) {
      setSaveFailed(true);
      showToast({ tone: 'warn', title: t('errors.genres') });
      return;
    }
    busy.current = true;
    setSaving(true);
    const outcome = await saveGenres(
      { roomId: id ?? '', selection, start },
      { setSeatPrefs: (args) => api.setSeatPrefs(args) },
    );
    busy.current = false;
    setSaving(false);
    switch (outcome.kind) {
      case 'close':
        void client.invalidateQueries({ queryKey: GENRES_KEY(id ?? '') });
        void client.invalidateQueries({ queryKey: SEATS_KEY(id ?? '') });
        toLobby();
        return;
      case 'locked':
        showToast({
          tone: 'info',
          title: t('genresLocked.title'),
          message: t('genresLocked.message'),
        });
        toLobby();
        return;
      case 'stale':
        setPicked(null);
        void read.refetch();
        showToast({ tone: 'warn', title: t('errors.genresStale') });
        return;
      case 'bug':
        reportError(new Error(`genre step: ${outcome.reason}`));
        errorFeedback();
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return;
      case 'failed':
        setSaveFailed(true);
        showToast({ tone: 'warn', title: t('errors.genres') });
        return;
    }
  };

  return (
    <Screen
      scroll
      footer={
        <View className="gap-2">
          <Button
            label={footer.primary === 'any' ? t('genreStep.any') : t('genreStep.continue')}
            size="l"
            block
            loading={saving}
            onPress={() => void go()}
          />
          {footer.skip ? (
            <Button label={t('genreStep.skip')} variant="ghost" size="l" block onPress={toLobby} />
          ) : null}
        </View>
      }
    >
      <View className="gap-3 px-5 pt-8">
        <Text variant="mono-eyebrow" tone="marquee">
          {t('genreStep.eyebrow', { code: groupedCode(room?.code) })}
        </Text>
        <View accessible accessibilityRole="header">
          <Text variant="display-m">{t('genreStep.title')}</Text>
        </View>
        <Text variant="body-m" tone="secondary">
          {t('genreStep.helper')}
        </Text>
        <View
          className="mt-1 min-h-6 justify-center"
          accessible
          accessibilityLabel={
            capped ? t('genresSheet.cap') : t('genreStep.a11yCount', { count: selection.length })
          }
          accessibilityLiveRegion="polite"
        >
          {capped ? (
            <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
              <Text variant="body-s" tone="secondary">
                {t('genresSheet.cap')}
              </Text>
            </Animated.View>
          ) : ready ? (
            <Text variant="mono-data" tone={selection.length > 0 ? 'accent' : 'muted'}>
              {t('genreStep.count', { count: selection.length })}
            </Text>
          ) : null}
        </View>
        <View className="mt-2">
          {failed ? (
            <EmptyState
              icon={online ? 'alert' : 'wifi-off'}
              error={online}
              title={online ? t('genresSheet.failed') : t('genresSheet.offline')}
              action={{ label: t('genresSheet.retry'), onPress: retry }}
            />
          ) : (
            <GenreChips
              loading={!ready}
              options={chips}
              selected={selection}
              showCounts={counts}
              onToggle={toggle}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
