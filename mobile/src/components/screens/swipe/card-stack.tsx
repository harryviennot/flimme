import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useStore } from 'zustand';

import type { AnswerKind } from '@/features/swipe/answer';
import { openTrailer } from '@/features/swipe/trailer';
import { backServices, cardMeta, cardServices, trailerAllowed } from '@/features/swipe/card-props';
import { STACK_STEP, type Direction } from '@/features/swipe/feel';
import type { Flying } from '@/features/swipe/use-flights';
import type { Swipe } from '@/features/swipe/use-swipe';
import { formatList } from '@/features/lobby/names';

import { CheckpointCard } from '@/components/screens/solo/checkpoint-card';
import { CapCard, OutOfFilmsCard } from '@/components/screens/solo/end-cards';
import { useLeaveSoloTo } from '@/features/solo/leave';
import { likesOf } from '@/features/solo/session';

import { DoneCard, LoadingCard, WaitingCard } from './status-cards';
import { SwipeCard } from './swipe-card';

// The stack (swipe.md#the-stack): three mounted cards, the top one takes the finger, thrown
// cards finish their flight on their own. Cards render sorted by film so React never moves a
// card's view when it goes from the stack to the air; `zIndex` does the stacking.

/** The card's shape: 345 by 518 on a 393-point phone. */
const CARD_RATIO = 345 / 518;

const KIND: Record<Direction, AnswerKind> = { right: 'like', left: 'nope', up: 'seen' };
const ACTION: Record<string, AnswerKind> = {
  like: 'like',
  nope: 'nope',
  superLike: 'super_like',
  seen: 'seen',
};

export type CardStackProps = {
  swipe: Swipe;
  roomId: string;
  /** `rooms.max_age`: under 13 there is no Trailer (M7.3). */
  maxAge: number | null | undefined;
  /** The film whose card takes the like glow (a near miss), if any. */
  glowId?: number;
  flying: Flying[];
  throwCard: (kind: AnswerKind, fromGesture: boolean) => Flying | null;
  /** The room asks the rewatch question under Seen it. */
  asksSeen: boolean;
  /** Seen it was released past the line (the card is held); the screen opens the question. */
  onHold: (titleId: number) => void;
  /** A finger took the held card. */
  onGrab: () => void;
  /** A tap on the card while the question is open (it puts the card back instead of flipping). */
  held: boolean;
  onDismiss: () => void;
  landed: (titleId: number) => void;
  dragProgress: SharedValue<number>;
  lit: SharedValue<number>;
  dragging: SharedValue<number>;
};

