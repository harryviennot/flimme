import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View, type AccessibilityActionEvent } from 'react-native';
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
import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import type { Place } from '@/features/finale/ballot';
import type { FinalistView } from '@/features/finale/rounds';
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
  /** The round is being counted: the poster dims. */
  counting: boolean;
  /** The pop-in delay when the screen opens, in the seed order. Zero for none. */
  popDelay?: number;
  onTap: () => void;
  onLongPress: () => void;
};

export function Finalist({
  view,
  place,
  interactive,
  vetoEnabled,
  counting,
  popDelay = 0,
  onTap,
  onLongPress,
}: FinalistProps) {
  const { t } = useTranslation('finale');
  const reduce = useReducedMotion();
  const vetoed = place.kind === 'vetoed';

  const sink = useSharedValue(0);
  const sinkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sink.value }] }));
  const dim = useSharedValue(1);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  useEffect(() => {
    dim.set(
      withTiming(
        vetoed ? tokens.opacity.disabled : counting ? tokens.opacity['stack-near'] : 1,
        counting && !vetoed ? timing.base : { duration: duration.fast, easing: easing.standard },
      ),
    );
  }, [vetoed, counting, dim]);

  const label = view.title
    ? view.year
      ? t('a11y.film', { title: view.title, year: view.year })
      : t('a11y.filmNoYear', { title: view.title })
    : '';
  const stateText =
    place.kind === 'ranked'
      ? t('a11y.state.ranked', { rank: place.rank })
      : place.kind === 'faint'
        ? t('a11y.state.unranked', { rank: place.rank })
        : t('a11y.state.vetoed');

  const actions = !interactive
    ? []
    : [
        place.kind === 'faint' ? { name: 'rankNext', label: t('a11y.actions.rankNext') } : null,
        place.kind === 'ranked'
          ? { name: 'removeRank', label: t('a11y.actions.removeRank') }
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

  const entering = reduce ? fadeIn : layout.popIn.delay(popDelay);

  return (
    <Animated.View entering={entering} className="max-w-36 flex-1">
      <Pressable
        accessibilityLabel={view.title ? `${label}. ${stateText}` : stateText}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        accessibilityState={{ disabled: !interactive }}
        haptic={false}
        hitSlop={0}
        disabled={!interactive}
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
                place.kind === 'ranked' &&
                  (place.rank === 1
                    ? 'border-2 border-accent-default glow-accent'
                    : 'border-2 border-accent-default'),
                place.kind === 'faint' && 'border border-border-strong',
                place.kind === 'vetoed' && 'border-2 border-nope-default',
              )}
            />
            {place.kind === 'vetoed' ? (
              <Animated.View
                entering={reduce ? fadeIn : layout.popIn}
                exiting={fadeOut}
                pointerEvents="none"
                className="absolute inset-0 items-center justify-center"
              >
                <Icon name="ban" size={44} color="nope-default" />
              </Animated.View>
            ) : (
              <Animated.View
                key={place.kind}
                entering={place.kind === 'ranked' ? (reduce ? fadeIn : badgePop) : undefined}
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
    </Animated.View>
  );
}
