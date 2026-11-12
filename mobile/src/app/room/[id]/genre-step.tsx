import { router, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, View } from 'react-native';

import { TonightPrefs } from '@/components/shared/tonight-prefs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { groupedCode, showsCounts, stepFooter } from '@/features/genres/step';
import { GENRE_CAP, SKIP_GENRES_MAX, SKIP_PEOPLE_MAX } from '@/features/lobby/genres';
import { presentSeats, seatedSeats } from '@/features/lobby/seats';
import { useTonight } from '@/features/lobby/use-tonight';
import { useRoom, useRoomPresence, useRoomSeats } from '@/features/room';

/**
 * The genre step (docs/design/screens/genre-step.md): the one question that changes tonight's deck,
 * asked once as a player arrives in a lobby. Up to 3 genres or any genre; skipping never waits.
 * Counts show only when others are present, never who picked what. Genre ids stay out of analytics.
 */
export default function GenreStepScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('lobby');
  const room = useRoom(id).data;
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

  const tonight = useTonight(id, i18n.language);
  const { ready, failed, loading, online } = tonight;
  const [saveFailed, setSaveFailed] = useState(false);

  // No offer tonight: straight to the lobby, with no message (its row says so).
  // Loading announces once (genre-step.md#accessibility).
  const loadingAnnounced = useRef(false);
  useEffect(() => {
    if (loading && !loadingAnnounced.current && Platform.OS === 'ios') {
      loadingAnnounced.current = true;
      AccessibilityInfo.announceForAccessibility(t('genreStep.a11yLoading'));
    }
  }, [loading, t]);

  const noOffer = ready && tonight.read.data?.options.length === 0;
  useEffect(() => {
    if (noOffer && stillOpen.current) router.replace(`/room/${id}/lobby`);
  }, [noOffer, id]);

  const footer = stepFooter({
    picks: tonight.picks.length,
    skips: tonight.skips.length + tonight.people.length,
    ready,
    failed,
    saveFailed,
    online,
  });

  const go = async () => {
    // Skipping never waits: nothing loaded, nothing to save.
    if (!ready) {
      toLobby();
      return;
    }
    const result = await tonight.save();
    if (result === 'close' || result === 'locked') toLobby();
    else if (result === 'failed' || result === 'offline') setSaveFailed(true);
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
            loading={tonight.saving}
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
        <View className="mt-2">
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
              showCounts={counts}
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
      </View>
    </Screen>
  );
}
