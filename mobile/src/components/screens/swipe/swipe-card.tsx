import type { NextCard } from '@flimme/contract';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AccessibilityActionEvent } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  ReduceMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MovieCard } from '@/components/shared/movie-card';
import type { AnswerKind } from '@/features/swipe/answer';
import { toMovieCard, type CardTextOptions } from '@/features/swipe/card-props';
import {
  CARRY_X,
  CARRY_Y,
  commitLines,
  decideRelease,
  directionOf,
  LIGHT_FROM,
  PIVOT,
  progressOf,
  returnStart,
  REDUCED_SLIDE,
  SECOND_CARD_SCALE,
  STACK_STEP,
  THIRD_CARD_SCALE,
  THROW_DISTANCE,
  tiltFor,
  TOUCH_SLOP,
  type Direction,
} from '@/features/swipe/feel';
import { isTrailerTap, markTrailerTouch, openTrailerUrl } from '@/features/swipe/trailer';
import { registerTopCard, useCardMotion } from '@/features/swipe/top-card';
import { haptics } from '@/lib/haptics';
import { tokens } from '@/theme/generated/tokens';
import { duration, easing, layout, spring, timing } from '@/theme/motion';

// One card of the stack. The card on top takes a drag and a tap; the others only sit behind.
// A thrown card stays mounted and finishes its flight by itself (the stack hands it a `flight`),
// so the next card is draggable at once. Everything per frame runs on the UI thread: shared
// values, worklets and Gesture Handler. JavaScript hears about a card three times at most: the
// commit tick, the release, and the end of the flight.

/** The stamp a flight forces: its direction's (like, nope, seen), or SUPER for a super like. */
function forcedOf(kind: AnswerKind, direction: Direction): number {
  if (kind === 'super_like') return 4;
  return direction === 'left' ? 2 : direction === 'up' ? 3 : 1;
}
/** What `lit` holds for the matching button: 0 none, then the answer's code. */
export const LIT = { none: 0, nope: 1, like: 2, seen: 3 } as const;

export type Flight = {
  kind: AnswerKind;
  /** Defaults to the kind's own: like and super right, nope left, seen up. */
  direction?: Direction;
  fromGesture: boolean;
  flipped: boolean;
};

export type SwipeCardProps = {
  card: NextCard;
  /** 0 on top, 1 and 2 behind. Ignored while flying. */
  depth: number;
  flight?: Flight;
  /** Undo brought this card back: it comes in from the side it left (or fades, with Reduce Motion). */
  returning?: { kind: AnswerKind; direction?: Direction };
  flipped: boolean;
  /** A near miss: the card takes the like glow, front and back. */
  glow?: boolean;
  /** The card's size in points, from the stack's room. */
  size: { width: number; height: number };
  /** The screen's size: the commit lines and the flight's reach come from it. */
  screen: { width: number; height: number };
  text: CardTextOptions;
  /** 0 to 1: how far the top card is dragged, so the one behind grows toward full size. */
  dragProgress: SharedValue<number>;
  /** The button to light (`LIT`). */
  lit: SharedValue<number>;
  /** 1 while a finger is on the top card, for the frame meter. */
  dragging: SharedValue<number>;
  /** The room moved on: no more input. */
  locked: boolean;
  a11y: {
    label: string;
    actions: { name: string; label: string }[];
    onAction: (name: string) => void;
  };
  /** The room asks "Watch it again tonight?": a release toward Seen it holds the card instead of throwing. */
  asksSeen?: boolean;
  /** Seen it was released past the line: the screen lifts the card and opens the question. */
  onHold?: (titleId: number) => void;
  /** A finger took the held card: the question closes and the card is the finger's. */
  onGrab?: () => void;
  onRelease: (titleId: number, direction: Direction) => void;
  onFlip: () => void;
  onLanded: (titleId: number) => void;
};

