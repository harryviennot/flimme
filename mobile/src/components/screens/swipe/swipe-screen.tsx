import type { RoomSeat } from '@flimme/contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useStore } from 'zustand';

import { RoomBanner } from '@/components/screens/room/room-banner';
import { Screen } from '@/components/ui/screen';
import { useFirstCardView } from '@/features/analytics/use-first-card';
import { useRoom } from '@/features/room';
import { FRAME_METER_ON } from '@/features/dev/frame-meter';
import { asksRewatch, offersRewatch, type AnswerKind } from '@/features/swipe/answer';
import { createHintSignals } from '@/features/swipe/hints';
import type { Direction } from '@/features/swipe/feel';
import { useNearMiss } from '@/features/swipe/near-miss';
import { useRewatchChip } from '@/features/swipe/rewatch-chip';
import { useFlights } from '@/features/swipe/use-flights';
import { useShortlistView } from '@/features/shortlist/context';
import { useSwipe } from '@/features/swipe/use-swipe';
import { likesOf } from '@/features/solo/session';
import { useScreenReader } from '@/lib/screen-reader';

import { ActionRow } from './action-row';
import { CardStack } from './card-stack';
import { FrameMeter } from './frame-meter';
import { SwipeHints } from './hints';
import { SwipeNearMiss } from './near-miss';
import { RewatchChip } from './rewatch-chip';
import { ShortlistedBeat } from './shortlisted';
import { LIT } from './swipe-card';
import { SoloTopBar } from './solo-top-bar';
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
  const { t: tc, i18n } = useTranslation();
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
  const [superLikesPerGame] = useState(seat.super_likes_left ?? 0);

  const { stack } = swipe;
  const topId = useStore(stack, (s) => s.mounted[0]?.title_id);
  const status = useStore(stack, (s) => s.status);
  const maxAge = useRoom(roomId).data?.max_age;
  useFirstCardView(roomId, status === 'ready' && topId !== undefined && !swipe.solo);
  const nearMiss = useNearMiss(roomId, topId);

  const { flying, throwCard, landed } = useFlights(swipe.answer);

  // The rewatch chip (swipe.md#seen-it-the-rewatch-question): a Seen it is a plain `seen` that
  // flies up at once; in a room that allows rewatches the chip then offers Yes.
  const asks = asksRewatch(swipe.seenRule);
  const screenReader = useScreenReader();
  const chip = useRewatchChip(screenReader);
  const { clear: clearChip, offer: offerChip } = chip;

  // The room moving on (a match, the finale) takes the chip away.
  useEffect(() => {
    if (swipe.locked) clearChip();
  }, [swipe.locked, clearChip]);

  // Every answer from a button, a screen reader action or a finger comes through here.
  const throwAndSay = (kind: AnswerKind, fromGesture: boolean, direction?: Direction) => {
    // Any answer replaces the chip of the one before.
    clearChip();
    const flight = throwCard(kind, fromGesture, direction);
    if (flight) {
      lastThrow.current = { direction: flight.direction };
      setSwipes((n) => n + 1);
      hintSignals.getState().record(kind);
      if (offersRewatch(kind, swipe.seenRule)) offerChip(flight.card.title_id);
      AccessibilityInfo.announceForAccessibility(
        t('a11y.thrown', { answer: tc(ANSWER_LABEL[kind]), title: flight.card.title }),
      );
    }
    return flight;
  };

  // Yes on the chip: the answer becomes a like, through the queue (an undo, then the new vote).
  const rewatchYes = () => {
    const titleId = chip.claim();
    if (titleId !== null && !swipe.rewatch(titleId)) clearChip();
  };

  // Undo: the card is back in the stack at once; a copy still in the air is called back.
  const undoLast = useCallback(() => {
    const back = swipe.undo(lastThrow.current?.direction);
    if (!back) return;
    clearChip();
    landed(back.card.title_id);
    AccessibilityInfo.announceForAccessibility(t('a11y.undone', { title: back.card.title }));
  }, [swipe, landed, clearChip, t]);

  // Solo: the likes count for the top bar, and a checkpoint on top takes the answer buttons (not Undo).
  const entries = useStore(swipe.soloSession, (s) => s.entries);
  const checkpointOpen = useStore(swipe.soloSession, (s) => s.open !== null);
  const canAnswer = status === 'ready' && !swipe.locked && !(swipe.solo && checkpointOpen);
  // The shortlisted beat: the toast and the glow leave while it plays and come back after.
  // Solo has no near miss at all.
  const shortlist = useShortlistView();
  const beating = shortlist.active;
  const shownNearMiss = beating || swipe.solo ? null : nearMiss;
  const chipShown = chip.titleId !== null || chip.done;

  return (
    <Screen
      padded={false}
      footer={
        <View>
          <ActionRow
            canAnswer={canAnswer}
            superLikesLeft={swipe.superLikesLeft}
            canUndo={swipe.canUndo}
            undoShortlisted={swipe.undoShortlisted}
            onUndo={undoLast}
            onAnswer={(kind) => throwAndSay(kind, false)}
            lit={lit}
            hideSuperCount={swipe.solo}
          />
          {beating ? (
            // The buttons keep their look during the beat; a press does nothing, with no haptic.
            <View className="absolute inset-0" testID="shortlisted-catcher" />
          ) : null}
        </View>
      }
    >
      {swipe.solo ? (
        <SoloTopBar roomId={roomId} likes={likesOf(entries).length} />
      ) : (
        <SwipeTopBar roomId={roomId} count={swipe.count} done={status === 'empty'} />
      )}
      <RoomBanner roomId={roomId} waitingVotes={swipe.waitingVotes} />
      <SwipeNearMiss titleId={topId} nearMiss={shownNearMiss} shortlistShown={shortlist.size > 1} />
      <View className="flex-1 px-5" pointerEvents="box-none">
        <CardStack
          swipe={swipe}
          roomId={roomId}
          maxAge={maxAge}
          glowId={shownNearMiss ? topId : undefined}
          flying={flying}
          throwCard={throwAndSay}
          landed={landed}
          dragProgress={dragProgress}
          lit={lit}
          dragging={dragging}
        />
        {beating ? (
          <ShortlistedBeat
            roomId={roomId}
            beat={shortlist.beat}
            phase={shortlist.phase}
            seq={shortlist.seq}
            size={shortlist.size}
            slotIndex={shortlist.landed.length}
            language={i18n.language}
          />
        ) : null}
      </View>
      {/* The hint line: the chip takes its place after a Seen it. A room that allows rewatches keeps
          the line's height, so the stack never changes size when the chip comes and goes. */}
      <View className={asks ? 'min-h-12' : undefined}>
        <View
          style={{ opacity: chipShown ? 0 : 1 }}
          pointerEvents={chipShown ? 'none' : 'auto'}
          accessibilityElementsHidden={chipShown}
          importantForAccessibility={chipShown ? 'no-hide-descendants' : 'auto'}
        >
          <SwipeHints
            hideSeen={hideSeen}
            stack={stack}
            signals={hintSignals}
            superLikes={superLikesPerGame}
          />
        </View>
        <RewatchChip open={chip.titleId !== null} done={chip.done} onYes={rewatchYes} />
      </View>
      {FRAME_METER_ON ? (
        <FrameMeter dragging={dragging} flights={flying.length} swipes={swipes} />
      ) : null}
    </Screen>
  );
}
