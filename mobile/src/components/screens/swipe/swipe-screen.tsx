import type { RoomSeat } from '@flimme/contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useStore } from 'zustand';

import { RoomBanner } from '@/components/screens/room/room-banner';
import { Pressable } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/screen';
import { useRoom } from '@/features/room';
import { FRAME_METER_ON } from '@/features/dev/frame-meter';
import { asksRewatch, rewatchAnswer, type AnswerKind } from '@/features/swipe/answer';
import { createHintSignals } from '@/features/swipe/hints';
import type { Direction } from '@/features/swipe/feel';
import { useNearMiss } from '@/features/swipe/near-miss';
import { useFlights } from '@/features/swipe/use-flights';
import { useSwipe } from '@/features/swipe/use-swipe';
import { timing } from '@/theme/motion';

import { ActionRow } from './action-row';
import { CardStack } from './card-stack';
import { FrameMeter } from './frame-meter';
import { SwipeHints } from './hints';
import { SwipeNearMiss } from './near-miss';
import { useSeenLift } from './seen-lift';
import { SeenQuestion } from './seen-question';
import { LIT } from './swipe-card';
import { SwipeTopBar } from './top-bar';

// The swipe screen (docs/design/screens/swipe.md): the stack, the buttons row, and the empty
// slots the later tasks fill (top bar, near miss, hints, the rewatch question). The room layout
// decides when this screen shows; it never moves itself.

const ANSWER_LABEL = {
  like: 'answers.like',
  nope: 'answers.nope',
  super_like: 'answers.super',
  seen: 'answers.seen',
  seen_rewatch: 'answers.like',
} as const satisfies Record<AnswerKind, string>;

