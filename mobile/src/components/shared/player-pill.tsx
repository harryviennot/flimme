import { View } from 'react-native';

import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';

export type PlayerPillProps = {
  name: string;
  color: AvatarColor;
  /** How many cards they've answered. */
  count?: number;
  online?: boolean;
};

/** Figma "Player pill": who is swiping and how far they are. */
export function PlayerPill({ name, color, count, online }: PlayerPillProps) {
  return (
    <View className="flex-row items-center gap-2 self-start rounded-pill border border-border-default bg-bg-surface py-1 pr-3 pl-1">
      <Avatar name={name} color={color} online={online} />
      <Text variant="body-m-strong" numberOfLines={1}>
        {name}
      </Text>
      {count !== undefined ? (
        <Text variant="mono-data" tone="muted">
          {count}
        </Text>
      ) : null}
    </View>
  );
}
