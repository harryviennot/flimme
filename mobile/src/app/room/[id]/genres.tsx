import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside a formSheet (see the film sheet).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { genreChips, saveGenres, toggleGenre } from '@/features/lobby/genres';
import { useGenres } from '@/features/lobby/queries';
import { useOnline } from '@/features/network';
import { GENRES_KEY, SEATS_KEY, useRoomGenres } from '@/features/room';
import { reportError } from '@/lib/sentry';

/**
 * The player's genres for tonight (lobby.md#your-genres-tonight), over the lobby. Up to 3, optional,
 * counts on the chips and never who picked what. Genre ids are never sent to analytics.
 */
export default function RoomGenresScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const read = useRoomGenres(id);
  const names = useGenres();

  // Start can close this sheet while a save is in flight: the room layout dismisses it and shows
  // the next screen. A late answer must then not go back a second time and pop that screen.
  const segments = useSegments() as string[];
  const stillOpen = useRef(true);
  const onGenres = segments[segments.length - 1] === 'genres';
  useEffect(() => {
    stillOpen.current = onGenres;
  }, [onGenres]);
  const closeSheet = () => {
    if (stillOpen.current) router.back();
  };

  // Starts on the picks the server holds that are still offered (a pick that left the offer would
  // take a place in the cap that no chip shows); the player's taps replace them until Done.
  const offered = new Set(read.data?.options.map((option) => option.genre_id));
  const start = (read.data?.mine ?? []).filter((genre) => offered.has(genre));
  const [picked, setPicked] = useState<number[] | null>(null);
  const selection = picked ?? start;
  const [capped, setCapped] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const ready = read.isSuccess && names.isSuccess;
  const failed = !ready && (read.isError || names.isError || !online);
  const chips = ready
    ? genreChips(read.data.options, names.data, i18n.language, selection, start)
    : [];

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

  const done = async () => {
    if (busy.current || !ready) return;
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
        closeSheet();
        return;
      case 'locked':
        showToast({
          tone: 'info',
          title: t('genresLocked.title'),
          message: t('genresLocked.message'),
        });
        closeSheet();
        return;
      case 'stale':
        // A genre left tonight's offer: read it again, keep the sheet open.
        setPicked(null);
        void read.refetch();
        showToast({ tone: 'warn', title: t('errors.genresStale') });
        return;
      case 'bug':
        reportError(new Error(`genres sheet: ${outcome.reason}`));
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return;
      case 'failed':
        showToast({ tone: 'warn', title: t('errors.genres') });
        return;
    }
  };

  return (
    <Screen
      footer={
        <Button
          label={t('genresSheet.done')}
          size="l"
          block
          disabled={!ready}
          loading={saving}
          onPress={() => void done()}
        />
      }
    >
      <GestureHandlerRootView className="flex-1">
        <ScrollView contentContainerClassName="grow">
          <View className="gap-4 pt-4 pb-4">
            <View accessible accessibilityRole="header">
              <Text variant="display-s">{t('genresSheet.title')}</Text>
            </View>
            {/* The cap note takes the helper's place, so the chips never jump. */}
            <Text
              variant="body-s"
              tone={capped ? 'secondary' : 'muted'}
              accessibilityLiveRegion="polite"
            >
              {capped ? t('genresSheet.cap') : t('genresSheet.helper')}
            </Text>
            {ready && chips.length > 0 ? (
              <View accessibilityRole="list" className="flex-row flex-wrap gap-2">
                {chips.map((chip) => (
                  <Chip
                    key={chip.id}
                    label={chip.name}
                    count={chip.count > 0 ? chip.count : undefined}
                    accessibilityLabel={t('genresSheet.chip', {
                      name: chip.name,
                      count: chip.count,
                    })}
                    selected={chip.selected}
                    onPress={() => toggle(chip.id)}
                  />
                ))}
              </View>
            ) : null}
            {ready && chips.length === 0 ? (
              <Text variant="body-m" tone="secondary">
                {t('genresSheet.none')}
              </Text>
            ) : null}
            {failed ? (
              <EmptyState
                icon={online ? 'alert' : 'wifi-off'}
                error={online}
                title={online ? t('genresSheet.failed') : t('genresSheet.offline')}
                action={{ label: t('genresSheet.retry'), onPress: retry }}
              />
            ) : null}
            {!ready && !failed ? (
              <View className="flex-row flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <Skeleton key={n} className="h-9 w-24 rounded-pill" />
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    </Screen>
  );
}
