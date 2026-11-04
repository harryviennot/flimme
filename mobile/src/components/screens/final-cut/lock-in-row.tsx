import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { LockInSeat } from '@/features/finale/use-final-cut';
import { toAvatarColor } from '@/features/profile';
import { tokens } from '@/theme/generated/tokens';
import { duration, easing, layout, spring } from '@/theme/motion';

// Who has locked in, never what (final-cut.md#who-has-locked-in): the count, then one avatar per
// seat in seat order, dim until it lights up with a check. No names of who has not locked in.

function LockInAvatar({ seat }: { seat: LockInSeat }) {
  const opacity = useSharedValue(seat.locked ? 1 : tokens.opacity.disabled);
  const check = useSharedValue(seat.locked ? 1 : 0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: check.value }],
  }));
  useEffect(() => {
    opacity.set(
      withTiming(seat.locked ? 1 : tokens.opacity.disabled, {
        duration: duration.fast,
        easing: easing.standard,
      }),
    );
    check.set(seat.locked ? withSpring(1, spring.snappy) : 0);
  }, [seat.locked, opacity, check]);

  return (
    <Animated.View exiting={layout.fadeOut} className="relative">
      <Animated.View style={style}>
        <Avatar name={seat.name} color={toAvatarColor(seat.avatarKey)} size="s" />
      </Animated.View>
      <Animated.View
        style={checkStyle}
        className="absolute -right-0.5 -bottom-0.5 size-3.5 items-center justify-center rounded-pill border-2 border-bg-canvas bg-like-default"
      >
        <Icon name="check" size={10} color="text-inverse" strokeWidth={3} />
      </Animated.View>
    </Animated.View>
  );
}

export function LockInRow({
  seats,
  count,
  of,
}: {
  seats: readonly LockInSeat[];
  count: number;
  of: number;
}) {
  const { t } = useTranslation('finale');
  const summary = t('locked.count', { count, of });
  const names = seats.filter((seat) => seat.locked).map((seat) => seat.name);
  const label =
    names.length > 0
      ? t('a11y.lockedRow', {
          names: new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(
            names,
          ),
          summary,
        })
      : t('a11y.lockedRowNone', { summary });

  // A change is announced politely with the count only, never a name. The first read says nothing.
  const before = useRef<number | null>(null);
  useEffect(() => {
    if (before.current !== null && count > before.current) {
      AccessibilityInfo.announceForAccessibility(summary);
    }
    before.current = count;
  }, [count, summary]);

  return (
    <View className="gap-2" accessible accessibilityLabel={label} testID="lock-in-row">
      <Text variant="mono-eyebrow" tone="secondary" importantForAccessibility="no">
        {summary}
      </Text>
      <View className="flex-row flex-wrap gap-2" importantForAccessibility="no-hide-descendants">
        {seats.map((seat) => (
          <LockInAvatar key={seat.memberId} seat={seat} />
        ))}
      </View>
    </View>
  );
}
