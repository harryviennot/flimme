import { useEffect, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { RoomBanner } from '@/components/screens/room/room-banner';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { announceSeconds } from '@/features/finale/countdown';
import { takesTaps } from '@/features/finale/phase';
import type { FinalCutModel } from '@/features/finale/use-final-cut';
import { useAskToLeave } from '@/features/lobby/leave-context';
import { msUntil } from '@/lib/server-time';
import { duration, layout } from '@/theme/motion';

import { Finalist } from './finalist';
import { LockInFooter } from './lock-in-footer';
import { LockInRow } from './lock-in-row';
import { Reveal } from './reveal';

// The Final Cut (docs/design/screens/final-cut.md): rank the finalists by tapping, veto one,
// lock in, and watch who else has. The screen never moves itself: the room layout does.

export function FinalCutScreen({ roomId, model }: { roomId: string; model: FinalCutModel }) {
  const { t } = useTranslation('finale');
  const { t: tc } = useTranslation();
  const { t: tl } = useTranslation('lobby');
  const askToLeave = useAskToLeave();
  const ranked = model.kind === 'ranked_vote';
  const counting = model.phase === 'counting';

  // On arrival, focus goes to the heading.
  const heading = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const node = heading.current ? findNodeHandle(heading.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  // The time left is announced at 30 and 10 seconds, not every second.
  const { deadline } = model;
  useEffect(() => {
    if (!deadline || counting) return;
    let last: number | null = null;
    const timer = setInterval(() => {
      const left = msUntil(deadline);
      const spoken = announceSeconds(left);
      if (spoken !== null && spoken !== last) {
        last = spoken;
        AccessibilityInfo.announceForAccessibility(t('a11y.timeLeft', { count: spoken }));
      }
    }, duration.base);
    return () => clearInterval(timer);
  }, [deadline, counting, t]);

  // Zero, or everyone locked in: said once.
  useEffect(() => {
    if (counting) AccessibilityInfo.announceForAccessibility(t('counting.title'));
  }, [counting, t]);

  const intro = ranked ? 'intro.rank' : model.vetoAllowed ? 'intro.veto' : 'intro.noVeto';
  const interactive = takesTaps(model.phase);
  const showFinalists = !model.loadFailed;
  const loading = model.phase === 'loading' && !model.postersFailed;

  return (
    <Screen
      scroll
      header={
        <>
          <TopBar
            title={t(ranked ? 'title.ranked' : 'title.finalCut')}
            action={{ icon: 'x', accessibilityLabel: tl('a11y.leave'), onPress: askToLeave }}
          />
          <RoomBanner roomId={roomId} />
        </>
      }
      footer={
        <LockInFooter
          phase={model.phase}
          status={model.status ? t(model.status) : ''}
          onLockIn={model.onLockIn}
        />
      }
    >
      <Animated.View entering={layout.fadeIn} className="gap-4 pt-2 pb-3" testID="final-cut">
        <View className="flex-row items-start gap-3">
          <View
            ref={heading}
            accessible
            accessibilityRole="header"
            accessibilityLabel={t(ranked ? 'a11y.heading.ranked' : 'a11y.heading.finalCut')}
            className="flex-1"
          >
            <Text variant="display-m" numberOfLines={2}>
              {t(ranked ? 'heading.ranked' : 'heading.finalCut')}
            </Text>
          </View>
          {model.countdownOn && model.deadline ? (
            <Animated.View exiting={layout.fadeOut}>
              <Countdown deadline={model.deadline} onEnd={model.onEnd} tick={model.tick} />
            </Animated.View>
          ) : null}
        </View>

        <Text variant="body-m" tone="secondary">
          {t(intro)}
        </Text>

        {model.loadFailed ? (
          <View className="items-center gap-3 py-4">
            <Text variant="body-m" tone="secondary" align="center">
              {t('error.load')}
            </Text>
            <Button
              label={tc('actions.retry')}
              variant="secondary"
              size="s"
              onPress={model.retryLoad}
            />
          </View>
        ) : null}

        {showFinalists ? (
          <View className="flex-row justify-center gap-2.5">
            {loading
              ? Array.from({ length: model.slots }, (_, i) => (
                  <View
                    key={i}
                    className="max-w-36 flex-1 gap-1"
                    accessible
                    accessibilityLabel={t('a11y.loadingFinalists')}
                  >
                    <Skeleton className="aspect-2/3 w-full rounded-sm" />
                    <Skeleton className="h-4 w-3/4 rounded-sm" />
                  </View>
                ))
              : model.finalists.map((view, index) => {
                  const place = model.places.get(view.titleId);
                  if (!place) return null;
                  return (
                    <Finalist
                      key={view.titleId}
                      view={view}
                      place={place}
                      interactive={interactive}
                      vetoEnabled={model.vetoAllowed}
                      counting={counting}
                      popDelay={index * duration.instant}
                      onTap={() => model.onTap(view.titleId)}
                      onLongPress={() => model.onLongPress(view.titleId)}
                    />
                  );
                })}
          </View>
        ) : null}

        {model.postersFailed ? (
          <View className="items-center gap-3">
            <Text variant="body-m" tone="secondary" align="center">
              {t('error.posters')}
            </Text>
            <Button
              label={tc('actions.retry')}
              variant="secondary"
              size="s"
              onPress={model.retryPosters}
            />
          </View>
        ) : null}

        <LockInRow seats={model.seats} count={model.count} of={model.of} />
      </Animated.View>
      <Reveal />
    </Screen>
  );
}
