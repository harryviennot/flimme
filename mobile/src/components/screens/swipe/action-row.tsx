import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SwipeAction } from '@/components/shared/swipe-action';
import type { AnswerKind } from '@/features/swipe/answer';

import { LIT } from './swipe-card';

// The buttons row (swipe.md#the-buttons-row): five buttons in equal columns, with less side
// padding than the screen so the French labels keep their gaps at 375 points wide. Undo is
// drawn disabled until M6.26 so the row's layout is final.

export type ActionRowProps = {
  /** There is a card on top to answer, and the room hasn't moved on. */
  canAnswer: boolean;
  superLikesLeft: number;
  onAnswer: (kind: AnswerKind) => void;
  /** Which button a dragged card lights (`LIT`). */
  lit: SharedValue<number>;
};

export function ActionRow({ canAnswer, superLikesLeft, onAnswer, lit }: ActionRowProps) {
  const { t } = useTranslation('swipe');
  const [litCode, setLitCode] = useState<number>(LIT.none);

  // Changes only when the dragged answer changes, a few times per drag.
  useAnimatedReaction(
    () => lit.get(),
    (value, previous) => {
      if (value !== previous) scheduleOnRN(setLitCode, value);
    },
  );

  return (
    <View className="flex-row items-end justify-between px-2 pb-2">
      <Column>
        <SwipeAction kind="undo" disabled accessibilityHint={t('a11y.undoNone')} />
      </Column>
      <Column>
        <SwipeAction
          kind="nope"
          disabled={!canAnswer}
          lit={litCode === LIT.nope}
          onPress={() => onAnswer('nope')}
        />
      </Column>
      <Column>
        <SwipeAction
          kind="super"
          left={superLikesLeft}
          disabled={!canAnswer || superLikesLeft <= 0}
          accessibilityLabel={
            superLikesLeft > 0
              ? t('a11y.superLeft', { count: superLikesLeft })
              : t('a11y.superNone')
          }
          onPress={() => onAnswer('super_like')}
        />
      </Column>
      <Column>
        <SwipeAction
          kind="like"
          disabled={!canAnswer}
          lit={litCode === LIT.like}
          onPress={() => onAnswer('like')}
        />
      </Column>
      <Column>
        <SwipeAction
          kind="seen"
          disabled={!canAnswer}
          lit={litCode === LIT.seen}
          onPress={() => onAnswer('seen')}
        />
      </Column>
    </View>
  );
}

function Column({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center">{children}</View>;
}
