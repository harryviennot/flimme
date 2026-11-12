import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import type { PressableNode } from '@/components/ui/pressable';
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
  /** The people this player skips, in the order added. */
  skipPeople: readonly { id: number; name: string }[];
  showCounts: boolean;
  maxPicks: number;
  maxSkipGenres: number;
  maxSkipPeople: number;
  /** The line shown in place of the wants helper (the cap note, or a pick that left), or none. */
  wantsNote?: string | null;
  /** The line shown under the genres count (the genre cap, or the room limit), or none. */
  genresNote?: string | null;
  loading?: boolean;
  onTogglePick: (id: number) => void;
  onToggleSkip: (id: number) => void;
  onRemovePerson: (id: number) => void;
  /** Opens the people search sheet. */
  onAddPerson: () => void;
  /** Lets the screen move a screen reader's focus back to Add a person after the search sheet. */
  addPersonRef?: Ref<PressableNode>;
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
  skipPeople,
  showCounts,
  maxPicks,
  maxSkipGenres,
  maxSkipPeople,
  wantsNote,
  genresNote,
  loading,
  onTogglePick,
  onToggleSkip,
  onRemovePerson,
  onAddPerson,
  addPersonRef,
}: TonightPrefsProps) {
  const { t } = useTranslation('lobby');
  const atPeopleCap = skipPeople.length >= maxSkipPeople;
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

      <View className="mt-4 flex-row items-baseline justify-between">
        <Text variant="mono-eyebrow" tone="secondary">
          {t('prefs.notTonight.people')}
        </Text>
        <View
          accessible
          accessibilityLabel={t('prefs.a11y.peopleCount', {
            count: skipPeople.length,
            max: maxSkipPeople,
          })}
        >
          <Text variant="mono-data" tone={skipPeople.length > 0 ? 'nope' : 'muted'}>
            {t('prefs.count', { count: skipPeople.length, max: maxSkipPeople })}
          </Text>
        </View>
      </View>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        {skipPeople.map((person) => (
          <Animated.View key={person.id} entering={layout.popIn} exiting={layout.fadeOut}>
            <Chip
              label={person.name}
              tone="nope"
              selected
              accessibilityLabel={t('prefs.a11y.removePerson', { name: person.name })}
              accessibilityHint={t('prefs.a11y.removePersonHint')}
              onRemove={() => onRemovePerson(person.id)}
            />
          </Animated.View>
        ))}
        <Button
          variant="secondary"
          size="s"
          icon="plus"
          label={t('prefs.notTonight.addPerson')}
          disabled={atPeopleCap}
          onPress={onAddPerson}
          focusRef={addPersonRef}
        />
      </View>
      <View accessibilityLiveRegion="polite">
        {atPeopleCap ? (
          <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
            <Text variant="body-s" tone="secondary" className="mt-2">
              {t('prefs.notTonight.peopleCap', { max: maxSkipPeople })}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
