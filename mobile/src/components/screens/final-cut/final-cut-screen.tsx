import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useReducedMotion,
} from 'react-native-reanimated';

import { RoomBanner } from '@/components/screens/room/room-banner';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Spotlight } from '@/components/ui/gradients';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { announceSeconds } from '@/features/finale/countdown';
import { takesTaps } from '@/features/finale/phase';
import type { FinalCutModel } from '@/features/finale/use-final-cut';
import type { RevealView } from '@/features/finale/use-reveal';
import { useAskToLeave } from '@/features/lobby/leave-context';
import { msUntil } from '@/lib/server-time';
import { tokens } from '@/theme/generated/tokens';
import { duration, easing, layout } from '@/theme/motion';

import { Finalist } from './finalist';
import { LockInFooter } from './lock-in-footer';
import { LockInRow } from './lock-in-row';
import { Reveal } from './reveal';

// The Final Cut (docs/design/screens/final-cut.md): rank the finalists by tapping, veto one,
// lock in, and watch who else has. The screen never moves itself: the room layout does.

type Frame = { x: number; y: number; width: number };

// The reveal's fades keep fading under Reduce Motion, on the same times (final-cut.md#the-reveal).
const revealFadeIn = FadeIn.duration(duration.base).reduceMotion(ReduceMotion.Never);
const revealFadeOut = FadeOut.duration(duration.fast).reduceMotion(ReduceMotion.Never);
const spotlightIn = FadeIn.duration(duration.celebrate)
  .easing(easing.standard)
  .reduceMotion(ReduceMotion.Never);

