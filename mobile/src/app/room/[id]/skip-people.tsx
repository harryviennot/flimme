import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside a formSheet (see the film sheet).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { SKIP_PEOPLE_MAX } from '@/features/lobby/genres';
import { knownForOf, SEARCH_MAX_LENGTH } from '@/features/lobby/people';
import { usePeopleSearch, useSkippedPeople } from '@/features/lobby/use-people';

const announce = (text: string) => {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
};

/** A search taking longer than this is announced to a screen reader (skip-people.md). */
const SEARCHING_ANNOUNCE_MS = 1000;

/**
 * The people search sheet (docs/design/screens/skip-people.md): find an actor or a director, tap
 * once, they join this player's Not tonight list. What is typed never leaves the call: no analytics,
 * no log, no Sentry breadcrumb (`features/lobby/people.ts`).
 */
export default function SkipPeopleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const search = usePeopleSearch(text, i18n.language);
  const { people: skipped, add } = useSkippedPeople(id);
  const atCap = skipped.length >= SKIP_PEOPLE_MAX;

  const { people, busy, error } = search;
  // The count after each answer, politely; "searching" only when it takes a while.
  useEffect(() => {
    if (busy || error || people === null) return;
    announce(
      people.length === 0
        ? t('skipPeople.empty')
        : t('skipPeople.a11y.results', { count: people.length }),
    );
  }, [people, busy, error, t]);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => announce(t('skipPeople.a11y.searching')), SEARCHING_ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [busy, t]);

  const pick = (person: { id: number; name: string }) => {
    const result = add(person);
    // At the cap (a race: Add a person is disabled there) a new person adds nothing and the sheet stays.
    if (result === 'capped') return;
    if (result === 'added') announce(t('skipPeople.a11y.added', { name: person.name }));
    router.back();
  };

  const firstSearch = busy && people === null && !error;
  const showEmpty = !error && !busy && people !== null && people.length === 0;
  const rows = !error && people !== null && people.length > 0 ? people : null;

  return (
    <Screen
      header={
        <View className="gap-3 px-5 pt-5">
          <View className="flex-row items-center gap-3">
            <View className="flex-1" accessible accessibilityRole="header">
              <Text variant="display-s">{t('skipPeople.title')}</Text>
            </View>
            <IconButton
              icon="x"
              variant="plain"
              accessibilityLabel={tc('actions.close')}
              onPress={() => router.back()}
            />
          </View>
          <View accessibilityLiveRegion="polite">
            <Text variant="body-s" tone="secondary">
              {atCap
                ? t('prefs.notTonight.peopleCap', { max: SKIP_PEOPLE_MAX })
                : t('skipPeople.helper')}
            </Text>
          </View>
          <SearchField
            accessibilityLabel={t('skipPeople.field')}
            placeholder={t('skipPeople.placeholder')}
            value={text}
            onChangeText={setText}
            busy={busy}
            autoFocus
            maxLength={SEARCH_MAX_LENGTH}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      }
    >
      <GestureHandlerRootView className="flex-1">
        <ScrollView
          contentContainerClassName="grow pt-3"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          {firstSearch ? (
            <View
              className="overflow-hidden rounded-lg border border-border-default bg-bg-surface"
              accessibilityState={{ busy: true }}
            >
              {[0, 1, 2].map((row) => (
                <View
                  key={row}
                  className="min-h-14 justify-center gap-2 border-b border-border-subtle px-4 py-3"
                >
                  <Skeleton className="h-4 w-32 rounded-sm" />
                  <Skeleton className="h-3 w-24 rounded-sm" />
                </View>
              ))}
            </View>
          ) : null}
          {rows ? (
            <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
              {rows.map((person) => {
                const film = knownForOf(person);
                const description = film
                  ? film.year === null
                    ? t('skipPeople.knownForNoYear', { title: film.title })
                    : t('skipPeople.knownFor', { title: film.title, year: film.year })
                  : undefined;
                const listed = skipped.some((p) => p.id === person.id);
                const base = description
                  ? t('skipPeople.a11y.row', { name: person.name, film: description })
                  : person.name;
                return (
                  <ListRow
                    key={person.id}
                    label={person.name}
                    description={description}
                    value={listed ? t('skipPeople.already') : undefined}
                    checked={listed}
                    chevron={false}
                    accessibilityLabel={listed ? `${base}, ${t('skipPeople.already')}` : base}
                    accessibilityHint={t('skipPeople.a11y.rowHint')}
                    onPress={() => pick(person)}
                  />
                );
              })}
            </View>
          ) : null}
          {showEmpty ? (
            <EmptyState
              icon="user"
              title={t('skipPeople.empty')}
              body={t('skipPeople.emptyHint')}
            />
          ) : null}
          {error ? (
            <EmptyState
              icon={error === 'offline' ? 'wifi-off' : 'alert'}
              error={error === 'failed'}
              title={error === 'offline' ? t('skipPeople.offline') : t('skipPeople.failed')}
              action={{ label: t('genresSheet.retry'), onPress: search.retry }}
            />
          ) : null}
        </ScrollView>
      </GestureHandlerRootView>
    </Screen>
  );
}
