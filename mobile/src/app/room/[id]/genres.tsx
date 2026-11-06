import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, View } from 'react-native';

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
        router.back();
        return;
      case 'locked':
        showToast({
          tone: 'info',
          title: t('genresLocked.title'),
          message: t('genresLocked.message'),
        });
        router.back();
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
      scroll
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
      <View className="gap-4 pt-8 pb-4">
        <View accessible accessibilityRole="header">
          <Text variant="display-s">{t('genresSheet.title')}</Text>
        </View>
        <Text variant="body-s" tone="muted">
          {t('genresSheet.helper')}
        </Text>
        {capped ? (
          <Text variant="body-s" tone="secondary" accessibilityLiveRegion="polite">
            {t('genresSheet.cap')}
          </Text>
        ) : null}
        {ready && chips.length > 0 ? (
          <View accessibilityRole="list" className="flex-row flex-wrap gap-2">
            {chips.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.name}
                count={chip.count}
                accessibilityLabel={t('genresSheet.chip', { name: chip.name, count: chip.count })}
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
    </Screen>
  );
}