export function FinalCutScreen({
  roomId,
  model,
  reveal = null,
}: {
  roomId: string;
  model: FinalCutModel;
  /** The reveal after the round closes (final-cut.md#the-reveal), or null while voting. */
  reveal?: RevealView | null;
}) {
  const { t } = useTranslation('finale');
  const { t: tc } = useTranslation();
  const { t: tl } = useTranslation('lobby');
  const { t: tw } = useTranslation('winner');
  const { t: tm } = useTranslation('match');
  const { i18n } = useTranslation();
  const playing = reveal?.kind === 'playing' ? reveal : null;
  const waiting = reveal?.kind === 'waiting';
  const atWinner = playing?.stage === 'winner';
  const reduce = useReducedMotion();
  const [frames, setFrames] = useState<Record<number, Frame>>({});
  const lineText = playing?.line ? t(`reveal.reason.${playing.line}`) : '';
  // The spotlight is measured early but lit only at the winner step: it never gives the winner away.
  const winnerFrame = atWinner && playing?.winner ? frames[playing.winner.titleId] : undefined;
  const askToLeave = useAskToLeave();
  const ranked = model.kind === 'ranked_vote';
  const counting = model.phase === 'counting';
  const revealOn = !!reveal;

  // On arrival, focus goes to the heading.
  const heading = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const node = heading.current ? findNodeHandle(heading.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  // The time left is announced at 30 and 10 seconds, not every second.
  const { deadline } = model;
  useEffect(() => {
    if (!deadline || counting || revealOn) return;
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
  }, [deadline, counting, revealOn, t]);

  // Zero, or everyone locked in: said once.
  useEffect(() => {
    if (counting && !revealOn) AccessibilityInfo.announceForAccessibility(t('counting.title'));
  }, [counting, revealOn, t]);

  const intro = model.pickOne
    ? 'intro.pickOne'
    : ranked
      ? 'intro.rank'
      : model.vetoAllowed
        ? 'intro.veto'
        : 'intro.noVeto';
  const interactive = takesTaps(model.phase);
  const showFinalists = !model.loadFailed || !!playing;
  const loading = (model.phase === 'loading' && !model.postersFailed) || waiting;

  return (
    <Screen
      scroll
      header={
        <>
          <TopBar
            title={t(ranked ? 'title.ranked' : 'title.finalCut')}
            action={
              reveal
                ? undefined
                : { icon: 'x', accessibilityLabel: tl('a11y.leave'), onPress: askToLeave }
            }
          />
          <RoomBanner roomId={roomId} />
        </>
      }
      footer={
        <LockInFooter
          phase={reveal ? 'counting' : model.phase}
          status={reveal ? '' : model.status ? t(model.status) : ''}
          onLockIn={model.onLockIn}
          quiet={!!playing && !atWinner}
          watch={
            playing && atWinner
              ? {
                  accessibilityLabel: tm('a11y.cta', { title: playing.winner?.title ?? '' }),
                  onPress: playing.goOn,
                }
              : undefined
          }
        />
      }
    >
      <Animated.View entering={layout.fadeIn} className="gap-4 pt-2 pb-3" testID="final-cut">
        <View className="flex-row items-start gap-3">
          <View
            ref={heading}
            accessible
            accessibilityRole="header"
            accessibilityLabel={t(
              model.pickOne
                ? 'a11y.heading.pickOne'
                : ranked
                  ? 'a11y.heading.ranked'
                  : 'a11y.heading.finalCut',
            )}
            className="flex-1"
          >
            {atWinner ? (
              <Animated.View key="winner" entering={revealFadeIn}>
                <Text variant="display-m" tone="marquee" numberOfLines={2}>
                  {tw('eyebrow')}
                </Text>
              </Animated.View>
            ) : (
              <Animated.View key="vote" exiting={revealFadeOut}>
                <Text variant="display-m" numberOfLines={2}>
                  {t(
                    model.pickOne
                      ? 'heading.pickOne'
                      : ranked
                        ? 'heading.ranked'
                        : 'heading.finalCut',
                  )}
                </Text>
              </Animated.View>
            )}
          </View>
          {model.countdownOn && model.deadline && !reveal ? (
            <Animated.View exiting={layout.fadeOut}>
              <Countdown deadline={model.deadline} onEnd={model.onEnd} tick={model.tick} />
            </Animated.View>
          ) : null}
        </View>

        {reveal ? (
          // The intro's slot shrinks to the reason line's height, so the posters rise once.
          <Animated.View layout={LinearTransition.duration(duration.base)}>
            <View
              style={{ opacity: 0 }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text variant="title-m" numberOfLines={2}>
                {lineText || ' '}
              </Text>
            </View>
            {atWinner && lineText ? (
              <Animated.View
                entering={reduce ? revealFadeIn : layout.popIn}
                className="absolute inset-x-0 top-0"
              >
                <Text variant="title-m" tone="secondary" numberOfLines={2}>
                  {lineText}
                </Text>
              </Animated.View>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View exiting={revealFadeOut}>
            <Text variant="body-m" tone="secondary">
              {t(intro)}
            </Text>
            <Text variant="body-s" tone="muted" className="pt-1">
              {t('intro.source')}
            </Text>
          </Animated.View>
        )}

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
          <View className="relative flex-row justify-center gap-2.5">
            {winnerFrame ? (
              <Animated.View
                entering={spotlightIn}
                testID="reveal-spotlight"
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: winnerFrame.x - tokens.space['24'],
                  top: winnerFrame.y - tokens.space['24'],
                  width: winnerFrame.width + tokens.space['24'] * 2,
                  height: (winnerFrame.width * 3) / 2 + tokens.space['24'] * 2,
                }}
              >
                <Spotlight tone="marquee" />
              </Animated.View>
            ) : null}
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
              : (playing
                  ? playing.finalists
                  : model.finalists.map((view) => ({ view, reveal: undefined }))
                ).map(({ view, reveal: look }, index) => {
                  const place = playing
                    ? ({ kind: 'faint', rank: index + 1 } as const)
                    : model.places.get(view.titleId);
                  if (!place) return null;
                  return (
                    <Finalist
                      key={view.titleId}
                      view={view}
                      place={place}
                      reveal={look}
                      onFrame={
                        playing
                          ? (frame) =>
                              setFrames((before) =>
                                before[view.titleId]?.x === frame.x &&
                                before[view.titleId]?.y === frame.y &&
                                before[view.titleId]?.width === frame.width
                                  ? before
                                  : { ...before, [view.titleId]: frame },
                              )
                          : undefined
                      }
                      interactive={interactive}
                      vetoEnabled={model.vetoAllowed}
                      pickOne={model.pickOne}
                      counting={counting}
                      hideNumber={model.numbersHidden}
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

        {reveal ? null : (
          <Animated.View exiting={revealFadeOut}>
            <LockInRow seats={model.seats} count={model.count} of={model.of} />
          </Animated.View>
        )}
      </Animated.View>
      {playing ? <Reveal view={playing} language={i18n.language} /> : null}
    </Screen>
  );
}
