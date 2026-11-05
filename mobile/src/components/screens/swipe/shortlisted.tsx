import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Poster } from '@/components/shared/poster';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Beat, BeatPhase } from '@/features/shortlist/controller';
import { useShortlistCards, type ShortlistFilm } from '@/features/shortlist/use-shortlist-cards';
import { duration, easing, layout } from '@/theme/motion';

import { measureSlot, measureView } from './slots';

// The shortlisted beat's layer (swipe.md#the-shortlisted-beat, moments.md#the-shortlisted-beat).
// Mounted over the stack's frame while a beat plays: a scrim that takes every touch, the title,
// the film's poster and the vote count, then the poster flies into its slot in the top bar. The
// controller (`features/shortlist/`) owns the times; this draws what each phase calls for.

/** The poster's corner radius in the beat and in the slot (rounded-md and rounded-xs). */
const RADIUS_FROM = 12;
const RADIUS_TO = 4;
/** Room the two title lines and the count need above and below the poster. */
const COLUMN_EXTRA = 168;

export type ShortlistedBeatProps = {
  roomId: string;
  /** Null in the tail: the scrim alone fades out. */
  beat: Beat | null;
  phase: BeatPhase | null;
  /** Counts up per beat: a new beat starts its animation again. */
  seq: number;
  size: number;
  /** The slot the film is about to fill. */
  slotIndex: number;
  language: string;
};

export function ShortlistedBeat({
  roomId,
  beat,
  phase,
  seq,
  size,
  slotIndex,
  language,
}: ShortlistedBeatProps) {
  const { t } = useTranslation('swipe');
  const { t: tm } = useTranslation('match');
  const reduced = useReducedMotion();
  const films = useShortlistCards(roomId, beat ? [beat.title_id] : [], language);
  const film = beat ? films.get(beat.title_id) : undefined;
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);

  const countText =
    beat && beat.likes !== null && beat.of !== null
      ? tm(beat.likes === beat.of ? 'count.unanimous' : 'count.majority', {
          likes: beat.likes,
          of: beat.of,
        })
      : '';

  // The scrim comes in with the first beat, stays across beats in a row and goes in the tail.
  const scrim = useSharedValue(0);
  useEffect(() => {
    scrim.set(withTiming(phase === 'tail' ? 0 : 1, { duration: duration.fast }));
  }, [phase, scrim]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));

  // Announced once per beat, assertively; focus does not move. The vote count is left out when
  // the event has not arrived yet.
  const announced = useRef(0);
  useEffect(() => {
    if (!beat || announced.current === seq) return;
    announced.current = seq;
    const values = { count: beat.count, of: size, votes: countText };
    AccessibilityInfo.announceForAccessibility(
      (film
        ? t('shortlisted.a11y', { ...values, title: film.title })
        : t('shortlisted.a11yNoTitle', values)
      ).trim(),
    );
    // Once per beat; later changes (the film's card, the count) are not announced again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame((prev) =>
      prev?.width === width && prev.height === height ? prev : { width, height },
    );
  };

  // Half the card's width, shrunk if the frame can't hold the two lines, the poster and the count.
  const posterWidth = frame
    ? Math.max(0, Math.min((frame.width - 40) / 2, (frame.height - COLUMN_EXTRA) / 1.5))
    : 0;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={onLayout}
      testID="shortlisted"
    >
      {/* Takes every touch over the stack. The buttons row has its own catcher in the footer. */}
      <Animated.View
        style={scrimStyle}
        className="absolute inset-0 bg-overlay-scrim"
        testID="shortlisted-scrim"
      />
      {frame && beat ? (
        <Column
          key={seq}
          phase={phase}
          slotIndex={slotIndex}
          posterWidth={posterWidth}
          film={film}
          countText={countText}
          reduced={reduced}
          title={t('shortlisted.title', { count: beat.count, of: size })}
        />
      ) : null}
    </View>
  );
}

function Column({
  phase,
  slotIndex,
  posterWidth,
  film,
  countText,
  reduced,
  title,
}: {
  phase: BeatPhase | null;
  slotIndex: number;
  posterWidth: number;
  film: ShortlistFilm | undefined;
  countText: string;
  reduced: boolean;
  title: string;
}) {
  const poster = useRef<ComponentRef<typeof View>>(null);
  const progress = useSharedValue(0);
  // Where the poster goes: from its centre to the slot's, scaled to the slot's width.
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const end = useSharedValue(1);
  const flies = useSharedValue(0);
  // The two lines fade out as the poster starts to fly (they keep their room, so it doesn't move).
  const lines = useSharedValue(1);

  useEffect(() => {
    if (phase !== 'fly') return;
    let cancelled = false;
    lines.set(withTiming(0, { duration: duration.fast }));
    void Promise.all([measureView(poster.current), measureSlot(slotIndex)]).then(([from, to]) => {
      if (cancelled) return;
      if (from && to && !reduced) {
        dx.set(to.x + to.width / 2 - (from.x + from.width / 2));
        dy.set(to.y + to.height / 2 - (from.y + from.height / 2));
        end.set(to.width / from.width);
        flies.set(1);
      }
      progress.set(withTiming(1, { duration: duration.slow, easing: easing.standard }));
    });
    return () => {
      cancelled = true;
    };
  }, [phase, slotIndex, reduced, dx, dy, end, flies, progress, lines]);

  const posterStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const flying = flies.get() === 1;
    return {
      // With nowhere to fly (Reduce Motion, or no slot found) the poster fades out instead.
      opacity: flying ? 1 : 1 - p,
      transform: [
        { translateX: dx.get() * p },
        { translateY: dy.get() * p },
        { scale: flying ? 1 + (end.get() - 1) * p : 1 },
      ],
      // The scale shrinks the corners too: this lands on the slot's 4 points.
      borderRadius: interpolate(
        p,
        [0, 1],
        [RADIUS_FROM, flying ? RADIUS_TO / end.get() : RADIUS_FROM],
      ),
    };
  });
  const linesStyle = useAnimatedStyle(() => ({ opacity: lines.get() }));

  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
      <View className="items-center gap-3 px-5">
        <Animated.View style={linesStyle}>
          <Animated.View entering={reduced ? layout.fadeIn : layout.popIn.delay(duration.fast)}>
            <Text variant="display-m" tone="marquee" className="text-center" numberOfLines={2}>
              {title}
            </Text>
          </Animated.View>
        </Animated.View>
        <Animated.View
          ref={poster}
          collapsable={false}
          entering={reduced ? layout.fadeIn : layout.popIn}
          style={[{ width: posterWidth, height: posterWidth * 1.5 }, posterStyle]}
          className="overflow-hidden bg-bg-raised elevation-card"
          testID="shortlisted-poster"
        >
          {film?.posterUri ? (
            <Poster
              source={{ uri: film.posterUri }}
              thumbhash={film.thumbhash}
              accessibilityLabel={film.title}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Icon name="film" size={48} color="text-muted" />
            </View>
          )}
          <View pointerEvents="none" className="absolute inset-0 border-2 border-marquee-default" />
        </Animated.View>
        {/* Empty until the event brings the count, but it keeps its height: nothing moves. */}
        <Animated.View style={linesStyle}>
          <Animated.View
            key={countText === '' ? 'empty' : 'count'}
            entering={countText === '' ? undefined : layout.fadeIn}
          >
            <Text variant="title-m" tone="primary" numberOfLines={1}>
              {countText === '' ? ' ' : countText}
            </Text>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}