export function CardStack({
  swipe,
  roomId,
  maxAge,
  glowId,
  flying,
  throwCard,
  asksSeen,
  onHold,
  onGrab,
  held,
  onDismiss,
  landed,
  dragProgress,
  lit,
  dragging,
}: CardStackProps) {
  const { t, i18n } = useTranslation('swipe');
  const { t: tc } = useTranslation('common');
  const screen = useWindowDimensions();
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const { stack } = swipe;
  const mounted = useStore(stack, (s) => s.mounted);
  const status = useStore(stack, (s) => s.status);
  const liked = useStore(stack, (s) => s.liked);
  const flipped = useStore(stack, (s) => s.flipped);
  const capped = useStore(stack, (s) => s.capped);
  // Solo (swipe.md#solo): the session's likes feed the checkpoint and the end cards.
  const entries = useStore(swipe.soloSession, (s) => s.entries);
  const checkpoint = useStore(swipe.soloSession, (s) => s.open);
  const likes = likesOf(entries);
  const checkpointOn = swipe.solo && checkpoint !== null && mounted.length > 0;
  const leaveTo = useLeaveSoloTo(roomId);
  const openPick = () => router.push(`/room/${roomId}/pick`);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setRoom((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
  };

  // As wide as the room allows and no taller than it leaves, with a peek for the cards behind.
  const size = room
    ? (() => {
        const height = Math.min(room.height - STACK_STEP * 2, room.width / CARD_RATIO);
        return { width: Math.max(0, height * CARD_RATIO), height: Math.max(0, height) };
      })()
    : null;

  const language = i18n.language;
  const top = mounted[0];

  const labelOf = (card: NonNullable<typeof top>) => {
    if (flipped) {
      // The whole back as one reading: the title and score, the story, the credits, the services.
      const synopsis = card.overview ?? t('card.noSynopsis');
      const parts = [
        card.tmdb_score !== null
          ? t('a11y.cardBack', { title: card.title, rating: card.tmdb_score, synopsis })
          : t('a11y.cardBackNoRating', { title: card.title, synopsis }),
      ];
      if (card.directors.length > 0) {
        parts.push(tc('card.director', { name: formatList(card.directors, language) }));
      }
      if (card.cast.length > 0) {
        parts.push(tc('card.cast', { names: formatList(card.cast.slice(0, 5), language) }));
      }
      const services = backServices(card, undefined).map((s) => s.name);
      if (services.length > 0) {
        parts.push(t('a11y.cardBackServices', { services: formatList(services, language) }));
      }
      return parts.join(' ');
    }
    const meta = cardMeta(card, language);
    const services = cardServices(card);
    return services.length > 0
      ? t('a11y.card', { title: card.title, meta, services: formatList(services, language) })
      : t('a11y.cardBare', { title: card.title, meta });
  };

  const actions = [
    { name: 'like', label: t('a11y.actions.like') },
    { name: 'nope', label: t('a11y.actions.nope') },
    ...(swipe.superLikesLeft > 0
      ? [{ name: 'superLike', label: t('a11y.actions.superLike') }]
      : []),
    { name: 'seen', label: t('a11y.actions.seen') },
    { name: 'flip', label: t('a11y.actions.flip') },
    // The Trailer button sits inside the card, which is one element for a screen reader.
    ...(flipped && top?.trailer_key && trailerAllowed(maxAge)
      ? [{ name: 'trailer', label: t('a11y.actions.trailer') }]
      : []),
  ];

  const flip = () => {
    if (held) return onDismiss();
    stack.getState().setFlipped(!stack.getState().flipped);
  };
  const onAction = (name: string) => {
    if (name === 'flip') return flip();
    if (name === 'trailer')
      return trailerAllowed(maxAge) ? openTrailer(top?.trailer_key) : undefined;
    const kind = ACTION[name];
    if (kind) throwCard(kind, false);
  };
  const onRelease = (titleId: number, direction: Direction) => {
    if (stack.getState().mounted[0]?.title_id !== titleId) return;
    throwCard(KIND[direction], true);
  };

  const cards = [
    ...mounted.map((card, depth) => ({ card, depth, flight: undefined as Flying | undefined })),
    ...flying.map((flight) => ({ card: flight.card, depth: 0, flight })),
  ].sort((a, b) => a.card.title_id - b.card.title_id);

  return (
    <View
      testID="swipe-stack"
      className="flex-1 items-center justify-center"
      pointerEvents="box-none"
      onLayout={onLayout}
    >
      {size ? (
        <View style={{ width: size.width, height: size.height }} pointerEvents="box-none">
          {mounted.length === 0 ? (
            status === 'waiting_offline' ? (
              <WaitingCard size={size} />
            ) : status === 'empty' && swipe.solo ? (
              <SoloEnd
                capped={capped}
                size={size}
                screenWidth={screen.width}
                likes={likes}
                imageBase={swipe.imageBase}
                onPick={openPick}
                onMyFilms={leaveTo.myFilms}
                onHost={leaveTo.host}
              />
            ) : status === 'empty' ? (
              <DoneCard size={size} roomId={roomId} liked={liked} />
            ) : (
              <LoadingCard size={size} onRetry={() => stack.getState().onOnline()} />
            )
          ) : null}
          {cards.map(({ card, depth, flight }) => (
            <SwipeCard
              key={card.title_id}
              card={card}
              depth={depth}
              flight={flight}
              returning={
                swipe.returning?.card.title_id === card.title_id ? swipe.returning : undefined
              }
              flipped={card === top ? flipped : false}
              glow={glowId === card.title_id}
              size={size}
              screen={screen}
              text={{
                language,
                imageBase: swipe.imageBase,
                screenWidth: screen.width,
                noSynopsis: t('card.noSynopsis'),
                maxAge,
              }}
              dragProgress={dragProgress}
              lit={lit}
              dragging={dragging}
              locked={swipe.locked || swipe.beating || checkpointOn}
              a11y={{ label: labelOf(card), actions, onAction }}
              asksSeen={asksSeen}
              onHold={onHold}
              onGrab={onGrab}
              onRelease={onRelease}
              onFlip={flip}
              onLanded={landed}
            />
          ))}
          {checkpointOn ? (
            <CheckpointCard
              size={size}
              screen={screen}
              likes={likes}
              imageBase={swipe.imageBase}
              onPick={openPick}
              onDismiss={() => swipe.soloSession.getState().dismiss()}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** No card left in a solo session: the day's cap, or every film of the filters. */
function SoloEnd({ capped, ...props }: { capped: boolean } & React.ComponentProps<typeof CapCard>) {
  return capped ? <CapCard {...props} /> : <OutOfFilmsCard {...props} onHost={undefined} />;
}
