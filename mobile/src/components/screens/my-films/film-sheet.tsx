import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, useWindowDimensions, View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside this formSheet (the nested
// stack's sheet), while this one does.
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/api';
import { MovieCard } from '@/components/shared/movie-card';
import { WhereToWatch } from '@/components/shared/where-to-watch';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { recordSaved } from '@/features/later/record';
import {
  changeSaved,
  changeSeen,
  refreshMyFilms,
  sheetCardProps,
  useFilmSheet,
  useRemoveFilm,
} from '@/features/my-films';
import { useOnline } from '@/features/network';
import { servicesLabel } from '@/features/winner/services';

export type FilmSheetProps = { titleId: number; onClose: () => void };

function CardSkeleton() {
  const { t } = useTranslation('myFilms');
  return (
    <View
      className="gap-4"
      accessible
      accessibilityLabel={t('a11y.loadingFilm')}
      testID="film-sheet-loading"
    >
      <View className="w-full" style={{ aspectRatio: 345 / 518 }}>
        <Skeleton className="flex-1 rounded-xl" />
      </View>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-6 w-56" />
    </View>
  );
}

/** One film from the player's list (film-sheet.md): its card back, where to watch, two edits. */
export function FilmSheet({ titleId, onClose }: FilmSheetProps) {
  const { t, i18n } = useTranslation('myFilms');
  const { t: tc } = useTranslation();
  const { t: ts } = useTranslation('swipe');
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;
  const { view, setSeen, setSaved } = useFilmSheet(titleId, i18n.language);
  const removeFilm = useRemoveFilm();
  const busy = useRef(false);
  const changed = useRef(false);
  // Remove from Later turns into Save for later, so a slip can be taken back in the sheet.
  const [touchedSaved, setTouchedSaved] = useState(false);

  // A seen mark that went through changes Seen (and Liked's film): the grid reads again when the
  // sheet is gone, so a tile never moves under it.
  useEffect(
    () => () => {
      if (changed.current) void refreshMyFilms();
    },
    [],
  );

  // The film left the list elsewhere: the grid reads again and its tile goes.
  const gone = view.status === 'not_found';
  useEffect(() => {
    if (gone) void refreshMyFilms();
  }, [gone]);

  const ready = view.status === 'ready' ? view : null;
  const canEdit = ready !== null && online;

  const toggleSeen = async () => {
    if (!ready || busy.current) return;
    busy.current = true;
    const next = !ready.seen;
    setSeen(next);
    AccessibilityInfo.announceForAccessibility(next ? t('sheet.a11ySeen') : t('sheet.a11yNotSeen'));
    const outcome = await changeSeen(titleId, next, (args) => api.setFilmSeen(args));
    busy.current = false;
    if (outcome === 'ok') {
      changed.current = true;
    } else if (outcome === 'not_found') {
      void refreshMyFilms();
      onClose();
    } else {
      setSeen(!next);
      showToast({ tone: 'warn', title: t('sheet.failed') });
    }
  };

  const toggleSaved = async () => {
    if (!ready || busy.current) return;
    busy.current = true;
    setTouchedSaved(true);
    const next = !ready.saved;
    setSaved(next);
    AccessibilityInfo.announceForAccessibility(
      next ? t('sheet.a11ySavedLater') : t('sheet.a11yRemovedLater'),
    );
    const outcome = await changeSaved(titleId, next, (args) => api.setFilmSaved(args));
    busy.current = false;
    if (outcome !== 'failed') {
      // `not_found` means nothing to change (it was not saved): the sheet's state stands.
      recordSaved(titleId, next);
      changed.current = true;
    } else {
      setSaved(!next);
      showToast({ tone: 'warn', title: t('sheet.failed') });
    }
  };

  const remove = () => {
    if (busy.current) return;
    busy.current = true;
    removeFilm(titleId);
    onClose();
  };

  const body =
    view.status === 'loading' ? (
      <CardSkeleton />
    ) : view.status === 'offline' ? (
      <EmptyState icon="wifi-off" title={tc('states.offline')} body={t('sheet.offline')} />
    ) : view.status === 'error' ? (
      <EmptyState
        icon="alert"
        error
        title={t('sheet.error')}
        action={{ label: tc('actions.retry'), onPress: view.retry }}
      />
    ) : view.status === 'not_found' ? (
      <EmptyState
        icon="film"
        title={t('sheet.notFound')}
        action={{ label: tc('actions.close'), onPress: onClose }}
      />
    ) : (
      <>
        <MovieCard
          {...sheetCardProps(view.card, {
            language: i18n.language,
            imageBase,
            screenWidth: window.width,
            noSynopsis: ts('card.noSynopsis'),
          })}
          flipped
        />
        <WhereToWatch
          services={view.services}
          watchLink={view.watchLink}
          servicesLabel={servicesLabel(view.services, i18n.language)}
          notListed={t('sheet.notListed')}
          isGroupWinner={false}
        />
      </>
    );

  return (
    <GestureHandlerRootView className="flex-1 bg-bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="grow"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 gap-4 px-5 pt-5 pb-4">
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
      {ready && !online ? <Banner tone="warn" message={t('sheet.offlineActions')} /> : null}
      <View
        className="gap-3 border-t border-border-default bg-bg-surface px-5 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Button
          label={ready?.seen ? t('sheet.notSeen') : t('sheet.markSeen')}
          variant="secondary"
          size="l"
          block
          icon="eye"
          disabled={!canEdit}
          onPress={() => void toggleSeen()}
        />
        {ready?.seen ? (
          <Text variant="body-s" tone="muted" align="center">
            {t('sheet.seenHelper')}
          </Text>
        ) : null}
        {ready?.liked ? (
          <Button
            label={t('sheet.remove')}
            variant="ghost"
            size="l"
            block
            icon="trash"
            disabled={!canEdit}
            onPress={remove}
          />
        ) : null}
        {ready && (ready.saved || touchedSaved) ? (
          <Button
            label={ready.saved ? t('sheet.removeLater') : t('sheet.saveLater')}
            variant="ghost"
            size="l"
            block
            icon="bookmark"
            disabled={!canEdit}
            onPress={() => void toggleSaved()}
          />
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}
