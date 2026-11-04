import type { NextCard } from '@flimme/contract';
import { useCallback, useState } from 'react';

import { haptics } from '@/lib/haptics';

import type { AnswerKind } from './answer';
import type { AnsweredCard } from './card-stack';
import type { Direction } from './feel';

// The cards in the air. An answer takes the card off the stack at once (the next one is
// already draggable); the card itself keeps flying here until its animation ends, so up to
// three can be in flight and nothing waits for them.

export type Flying = {
  card: NextCard;
  kind: AnswerKind;
  /** Where it flies: No to the rewatch question is a `seen` that goes left like a nope. */
  direction: Direction;
  /** Whether the card showed its back when it left. */
  flipped: boolean;
  /** A finger threw it and its animation already runs; otherwise a button asked for it. */
  fromGesture: boolean;
};

const DIRECTION: Record<AnswerKind, Direction> = {
  like: 'right',
  super_like: 'right',
  seen_rewatch: 'right',
  nope: 'left',
  seen: 'up',
};

export function useFlights(answer: (kind: AnswerKind) => AnsweredCard | null) {
  const [flying, setFlying] = useState<Flying[]>([]);

  /** Answers the top card and sets it flying; null when there was nothing to answer. */
  const throwCard = useCallback(
    (kind: AnswerKind, fromGesture: boolean, direction?: Direction): Flying | null => {
      const done = answer(kind);
      if (!done) return null;
      haptics.throw();
      const flight: Flying = {
        card: done.card,
        kind,
        direction: direction ?? DIRECTION[kind],
        flipped: done.flipped,
        fromGesture,
      };
      setFlying((list) => [...list, flight]);
      return flight;
    },
    [answer],
  );

  const landed = useCallback((titleId: number) => {
    setFlying((list) => list.filter((f) => f.card.title_id !== titleId));
  }, []);

  return { flying, throwCard, landed };
}
