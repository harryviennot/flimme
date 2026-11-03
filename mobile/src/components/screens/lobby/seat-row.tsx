import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Pressable } from '@/components/ui/pressable';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { layout } from '@/theme/motion';

export type SeatRowProps = {
  name: string;
  color: AvatarColor;
  /** The seat's service names, already listed ("Netflix, Disney+"). Empty: none known. */
  services: string;
  isHost: boolean;
  isMe: boolean;
  /** In the live channel's presence now: the avatar's dot. */
  present: boolean;
  /** Missing for 90 seconds: the Away tag and a muted name. */
  away: boolean;
  /** No hairline under the last row of the group. */
  last?: boolean;
  /** Only the host menu uses it (M4.13). */
  onPress?: () => void;
};

/** One seat of the lobby (lobby.md#the-seat-row): avatar, name, services, and at most one tag. */
export function SeatRow({
  name,
  color,
  services,
  isHost,
  isMe,
  present,
  away,
  last = false,
  onPress,
}: SeatRowProps) {
  const { t } = useTranslation('lobby');
  const shown = isMe ? t('seat.you', { name }) : name;
  const listed = services || t('seat.noServices');
  const label = [
    t(away ? 'a11y.seatAway' : 'a11y.seatHere', { name: shown }),
    isHost ? t('a11y.seatHost') : null,
    services || null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <>
      <Animated.View entering={layout.popIn}>
        <Avatar name={name} color={color} size="m" online={present} />
      </Animated.View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-m-strong" tone={away ? 'muted' : 'primary'} numberOfLines={1}>
          {shown}
        </Text>
        <Text variant="mono-data" tone="muted" numberOfLines={1}>
          {listed}
        </Text>
      </View>
      {isHost ? (
        <Tag label={t('seat.host')} tone="marquee" icon="crown" />
      ) : away ? (
        <Tag label={t('seat.away')} tone="neutral" />
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
        <Pressable accessibilityLabel={label} onPress={onPress} className={row}>
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
