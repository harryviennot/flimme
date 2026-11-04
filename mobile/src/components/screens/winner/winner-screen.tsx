import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Poster } from '@/components/shared/poster';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Spotlight } from '@/components/ui/gradients';
import { MarqueeBulbs } from '@/components/ui/marquee-bulbs';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { matchMeta } from '@/features/match/format';
import type { WinnerView } from '@/features/winner/use-winner';
import { layout } from '@/theme/motion';

import { NoPick } from './no-pick';
import { WhereToWatch } from './where-to-watch';

// Tonight's pick (winner.md): the film and where to watch it, the same on every phone. Never
// who liked it, never a count. No haptic and no sound: the overlay already had them.

export type WinnerScreenProps = {
  view: WinnerView;
  language: string;
  online: boolean;
  /** The room turned done while this phone was swiping or in the Final Cut: the screen fades in. */
  fadeIn?: boolean;
  onHome: () => void;
};

export function WinnerScreen({
  view,
  language,
  online,
  fadeIn = false,
  onHome,
}: WinnerScreenProps) {
  const { t } = useTranslation('winner');
  const { t: tc } = useTranslation();
  const title = useRef<ComponentRef<typeof View>>(null);
  // The late card fades in, unless the screen was ready when it appeared.
  const [startedReady] = useState(view.status === 'ready');
  const lateIn = startedReady ? undefined : layout.fadeIn;

  const ready = view.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    const node = title.current ? findNodeHandle(title.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [ready]);

  const film = view.status === 'ready' ? view.card : null;
  const posterUri = view.status === 'ready' ? view.posterUri : null;
  const noPick = view.status === 'no_pick';
  const waiting = view.status === 'error' || (view.status === 'loading' && !online);

  return (
    <Screen
      scroll
      footer={
        <Button
          label={t('home')}
          accessibilityLabel={t('a11y.home')}
          variant="secondary"
          size="l"
          block
          onPress={onHome}
        />
      }
    >
      <Animated.View
        entering={fadeIn ? layout.fadeIn : undefined}
        className="flex-1"
        testID="winner"
      >
        {noPick ? (
          <NoPick />
        ) : (
          <View className="items-center gap-3 pt-3">
            <View
              className="absolute inset-x-0 top-0 aspect-square"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
            >
              <Spotlight tone="marquee" />
            </View>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <MarqueeBulbs count={13} />
            </View>
            <Text
              variant="mono-eyebrow"
              tone="marquee"
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              {t('eyebrow')}
            </Text>

            <View
              className="h-54 w-36 items-center justify-center overflow-hidden rounded-sm bg-bg-raised glow-marquee"
              accessible={!!film}
              accessibilityLabel={film ? t('a11y.poster', { title: film.title }) : undefined}
              testID="winner-poster"
            >
              {posterUri ? (
                <Poster
                  source={{ uri: posterUri }}
                  thumbhash={film?.poster_placeholder ?? undefined}
                />
              ) : film && !film.poster_path ? (
                <Icon name="film" size={32} color="text-muted" />
              ) : null}
            </View>

            {view.status === 'ready' ? (
              <Animated.View entering={lateIn} className="items-center gap-3">
                {view.onlyFilm ? (
                  <Text variant="body-m" tone="secondary" align="center">
                    {t('onlyFilm')}
                  </Text>
                ) : null}
                <View
                  ref={title}
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={t('a11y.title', { title: view.card.title })}
                >
                  <Text variant="display-l" align="center" numberOfLines={3}>
                    {view.card.title}
                  </Text>
                </View>
                {matchMeta(view.card, language) ? (
                  <Text variant="mono-data" tone="secondary">
                    {matchMeta(view.card, language)}
                  </Text>
                ) : null}
                <WhereToWatch
                  services={view.services}
                  watchLink={view.watchLink}
                  language={language}
                />
              </Animated.View>
            ) : waiting ? (
              <View className="items-center gap-3 pt-2">
                <Text variant="body-m" tone="secondary" align="center">
                  {online ? t('error.title') : t('error.offline')}
                </Text>
                {view.status === 'error' ? (
                  <Button
                    label={tc('actions.retry')}
                    variant="secondary"
                    size="s"
                    onPress={view.retry}
                  />
                ) : null}
              </View>
            ) : (
              <View
                className="items-center gap-3"
                accessible
                accessibilityLabel={t('a11y.loading')}
                testID="winner-loading"
              >
                <Skeleton className="h-10 w-56 rounded-sm" />
                <Skeleton className="h-5 w-32 rounded-sm" />
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </Screen>
  );
}
