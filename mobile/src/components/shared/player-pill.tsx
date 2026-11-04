import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';

export type PlayerPillProps = {
  name: string;
  color: AvatarColor;
  /** How many cards they've answered. */
  count?: number;
  online?: boolean;
  /** Missing from presence for 90 seconds: no dot, the name muted. */
  away?: boolean;
  /** No cards left: the count reads "Done" in the like tone. */
  done?: boolean;
  /** The crown after the name. */
  isHost?: boolean;
  /** The player's own pill: it says "You" instead of the name. */
  isMe?: boolean;
  /** Opens the seat sheet. Left out for the player's own pill. */
  onPress?: () => void;
  /** What a screen reader hears for a tappable pill (the lobby's "open the options for"). */
  hint?: string;
};

/** Figma "Player pill": who is swiping and how far they are. */
export function PlayerPill({
  name,
  color,
  count,
  online,
  away = false,
  done = false,
  isHost = false,
  isMe = false,
  onPress,
  hint,
}: PlayerPillProps) {
  const { t } = useTranslation('swipe');
  const { t: tl } = useTranslation('lobby');
  const shown = isMe ? t('pills.you') : name;
  const label = [
    away
      ? t('a11y.pillAway', { name: shown })
      : done
        ? t('a11y.done', { name: shown })
        : count !== undefined
          ? t('a11y.pill', { name: shown, count })
          : shown,
    isHost ? tl('a11y.seatHost') : null,
  ]
    .filter(Boolean)
    .join(', ');

  const content = (
    <View className="flex-row items-center gap-2 self-start rounded-pill border border-border-default bg-bg-surface py-1 pr-3 pl-1">
      <Avatar name={name} color={color} online={online && !away} />
      <Text variant="body-m-strong" tone={away ? 'muted' : 'primary'} numberOfLines={1}>
        {shown}
      </Text>
      {isHost ? <Icon name="crown" size={14} color="marquee-default" /> : null}
      {done ? (
        <Text variant="mono-data" tone="like">
          {t('pills.done')}
        </Text>
      ) : count !== undefined ? (
        <Text variant="mono-data" tone="muted">
          {count}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      haptic={false}
      accessibilityLiveRegion="polite"
    >
      {content}
    </Pressable>
  );
}
