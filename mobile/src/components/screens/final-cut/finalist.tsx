import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  findNodeHandle,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Poster } from '@/components/shared/poster';
import { GradientFill } from '@/components/ui/gradients';
import { Icon } from '@/components/ui/icon';
import { Pressable, type PressableNode } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import type { Place } from '@/features/finale/ballot';
import { COUNT_MS, COUNT_STEP_MS, countUpValue, reached } from '@/features/finale/reveal';
import type { FinalistView } from '@/features/finale/rounds';
import type { FinalistReveal } from '@/features/finale/use-reveal';
import { cn } from '@/lib/cn';
import { tokens } from '@/theme/generated/tokens';
import { duration, easing, layout, spring, timing } from '@/theme/motion';

// One finalist (final-cut.md#layout): the poster with its ring, number badge and veto stamp,
// then the title and the year. The poster never moves; only the badge, ring and stamp change.

/** The arcade lip's travel: the poster frame sinks this far while a finger is held. */
const SINK = 4;

const fadeIn = FadeIn.duration(duration.fast).reduceMotion(ReduceMotion.Never);
const fadeOut = FadeOut.duration(duration.fast).reduceMotion(ReduceMotion.Never);
const badgePop = ZoomIn.springify()
  .damping(spring.snappy.damping)
  .stiffness(spring.snappy.stiffness)
  .mass(spring.snappy.mass);

export type FinalistProps = {
  view: FinalistView;
  place: Place;
  /** Taps and long presses work (the phone is still voting). */
  interactive: boolean;
  /** A long press can veto (a Final Cut with a veto left). */
  vetoEnabled: boolean;
  /** 2 films: the state reads picked or not picked, and the action is pick. */
  pickOne?: boolean;
  /** The round is being counted: the poster dims. */
  counting: boolean;
  /** A restart after locking in: the phone has no ballot to show, so no faint numbers. */
  hideNumber?: boolean;
  /** The pop-in delay when the screen opens, in the seed order. Zero for none. */
  popDelay?: number;
  /** The reveal's look (final-cut.md#the-reveal). While set, `place` and taps are ignored. */
  reveal?: FinalistReveal;
  /** Where the poster frame sits in its row, for the winner's spotlight. */
  onFrame?: (frame: { x: number; y: number; width: number }) => void;
  /** Opens the film's synopsis (final-cut.md#reading-a-finalists-synopsis). No button without it. */
  onInfo?: () => void;
  onTap: () => void;
  onLongPress: () => void;
};

