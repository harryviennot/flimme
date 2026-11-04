import type { RoomSeat } from '@flimme/contract';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useStore } from 'zustand';

import { RoomBanner } from '@/components/screens/room/room-banner';
import { Screen } from '@/components/ui/screen';
import { FRAME_METER_ON } from '@/features/dev/frame-meter';
import type { AnswerKind } from '@/features/swipe/answer';
import { useNearMiss } from '@/features/swipe/near-miss';
import { useFlights } from '@/features/swipe/use-flights';
import { useSwipe } from '@/features/swipe/use-swipe';

import { ActionRow } from './action-row';
import { CardStack } from './card-stack';
import { FrameMeter } from './frame-meter';
import { SwipeHints } from './hints';
import { SwipeNearMiss } from './near-miss';
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
} as const satisfies Record<AnswerKind, string>;

export function SwipeScreen({ roomId, seat }: { roomId: string; seat: RoomSeat }) {
  const { t } = useTranslation('swipe');
  const { t: tc } = useTranslation();
  const screen = useWindowDimensions();
  const swipe = useSwipe(roomId, seat, screen.width);
  const dragProgress = useSharedValue(0);
  const lit = useSharedValue<number>(LIT.none);
  const dragging = useSharedValue(0);
  const [swipes, setSwipes] = useState(0);

  const { stack } = swipe;
  const topId = useStore(stack, (s) => s.mounted[0]?.title_id);
  const status = useStore(stack, (s) => s.status);
  useNearMiss(topId);

  const { flying, throwCard, landed } = useFlights(swipe.answer);

  // Every answer from a button, a screen reader action or a finger comes through here.
  const throwAndSay = useCallback(
    (kind: AnswerKind, fromGesture: boolean) => {
      const flight = throwCard(kind, fromGesture);
      if (flight) {
        setSwipes((n) => n + 1);
        AccessibilityInfo.announceForAccessibility(
          t('a11y.thrown', { answer: tc(ANSWER_LABEL[kind]), title: flight.card.title }),
        );
      }
      return flight;
    },
    [throwCard, t, tc],
  );

  // Undo: the card is back in the stack at once; a copy still in the air is called back.
  const undoLast = useCallback(() => {
    const back = swipe.undo();
    if (!back) return;
    landed(back.card.title_id);
    AccessibilityInfo.announceForAccessibility(t('a11y.undone', { title: back.card.title }));
  }, [swipe, landed, t]);

  const canAnswer = status === 'ready' && !swipe.locked;

  return (
    <Screen
      padded={false}
      footer={
        <ActionRow
          canAnswer={canAnswer}
          superLikesLeft={swipe.superLikesLeft}
          canUndo={swipe.canUndo}
          onUndo={undoLast}
          onAnswer={(kind) => throwAndSay(kind, false)}
          lit={lit}
        />
      }
    >
      <SwipeTopBar roomId={roomId} />
      <RoomBanner roomId={roomId} waitingVotes={swipe.waitingVotes} />
      <SwipeNearMiss titleId={topId} />
      <View className="flex-1 px-5">
        <CardStack
          swipe={swipe}
          flying={flying}
          throwCard={throwAndSay}
          landed={landed}
          dragProgress={dragProgress}
          lit={lit}
          dragging={dragging}
        />
      </View>
      <SwipeHints roomId={roomId} />
      <SeenQuestion open={false} />
      {FRAME_METER_ON ? (
        <FrameMeter dragging={dragging} flights={flying.length} swipes={swipes} />
      ) : null}
    </Screen>
  );
}