export function SwipeCard(props: SwipeCardProps) {
  const { card, depth, flight, flipped, size, screen, dragProgress, lit, dragging, locked } = props;
  const { onLanded, onRelease, onFlip, onHold, onGrab, asksSeen } = props;
  const { i18n } = useTranslation();
  const reduced = useReducedMotion();
  const motion = useCardMotion();
  const { x, y, forced, forcedProgress } = motion;
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const touching = useSharedValue(0);
  const crossed = useSharedValue(0);
  // A card that returns starts invisible: it is placed off to its side before it shows.
  const fade = useSharedValue(props.returning ? 0 : 1);
  const depthValue = useSharedValue(depth);
  const isTop = depth === 0 && !flight;
  const isTopValue = useSharedValue(isTop ? 1 : 0);
  const titleId = card.title_id;
  const lines = commitLines(screen.width, screen.height);

  useEffect(() => {
    isTopValue.set(isTop ? 1 : 0);
    depthValue.set(withSpring(flight ? 0 : depth, spring.snappy));
  }, [depth, flight, isTop, isTopValue, depthValue]);

  useEffect(() => {
    if (!isTop) return;
    registerTopCard(motion);
    return () => registerTopCard(null);
    // The values are stable for the card's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop]);

  // The flight: from a finger it already runs, from a button it starts here with the stamp at full.
  const fly = (direction: Direction, vx: number, vy: number) => {
    'worklet';
    const side = direction === 'left' ? -1 : 1;
    if (reduced) {
      // A short slide toward the answer's side with a fade, not a flight across the screen.
      const slide = direction === 'up' ? 0 : side * screen.width * REDUCED_SLIDE;
      // Reanimated would skip these under Reduce Motion; the slide and fade are what replaces
      // the flight, so they run.
      const short = { ...timing.base, reduceMotion: ReduceMotion.Never };
      x.set(withTiming(x.get() + slide, short));
      y.set(
        withTiming(direction === 'up' ? y.get() - screen.height * REDUCED_SLIDE : y.get(), short),
      );
      fade.set(
        withTiming(0, short, (finished) => {
          if (finished) scheduleOnRN(onLanded, titleId);
        }),
      );
      return;
    }
    const targetX =
      direction === 'up' ? x.get() + vx * CARRY_X : side * screen.width * THROW_DISTANCE;
    const targetY = direction === 'up' ? -screen.height * THROW_DISTANCE : y.get() + vy * CARRY_Y;
    const distance = direction === 'up' ? Math.abs(targetY - y.get()) : Math.abs(targetX - x.get());
    const speed = Math.abs(direction === 'up' ? vy : vx);
    // The card carries the finger's speed, within the exit duration and a fast one.
    const ms =
      speed > 0
        ? Math.min(duration.slow, Math.max(duration.fast, (distance / speed) * 1000))
        : duration.slow;
    const config = { duration: ms, easing: easing.exit };
    x.set(
      withTiming(targetX, config, (finished) => {
        if (finished) scheduleOnRN(onLanded, titleId);
      }),
    );
    y.set(withTiming(targetY, config));
  };

  useEffect(() => {
    if (!flight || flight.fromGesture) return;
    const direction =
      flight.direction ??
      (flight.kind === 'nope' ? 'left' : flight.kind === 'seen' ? 'up' : 'right');
    forced.set(forcedOf(flight.kind, direction));
    forcedProgress.set(withTiming(1, { duration: duration.instant, easing: easing.standard }));
    fly(direction, 0, 0);
    // A flight starts once, when the card is handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  // Undo: the reverse of the throw (`timing.base`), from the side the card left. A card still in
  // the air turns around where it is; one that landed enters from the side. Under Reduce Motion
  // the card fades back in place.
  const returning = props.returning;
  useEffect(() => {
    if (!returning) return;
    cancelAnimation(x);
    cancelAnimation(y);
    forced.set(0);
    forcedProgress.set(0);
    if (reduced) {
      x.set(0);
      y.set(0);
      fade.set(withTiming(1, { ...timing.base, reduceMotion: ReduceMotion.Never }));
      return;
    }
    if (fade.get() === 0) {
      // The side it left from: where the flight went (a No to the rewatch question goes left).
      const start = returnStart(
        returning.direction ??
          (returning.kind === 'nope' ? 'left' : returning.kind === 'seen' ? 'up' : 'right'),
        screen,
      );
      x.set(start.x);
      y.set(start.y);
      fade.set(1);
    }
    x.set(withTiming(0, timing.base));
    y.set(withTiming(0, timing.base));
    // Once per undo: `returning` is a new object each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning]);

  const springBack = () => {
    'worklet';
    x.set(withSpring(0, spring.card));
    y.set(withSpring(0, spring.card));
  };

  // The room moved on mid-drag: the card goes back to the middle.
  useEffect(() => {
    if (locked && !flight) {
      cancelAnimation(x);
      cancelAnimation(y);
      springBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const pan = usePanGesture({
    testID: `swipe-pan-${titleId}`,
    minDistance: TOUCH_SLOP,
    enabled: isTop && !locked,
    onBegin: () => {
      'worklet';
      // A new touch takes the card from where it is, even mid-spring.
      cancelAnimation(x);
      cancelAnimation(y);
      // Grabbing the held card closes the rewatch question; the card is the finger's again.
      if (forced.get() === 3) {
        forced.set(0);
        forcedProgress.set(0);
        if (onGrab) scheduleOnRN(onGrab);
      }
      startX.set(x.get());
      startY.set(y.get());
      touching.set(1);
      dragging.set(1);
    },
    onUpdate: (e) => {
      'worklet';
      x.set(startX.get() + e.translationX);
      y.set(startY.get() + e.translationY);
      const past = progressOf(x.get(), y.get(), lines) >= 1;
      if (past && crossed.get() === 0) {
        crossed.set(1);
        scheduleOnRN(haptics.commit);
      } else if (!past) {
        crossed.set(0);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      touching.set(0);
      dragging.set(0);
      // A drag the system cancelled, or one cut short by the room moving on, is no release.
      if (e.canceled) {
        springBack();
        return;
      }
      const direction = decideRelease(
        { dx: x.get(), dy: y.get(), vx: e.velocityX, vy: e.velocityY },
        lines,
      );
      if (direction === null) {
        springBack();
        return;
      }
      if (direction === 'up' && asksSeen && onHold) {
        // The question comes first: the screen lifts the card and holds it, nothing flies yet.
        scheduleOnRN(onHold, titleId);
        return;
      }
      fly(direction, e.velocityX, e.velocityY);
      scheduleOnRN(onRelease, titleId, direction);
    },
    onFinalize: (e) => {
      'worklet';
      touching.set(0);
      dragging.set(0);
      // Cancelled by the system or by the room moving on: back to the middle.
      if (e.canceled) springBack();
    },
  });

  // A tap that began on the Trailer button is the button's, not a flip.
  const flipUnlessTrailer = () => {
    if (!isTrailerTap()) onFlip();
  };

  const tap = useTapGesture({
    testID: `swipe-tap-${titleId}`,
    maxDistance: TOUCH_SLOP,
    enabled: isTop && !locked,
    onActivate: () => {
      'worklet';
      // A tap on the held card puts it back (the stack's onFlip decides); otherwise it flips.
      scheduleOnRN(flipUnlessTrailer);
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  // Stamps: from the drag, or forced by a button (the SUPER stamp has no drag of its own).
  const drag = useDerivedValue(() => {
    const direction = directionOf(x.get(), y.get());
    return { direction, progress: progressOf(x.get(), y.get(), lines) };
  });
  const stampOf = (code: number, direction: Direction) => () => {
    'worklet';
    if (forced.get() !== 0) return forced.get() === code ? forcedProgress.get() : 0;
    return drag.get().direction === direction ? drag.get().progress : 0;
  };
  const like = useDerivedValue(stampOf(1, 'right'));
  const nope = useDerivedValue(stampOf(2, 'left'));
  const seen = useDerivedValue(stampOf(3, 'up'));
  const superLike = useDerivedValue(() => {
    return forced.get() === 4 ? forcedProgress.get() : 0;
  });
  const stampProgress = { like, nope, seen, super: superLike };

  // The button for the answer being dragged lights up; the card behind grows with the drag.
  useAnimatedReaction(
    () => {
      if (touching.get() === 0) return LIT.none;
      const { direction, progress } = drag.get();
      if (direction === null || progress < LIGHT_FROM) return LIT.none;
      return direction === 'right' ? LIT.like : direction === 'left' ? LIT.nope : LIT.seen;
    },
    (value, previous) => {
      if (isTopValue.get() === 1 && value !== previous) lit.set(value);
    },
  );
  useAnimatedReaction(
    () => (isTopValue.get() === 1 ? drag.get().progress : -1),
    (progress) => {
      if (progress >= 0) dragProgress.set(progress);
    },
  );

  const style = useAnimatedStyle(() => {
    const d = depthValue.get();
    // With Reduce Motion the card behind is already full size: no scale.
    const behind = reduced ? 1 : SECOND_CARD_SCALE + (1 - SECOND_CARD_SCALE) * dragProgress.get();
    const pivot = size.height * PIVOT;
    return {
      opacity:
        interpolate(d, [0, 1, 2], [1, tokens.opacity['stack-near'], tokens.opacity['stack-far']]) *
        fade.get(),
      transform: [
        { translateX: x.get() },
        { translateY: y.get() + d * STACK_STEP },
        { translateY: pivot },
        { rotate: `${reduced ? 0 : tiltFor(x.get(), lines)}deg` },
        { translateY: -pivot },
        { scale: interpolate(d, [0, 1, 2], [1, behind, THIRD_CARD_SCALE]) },
      ],
    };
  });

  const view = toMovieCard(card, {
    ...props.text,
    language: i18n.language,
    onTrailer: openTrailerUrl,
    // Not passed straight on: a touch event would land in `now`.
    onTrailerTouch: () => markTrailerTouch(),
  });
  const interactive = isTop;

  return (
    // The wrapper fades a new card in; the card inside moves and fades with the drag.
    <Animated.View
      entering={layout.fadeIn}
      style={{ width: size.width, height: size.height, zIndex: flight ? 20 : 10 - depth }}
      className="absolute"
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[style, { width: size.width, height: size.height }]}
          testID={`swipe-card-${titleId}`}
          accessible={interactive}
          accessibilityLabel={interactive ? props.a11y.label : undefined}
          accessibilityActions={interactive ? props.a11y.actions : undefined}
          onAccessibilityAction={
            interactive
              ? (event: AccessibilityActionEvent) =>
                  props.a11y.onAction(event.nativeEvent.actionName)
              : undefined
          }
          accessibilityElementsHidden={!interactive}
          importantForAccessibility={interactive ? 'yes' : 'no-hide-descendants'}
        >
          {props.glow ? (
            // Behind the card, so the glow rides with the drag and the flip, and fades with it.
            <Animated.View
              testID={`swipe-glow-${titleId}`}
              pointerEvents="none"
              entering={reduced ? layout.fadeIn : layout.popIn}
              exiting={layout.fadeOut}
              className="absolute inset-0 rounded-xl bg-bg-surface glow-like"
            />
          ) : null}
          <MovieCard
            {...view}
            flipped={flight ? flight.flipped : flipped}
            stampProgress={isTop || flight ? stampProgress : undefined}
          />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
