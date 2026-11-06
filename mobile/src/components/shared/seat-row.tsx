import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { layout } from '@/theme/motion';

export type SeatRowProps = {
  name: string;
  color: AvatarColor;
  /** The line under the name, already worded (the lobby's services, the swipe screen's film count). Empty: none. */
  detail: string;
  isHost: boolean;
  isMe: boolean;
  /** In the live channel's presence now: the avatar's dot. */
  present: boolean;
  /** Missing for 90 seconds: the Away tag and a muted name. */
  away: boolean;
  /** No cards left (the swipe screen's players sheet): the Done tag, unless away. */
  done?: boolean;
  /** No hairline under the last row of the group. */
  last?: boolean;
  /** Opens the seat sheet. Given for every seat but the player's own (Report, and Remove for the host). */
  onPress?: () => void;
};

/**
 * One seat (lobby.md#the-seat-row, swipe.md#the-players-sheet): avatar, name, a detail line and at
 * most one tag: away, then Done, then the host. When the host's tag gives way, a crown follows
 * the name.
 */
export function SeatRow({
  name,
  color,
  detail,
  isHost,
  isMe,
  present,
  away,
  done = false,
  last = false,
  onPress,
}: SeatRowProps) {
  const { t } = useTranslation('lobby');
  const { t: ts } = useTranslation('swipe');
  const shown = isMe ? t('seat.you', { name }) : name;
  const label = [
    away
      ? t('a11y.seatAway', { name: shown })
      : done
        ? ts('a11y.done', { name: shown })
        : t('a11y.seatHere', { name: shown }),
    isHost ? t('a11y.seatHost') : null,
    detail || null,
  ]
    .filter(Boolean)
    .join(', ');

  const hostTagGivesWay = isHost && (away || done);

  const content = (
    <>
      <Animated.View entering={layout.popIn}>
        <Avatar name={name} color={color} size="m" online={present} />
      </Animated.View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1">
          <Text
            variant="body-m-strong"
            tone={away ? 'muted' : 'primary'}
            numberOfLines={1}
            className="shrink"
          >
            {shown}
          </Text>
          {hostTagGivesWay ? <Icon name="crown" size={14} color="marquee-default" /> : null}
        </View>
        {detail ? (
          <Text variant="mono-data" tone="muted" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {away ? (
        <Tag label={t('seat.away')} tone="neutral" />
      ) : done ? (
        <Tag label={ts('pills.done')} tone="like" icon="check" />
      ) : isHost ? (
        <Tag label={t('seat.host')} tone="marquee" icon="crown" />
      ) : null}
    </>
  );

  const row = cn(
    'min-h-14 flex-row items-center gap-3.5 p-4',
    !last && 'border-b border-border-subtle',
  );
  return (
    <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
      {onPress ? (
        <Pressable
          accessibilityLabel={label}
          accessibilityHint={t('a11y.seat', { name })}
          onPress={onPress}
          className={row}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label} className={row}>
          {content}
        </View>
      )}
    </Animated.View>
  );
}
