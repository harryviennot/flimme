import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { toAvatarColor } from '@/features/profile';
import type { Pill } from '@/features/swipe/pills';
import { DEFAULT_STACK_WIDTH, stackCounts, stackLayout } from '@/features/swipe/player-stack';
import { cn } from '@/lib/cn';
import { duration, layout } from '@/theme/motion';

// The top bar's players (swipe.md#the-player-stack): one 28-point avatar per seat, with the online
// dot, a check badge for Done, dimmed when away and a crown for the host. They sit apart while
// they fit, then overlap by 8, then end in a "+N" disc. The whole stack is one button that opens
// the players sheet. Never anything about answers (rule 6).
export function PlayerStack({ pills, onPress }: { pills: readonly Pill[]; onPress: () => void }) {
  const { t } = useTranslation('swipe');
  const [width, setWidth] = useState(DEFAULT_STACK_WIDTH);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next > 0) setWidth(next);
  };

  const mine = pills.find((pill) => pill.isMe);
  const shape = stackLayout(
    width,
    pills.map((pill) => pill.memberId),
    mine?.memberId,
  );
  const shown = shape.visible
    .map((id) => pills.find((pill) => pill.memberId === id))
    .filter((pill): pill is Pill => pill !== undefined);

  const counts = stackCounts(pills);
  const host = pills.find((pill) => pill.isHost);
  const label = [
    t('a11y.players', { count: counts.total, host: host?.name ?? '' }),
    counts.done > 0 ? t('a11y.playersDone', { count: counts.done }) : null,
    counts.away > 0 ? t('a11y.playersAway', { count: counts.away }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityHint={t('a11y.playersHint')}
      onPress={onPress}
      onLayout={onLayout}
      className="h-11 min-w-0 flex-1 flex-row items-center"
      testID="player-stack"
    >
      <View
        className={cn('flex-row items-center', shape.mode === 'spaced' && 'gap-1')}
        pointerEvents="none"
      >
        {shown.map((pill, index) => (
          <Animated.View
            key={pill.memberId}
            entering={layout.popIn}
            exiting={layout.fadeOut}
            layout={LinearTransition.duration(duration.base)}
            className={cn(
              'size-8 items-center justify-center rounded-pill border-2 border-bg-canvas',
              shape.mode === 'overlapped' && index > 0 && '-ml-2',
              pill.away && 'opacity-disabled',
            )}
            // Each disc over the next, so the dots and badges on the right stay visible.
            style={{ zIndex: shown.length - index }}
            testID="player-disc"
          >
            <Avatar
              name={pill.name}
              color={toAvatarColor(pill.avatarKey)}
              online={pill.online && !pill.away && !pill.done}
            />
            {pill.done && !pill.away ? (
              <Animated.View
                entering={layout.popIn}
                className="absolute -right-0.5 -bottom-0.5 size-3.5 items-center justify-center rounded-pill border-2 border-bg-canvas bg-like-default"
                testID="player-done"
              >
                <Icon name="check" size={8} strokeWidth={3} color="text-inverse" />
              </Animated.View>
            ) : null}
            {pill.isHost ? (
              <View className="absolute -top-0.5 -right-0.5 size-3.5 items-center justify-center rounded-pill bg-bg-canvas">
                <Icon name="crown" size={10} color="marquee-default" />
              </View>
            ) : null}
          </Animated.View>
        ))}
        {shape.hidden > 0 ? (
          <View
            className={cn(
              'size-8 items-center justify-center rounded-pill border border-border-default bg-bg-raised',
              shape.mode === 'overlapped' && '-ml-2',
            )}
            style={{ zIndex: 0 }}
          >
            <Text variant="mono-data" tone="secondary" maxFontSizeMultiplier={1.2}>
              {t('players.more', { count: shape.hidden })}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
