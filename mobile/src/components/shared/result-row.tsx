import { View } from 'react-native';

import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';

import { PosterThumb, type PosterSource } from './poster';

export type ResultRowProps = {
  /** "02" */
  rank: string;
  title: string;
  meta: string;
  poster: PosterSource;
  /** Who liked it (Party mode, after the pick). Blind mode passes none. */
  likedBy?: { name: string; color: AvatarColor }[];
  /** "2 of 3 liked" */
  likes: string;
};

/** Figma "Result row": a ranked runner-up on the winner screen. */
export function ResultRow({ rank, title, meta, poster, likedBy = [], likes }: ResultRowProps) {
  return (
    <View className="flex-row items-center gap-3.5 self-stretch rounded-lg border border-border-default bg-bg-surface py-3 pr-4 pl-3">
      <Text variant="display-m" tone="marquee">
        {rank}
      </Text>
      <PosterThumb source={poster} size="s" />
      <View className="flex-1 gap-1">
        <Text variant="title-m" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="mono-data" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
        <View className="flex-row items-center gap-2">
          {likedBy.length ? (
            <View className="flex-row">
              {likedBy.map((player, i) => (
                <Avatar key={player.name} name={player.name} color={player.color} overlap={i > 0} />
              ))}
            </View>
          ) : null}
          <Text variant="body-s" tone="secondary">
            {likes}
          </Text>
        </View>
      </View>
    </View>
  );
}