export function Finalist({
  view,
  place,
  interactive,
  vetoEnabled,
  pickOne = false,
  counting,
  hideNumber = false,
  popDelay = 0,
  reveal,
  onFrame,
  onInfo,
  onTap,
  onLongPress,
}: FinalistProps) {
  const { t } = useTranslation('finale');
  const reduce = useReducedMotion();
  const revealing = !!reveal;
  const out = !!reveal?.out;
  const winner = !!reveal?.winner;
  const vetoed = revealing ? out : place.kind === 'vetoed';

  const sink = useSharedValue(0);
  const fall = useSharedValue(0);
  const lift = useSharedValue(0);
  const sinkStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sink.get() + fall.get() + lift.get() }],
  }));
  const dim = useSharedValue(1);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  // The others dim from the winner step on, never the winner itself.
  const backed = revealing && !!reveal && reached(reveal.stage, 'winner') && !winner && !out;
  useEffect(() => {
    if (revealing) {
      // Fades keep fading under Reduce Motion, on the same times.
      dim.set(
        withTiming(
          out ? tokens.opacity.disabled : backed ? tokens.opacity['stack-near'] : 1,
          out
            ? { ...timing.exit, reduceMotion: ReduceMotion.Never }
            : { ...timing.base, reduceMotion: ReduceMotion.Never },
        ),
      );
      return;
    }
    dim.set(
      withTiming(
        vetoed ? tokens.opacity.disabled : counting ? tokens.opacity['stack-near'] : 1,
        counting && !vetoed ? timing.base : { duration: duration.fast, easing: easing.standard },
      ),
    );
  }, [revealing, out, backed, vetoed, counting, dim]);
  // A knocked-out poster sinks the lip's travel; the winner rises. Neither moves under Reduce Motion.
  useEffect(() => {
    fall.set(reduce ? 0 : withTiming(out ? SINK : 0, timing.exit));
  }, [out, reduce, fall]);
  useEffect(() => {
    lift.set(reduce ? 0 : withTiming(winner ? -tokens.space['8'] : 0, timing.celebrate));
  }, [winner, reduce, lift]);

  // The points count up on the JS thread, stepping every `duration.instant`.
  const total = reveal?.points ?? null;
  const [counted, setCounted] = useState(0);
  useEffect(() => {
    if (total === null || reduce) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const progress = (Date.now() - start) / COUNT_MS;
      setCounted(countUpValue(progress, total));
      if (progress >= 1) clearInterval(timer);
    }, COUNT_STEP_MS);
    return () => clearInterval(timer);
  }, [total, reduce]);
  const pointsNow = total === null ? null : reduce ? total : counted;

  const label = view.title
    ? view.year
      ? t('a11y.film', { title: view.title, year: view.year })
      : t('a11y.filmNoYear', { title: view.title })
    : '';
  const revealText = !reveal
    ? ''
    : out
      ? t('a11y.state.vetoed')
      : winner
        ? total !== null
          ? t('reveal.a11y.winnerPoints', { count: total })
          : t('reveal.a11y.winner')
        : total !== null
          ? t('reveal.a11y.points', { count: total })
          : '';
  const stateText = revealing
    ? revealText
    : pickOne && place.kind === 'ranked'
      ? t('a11y.state.picked')
      : pickOne && place.kind === 'faint' && !hideNumber
        ? t('a11y.state.notPicked', { rank: place.rank })
        : place.kind === 'ranked'
          ? t('a11y.state.ranked', { rank: place.rank })
          : place.kind === 'faint' && hideNumber
            ? ''
            : place.kind === 'faint'
              ? t('a11y.state.unranked', { rank: place.rank })
              : t('a11y.state.vetoed');

  const actions =
    !interactive || revealing
      ? []
      : [
          place.kind === 'faint'
            ? {
                name: 'rankNext',
                label: t(pickOne ? 'a11y.actions.pick' : 'a11y.actions.rankNext'),
              }
            : null,
          place.kind === 'ranked'
            ? {
                name: 'removeRank',
                label: t(pickOne ? 'a11y.actions.unpick' : 'a11y.actions.removeRank'),
              }
            : null,
          vetoEnabled && !vetoed ? { name: 'veto', label: t('a11y.actions.veto') } : null,
          vetoed ? { name: 'liftVeto', label: t('a11y.actions.liftVeto') } : null,
        ].filter((action) => action !== null);

  // After a screen reader action the new state is announced politely and focus stays here.
  const acted = useRef<string | null>(null);
  const stateKey = place.kind === 'vetoed' ? 'v' : `${place.kind}${place.rank}`;
  useEffect(() => {
    const action = acted.current;
    if (!action) return;
    acted.current = null;
    AccessibilityInfo.announceForAccessibility(
      action === 'liftVeto' ? t('a11y.vetoLifted') : stateText,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey]);

  function onAction(event: AccessibilityActionEvent) {
    const name = event.nativeEvent.actionName;
    acted.current = name;
    if (name === 'rankNext' || name === 'removeRank') onTap();
    else if (name === 'veto' || name === 'liftVeto') onLongPress();
  }

  // The info button sits over the poster frame, as a sibling of the Pressable so a press on it never
  // reaches the tile. It shows while the round runs and after lock-in; the counting and the reveal hide it.
  const showInfo = !!onInfo && !counting && !revealing && !!view.title;
  const infoRef = useRef<PressableNode>(null);
  const opened = useRef(false);
  const sheetOpen = usePathname().includes('/synopsis/');
  // Closing the sheet hands the screen reader's focus back to the button that opened it.
  useEffect(() => {
    if (sheetOpen || !opened.current) return;
    opened.current = false;
    const node = infoRef.current ? findNodeHandle(infoRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [sheetOpen]);

  const entering = reduce ? fadeIn : layout.popIn.delay(popDelay);

  return (
    <Animated.View
      entering={entering}
      className="max-w-36 flex-1"
      testID={`finalist-${view.titleId}`}
      onLayout={(event) => {
        // The poster is the root's first child, so its frame starts where the root does.
        const { x, y, width } = event.nativeEvent.layout;
        onFrame?.({ x, y, width });
      }}
    >
      <Pressable
        accessibilityLabel={[label, stateText].filter(Boolean).join('. ')}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        accessibilityState={{ disabled: !interactive || revealing }}
        haptic={false}
        hitSlop={0}
        disabled={!interactive || revealing}
        delayLongPress={500}
        onPress={onTap}
        // A long press never counts as a tap, even where it does nothing.
        onLongPress={onLongPress}
        onPressIn={() => {
          if (vetoEnabled) sink.set(withTiming(SINK, timing.press));
        }}
        onPressOut={() => sink.set(withTiming(0, timing.release))}
        className="gap-1"
      >
        <Animated.View style={sinkStyle}>
          <View
            className="relative overflow-hidden rounded-sm bg-bg-raised"
            style={{ aspectRatio: 2 / 3 }}
          >
            <Animated.View
              style={dimStyle}
              className="absolute inset-0 items-center justify-center"
            >
              {view.poster ? (
                <Poster source={view.poster} thumbhash={view.placeholder ?? undefined} />
              ) : (
                <Icon name="film" size={32} color="text-muted" />
              )}
            </Animated.View>
            <View
              pointerEvents="none"
              className={cn(
                'absolute inset-0 rounded-sm',
                revealing && !out && !winner && 'border border-border-strong',
                revealing && out && 'border-2 border-nope-default',
                revealing && winner && 'border-2 border-marquee-default glow-marquee',
                !revealing &&
                  place.kind === 'ranked' &&
                  (place.rank === 1
                    ? 'border-2 border-accent-default glow-accent'
                    : 'border-2 border-accent-default'),
                !revealing && place.kind === 'faint' && 'border border-border-strong',
                !revealing && place.kind === 'vetoed' && 'border-2 border-nope-default',
              )}
            />
            {revealing ? (
              out ? (
                <Animated.View
                  entering={reduce ? fadeIn : layout.popIn}
                  exiting={fadeOut}
                  pointerEvents="none"
                  className="absolute inset-0 items-center justify-center"
                >
                  <Icon name="ban" size={44} color="nope-default" />
                </Animated.View>
              ) : null
            ) : place.kind === 'vetoed' ? (
              <Animated.View
                entering={reduce ? fadeIn : layout.popIn}
                exiting={fadeOut}
                pointerEvents="none"
                className="absolute inset-0 items-center justify-center"
              >
                <Icon name="ban" size={44} color="nope-default" />
              </Animated.View>
            ) : place.kind === 'faint' && hideNumber ? null : (
              <Animated.View
                key={place.kind}
                entering={place.kind === 'ranked' ? (reduce ? fadeIn : badgePop) : undefined}
                exiting={fadeOut}
                pointerEvents="none"
                className={cn(
                  'absolute top-1.5 left-1.5 size-7.5 items-center justify-center rounded-pill',
                  place.kind === 'ranked' ? 'bg-accent-default' : 'bg-bg-raised',
                )}
              >
                <Text
                  variant="display-s"
                  tone={place.kind === 'ranked' ? 'on-accent' : 'muted'}
                  maxFontSizeMultiplier={1}
                  accessible={false}
                >
                  {place.rank}
                </Text>
              </Animated.View>
            )}
            {pointsNow !== null ? (
              <Animated.View
                entering={fadeIn}
                pointerEvents="none"
                className="absolute inset-x-0 bottom-0 items-center pt-4 pb-1.5"
              >
                <GradientFill gradient="card-scrim" />
                <Text
                  variant="mono-data"
                  tone={winner ? 'marquee' : 'primary'}
                  numberOfLines={1}
                  accessible={false}
                >
                  {t('reveal.points', { count: pointsNow })}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>
        {view.title ? (
          <View accessible={false}>
            <Text variant="body-s" numberOfLines={2} ellipsizeMode="tail">
              {view.title}
            </Text>
            {view.year ? (
              <Text variant="mono-data" tone="muted">
                {view.year}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
      {showInfo ? (
        <Animated.View
          style={sinkStyle}
          exiting={layout.fadeOut}
          className="absolute top-1.5 right-1.5"
        >
          <Pressable
            ref={infoRef}
            accessibilityLabel={t('a11y.synopsis', { title: view.title })}
            accessibilityHint={t('a11y.synopsisHint')}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 12 }}
            onPress={() => {
              opened.current = true;
              onInfo?.();
            }}
            className="size-7 items-center justify-center rounded-pill bg-bg-sunken"
          >
            <Icon name="info" size={16} color="text-primary" />
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