export function SwipeScreen({
  roomId,
  seat,
  hideSeen = false,
}: {
  roomId: string;
  seat: RoomSeat;
  /** The room hides seen films: the Seen it hint says they leave the game. */
  hideSeen?: boolean;
}) {
  const { t } = useTranslation('swipe');
  const { t: tc } = useTranslation();
  const screen = useWindowDimensions();
  const swipe = useSwipe(roomId, seat, screen.width);
  const dragProgress = useSharedValue(0);
  const lit = useSharedValue<number>(LIT.none);
  const dragging = useSharedValue(0);
  const [swipes, setSwipes] = useState(0);
  // Where the last answered card went, so Undo can bring it back from there.
  const lastThrow = useRef<{ direction: Direction } | null>(null);
  // This game's hint signals, and how many super likes the hint announces.
  const [hintSignals] = useState(createHintSignals);
  const [superLikesPerGame] = useState(seat.super_likes_left);

  const { stack } = swipe;
  const topId = useStore(stack, (s) => s.mounted[0]?.title_id);
  const status = useStore(stack, (s) => s.status);
  const maxAge = useRoom(roomId).data?.max_age;
  const nearMiss = useNearMiss(roomId, topId);

  const { flying, throwCard, landed } = useFlights(swipe.answer);

  // Every answer from a button, a screen reader action or a finger comes through here.
  const asks = asksRewatch(swipe.seenRule);
  const { lift, drop } = useSeenLift();
  // The title whose rewatch question is open. A ref too, so a double tap on Yes can't answer twice.
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);
  const setHold = useCallback((value: number | null) => {
    heldRef.current = value;
    setHeld(value);
  }, []);

  // Closes with no vote: the card goes back unless a finger already has it.
  const close = useCallback(
    (springBack: boolean) => {
      if (heldRef.current === null) return;
      setHold(null);
      drop(springBack);
    },
    [drop, setHold],
  );

  const hold = useCallback(
    (titleId: number) => {
      if (heldRef.current !== null || stack.getState().mounted[0]?.title_id !== titleId) return;
      setHold(titleId);
      lift();
    },
    [stack, lift, setHold],
  );

  // A match (or the finale) closes the question without a vote; so does the card changing.
  useEffect(() => {
    if (swipe.locked) close(true);
  }, [swipe.locked, close]);
  useEffect(() => {
    if (heldRef.current !== null && heldRef.current !== topId) setHold(null);
  }, [topId, setHold]);

  const answerRewatch = (yes: boolean) => {
    if (heldRef.current === null) return;
    setHold(null);
    throwAndSay(rewatchAnswer(yes), false, yes ? 'right' : 'left');
  };

  const throwAndSay = (kind: AnswerKind, fromGesture: boolean, direction?: Direction) => {
    // Seen it from a button or a screen reader asks first; the card isn't answered yet.
    if (kind === 'seen' && !direction && !fromGesture && asks) {
      if (topId !== undefined) hold(topId);
      return null;
    }
    // Any other answer while the question is open replaces it.
    if (heldRef.current !== null) setHold(null);
    const flight = throwCard(kind, fromGesture, direction);
    if (flight) {
      lastThrow.current = { direction: flight.direction };
      setSwipes((n) => n + 1);
      hintSignals.getState().record(kind);
      AccessibilityInfo.announceForAccessibility(
        t('a11y.thrown', { answer: tc(ANSWER_LABEL[kind]), title: flight.card.title }),
      );
    }
    return flight;
  };

  // Undo: the card is back in the stack at once; a copy still in the air is called back.
  const undoLast = useCallback(() => {
    const back = swipe.undo(lastThrow.current?.direction);
    if (!back) return;
    landed(back.card.title_id);
    AccessibilityInfo.announceForAccessibility(t('a11y.undone', { title: back.card.title }));
  }, [swipe, landed, t]);

  const canAnswer = status === 'ready' && !swipe.locked;
  const rowStyle = useAnimatedStyle(() => ({
    opacity: withTiming(held === null ? 1 : 0, timing.base),
  }));

  return (
    <Screen
      padded={false}
      footer={
        <View>
          <Animated.View
            style={rowStyle}
            pointerEvents={held === null ? 'auto' : 'none'}
            accessibilityElementsHidden={held !== null}
            importantForAccessibility={held === null ? 'auto' : 'no-hide-descendants'}
          >
            <ActionRow
              canAnswer={canAnswer}
              superLikesLeft={swipe.superLikesLeft}
              canUndo={swipe.canUndo}
              onUndo={undoLast}
              onAnswer={(kind) => throwAndSay(kind, false)}
              lit={lit}
            />
          </Animated.View>
          <SeenQuestion
            open={held !== null}
            onYes={() => answerRewatch(true)}
            onNo={() => answerRewatch(false)}
            onEscape={() => close(true)}
          />
        </View>
      }
    >
      <SwipeTopBar roomId={roomId} />
      <RoomBanner roomId={roomId} waitingVotes={swipe.waitingVotes} />
      <SwipeNearMiss titleId={topId} nearMiss={nearMiss} />
      {held !== null ? (
        // A tap anywhere outside the two answers puts the card back (the card's own tap does too).
        <Pressable
          accessibilityLabel={tc('actions.close')}
          haptic={false}
          onPress={() => close(true)}
          accessibilityElementsHidden
          importantForAccessibility="no"
          className="absolute inset-0"
        />
      ) : null}
      <View className="flex-1 px-5" pointerEvents="box-none">
        <CardStack
          swipe={swipe}
          maxAge={maxAge}
          glowId={nearMiss ? topId : undefined}
          flying={flying}
          throwCard={throwAndSay}
          asksSeen={asks}
          onHold={hold}
          onGrab={() => close(false)}
          held={held !== null}
          onDismiss={() => close(true)}
          landed={landed}
          dragProgress={dragProgress}
          lit={lit}
          dragging={dragging}
        />
      </View>
      <SwipeHints
        hideSeen={hideSeen}
        stack={stack}
        signals={hintSignals}
        superLikes={superLikesPerGame}
      />
      {FRAME_METER_ON ? (
        <FrameMeter dragging={dragging} flights={flying.length} swipes={swipes} />
      ) : null}
    </Screen>
  );
}
