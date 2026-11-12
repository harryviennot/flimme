import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside a formSheet (see the film sheet).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

import { TonightPrefs } from '@/components/shared/tonight-prefs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { GENRE_CAP, SKIP_GENRES_MAX, SKIP_PEOPLE_MAX } from '@/features/lobby/genres';
import { useTonight } from '@/features/lobby/use-tonight';

/**
 * The player's genres for tonight (lobby.md#your-genres-tonight), over the lobby. Up to 3, optional,
 * counts on the chips and never who picked what. Genre ids are never sent to analytics.
 */
export default function RoomGenresScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('lobby');
  const tonight = useTonight(id, i18n.language);
  const { ready, failed, online } = tonight;

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

  const done = async () => {
    if (!ready) return;
    const result = await tonight.save();
    if (result === 'close' || result === 'locked') closeSheet();
  };

  const none = ready && tonight.read.data?.options.length === 0;

  return (
    <Screen
      footer={
        <Button
          label={t('genresSheet.done')}
          size="l"
          block
          disabled={!ready}
          loading={tonight.saving}
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
            <Text variant="body-s" tone="muted">
              {t('genreStep.helper')}
            </Text>
            {none ? (
              <Text variant="body-m" tone="secondary">
                {t('genresSheet.none')}
              </Text>
            ) : null}
            {failed ? (
              <EmptyState
                icon={online ? 'alert' : 'wifi-off'}
                error={online}
                title={online ? t('genresSheet.failed') : t('genresSheet.offline')}
                action={{ label: t('genresSheet.retry'), onPress: tonight.retry }}
              />
            ) : (
              <TonightPrefs
                loading={!ready}
                offered={tonight.offered}
                allGenres={tonight.allGenres}
                outTonight={tonight.outTonight}
                picks={tonight.picks}
                skipGenres={tonight.skips}
                skipPeople={tonight.people}
                showCounts
                maxPicks={GENRE_CAP}
                maxSkipGenres={SKIP_GENRES_MAX}
                maxSkipPeople={SKIP_PEOPLE_MAX}
                wantsNote={tonight.wantsText}
                genresNote={tonight.genresText}
                onTogglePick={tonight.togglePick}
                onToggleSkip={tonight.toggleSkip}
                onRemovePerson={tonight.removePerson}
                onAddPerson={() => router.push(`/room/${id}/skip-people`)}
                addPersonRef={tonight.addPersonRef}
              />
            )}
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    </Screen>
  );
}
