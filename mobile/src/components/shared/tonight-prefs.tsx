import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { layout } from '@/theme/motion';

import { GenreChips, type GenreChipOption } from './genre-chips';

export type TonightPrefsProps = {
  /** Tonight's offered genres, sorted by name, with counts. */
  offered: readonly GenreChipOption[];
  /** Every TMDB movie genre, sorted by name: the Not tonight row. */
  allGenres: readonly { id: number; name: string }[];
  /** Genres out tonight: the room's plus this draft's skips. */
  outTonight: readonly number[];
  picks: readonly number[];
  skipGenres: readonly number[];
  showCounts: boolean;
  maxPicks: number;
  maxSkipGenres: number;
  /** The line shown in place of the wants helper (the cap note, or a pick that left), or none. */
  wantsNote?: string | null;
  /** The line shown under the genres count (the genre cap, or the room limit), or none. */
  genresNote?: string | null;
  loading?: boolean;
  onTogglePick: (id: number) => void;
  onToggleSkip: (id: number) => void;
};

/**
 * The two sections of the genre step and the lobby's genres sheet: In the mood for (picks) and
 * Not tonight (skips). No state and no calls: the screen passes the draft and the handlers, and
 * `features/lobby/genres.ts` holds the rules.
 */
export function TonightPrefs({
  offered,
  allGenres,
  outTonight,
  picks,
  skipGenres,
  showCounts,
  maxPicks,
  maxSkipGenres,
  wantsNote,
  genresNote,
  loading,
  onTogglePick,
  onToggleSkip,
}: TonightPrefsProps) {
  const { t } = useTranslation('lobby');
  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <View accessible accessibilityRole="header">
          <Text variant="title-m">{t('prefs.wants.title')}</Text>
        </View>
        {!loading ? (
          <View
            accessible
            accessibilityLabel={t('prefs.a11y.wantsCount', { count: picks.length, max: maxPicks })}
          >
            <Text variant="mono-data" tone={picks.length > 0 ? 'accent' : 'muted'}>
              {t('prefs.count', { count: picks.length, max: maxPicks })}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="min-h-4.5 justify-center" accessibilityLiveRegion="polite">
        {wantsNote ? (
          <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
            <Text variant="body-s" tone="secondary">
              {wantsNote}
            </Text>
          </Animated.View>
        ) : (
          <Text variant="body-s" tone="secondary">
            {t('prefs.wants.helper', { max: maxPicks })}
          </Text>
        )}
      </View>
      <View className="mt-1">
        <GenreChips
          loading={loading}
          options={offered}
          selected={picks}
          outTonight={outTonight}
          showCounts={showCounts}
          onToggle={onTogglePick}
        />
      </View>

      <View className="mt-4 gap-1 border-t border-border-subtle pt-5">
        <View className="flex-row items-center gap-2">
          <Icon name="ban" size={18} color="nope-text" />
          <View accessible accessibilityRole="header">
            <Text variant="title-m">{t('prefs.notTonight.title')}</Text>
          </View>
        </View>
        <Text variant="body-s" tone="secondary">
          {t('prefs.notTonight.helper')}
        </Text>
      </View>
      <View className="mt-3 flex-row items-baseline justify-between">
        <Text variant="mono-eyebrow" tone="secondary">
          {t('prefs.notTonight.genres')}
        </Text>
        {!loading ? (
          <View
            accessible
            accessibilityLabel={t('prefs.a11y.genresCount', {
              count: skipGenres.length,
              max: maxSkipGenres,
            })}
          >
            <Text variant="mono-data" tone={skipGenres.length > 0 ? 'nope' : 'muted'}>
              {t('prefs.count', { count: skipGenres.length, max: maxSkipGenres })}
            </Text>
          </View>
        ) : null}
      </View>
      <View accessibilityLiveRegion="polite">
        {genresNote ? (
          <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
            <Text variant="body-s" tone="secondary" className="mt-1">
              {genresNote}
            </Text>
          </Animated.View>
        ) : null}
      </View>
      <View className="mt-1">
        <GenreChips
          mode="skip"
          loading={loading}
          options={allGenres.map((genre) => ({ ...genre, count: 0 }))}
          selected={skipGenres}
          showCounts={false}
          onToggle={onToggleSkip}
        />
      </View>
    </View>
  );
}
