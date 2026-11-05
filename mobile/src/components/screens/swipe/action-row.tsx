import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SwipeAction } from '@/components/shared/swipe-action';
import type { AnswerKind } from '@/features/swipe/answer';

import { LIT } from './swipe-card';

// The buttons row (swipe.md#the-buttons-row): five buttons in equal columns, with less side
// padding than the screen so the French labels keep their gaps at 375 points wide. Undo wakes
// with the first answer and sleeps again after use (once in a row).

export type ActionRowProps = {
  /** There is a card on top to answer, and the room hasn't moved on. */
  canAnswer: boolean;
  superLikesLeft: number;
  /** There is an answer to take back, and it hasn't been yet. */
  canUndo: boolean;
  /** The last card answered is on the shortlist: Undo is off and the hint says why. */
  undoShortlisted?: boolean;
  onUndo: () => void;
  onAnswer: (kind: AnswerKind) => void;
  /** Which button a dragged card lights (`LIT`). */
  lit: SharedValue<number>;
  /** Solo: super likes never run out, so the button shows no count. */
  hideSuperCount?: boolean;
};

export function ActionRow({
  canAnswer,
  superLikesLeft,
  canUndo,
  undoShortlisted = false,
  onUndo,
  onAnswer,
  lit,
  hideSuperCount = false,
}: ActionRowProps) {
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
        <SwipeAction
          kind="undo"
          disabled={!canUndo}
          accessibilityHint={
            canUndo ? undefined : undoShortlisted ? t('a11y.undoShortlisted') : t('a11y.undoNone')
          }
          onPress={onUndo}
        />
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
          left={hideSuperCount ? undefined : superLikesLeft}
          disabled={!canAnswer || superLikesLeft <= 0}
          accessibilityLabel={
            hideSuperCount
              ? t('a11y.actions.superLike')
              : superLikesLeft > 0
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
