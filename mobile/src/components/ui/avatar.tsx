import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

// Figma "Avatar": a coloured disc with the player's initial. Ten colours for up to ten
// players, assigned in join order and never repeated in a room.

export const AVATAR_COLORS = [
  'blue',
  'green',
  'gold',
  'red',
  'violet',
  'teal',
  'pink',
  'orange',
  'sky',
  'lime',
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

const discs: Record<AvatarColor, string> = {
  blue: 'bg-avatar-blue',
  green: 'bg-avatar-green',
  gold: 'bg-avatar-gold',
  red: 'bg-avatar-red',
  violet: 'bg-avatar-violet',
  teal: 'bg-avatar-teal',
  pink: 'bg-avatar-pink',
  orange: 'bg-avatar-orange',
  sky: 'bg-avatar-sky',
  lime: 'bg-avatar-lime',
};

const sizes = {
  s: { disc: 'size-7', text: 'avatar-s', dot: 'size-2 left-5 top-5' },
  m: { disc: 'size-10', text: 'avatar-m', dot: 'size-3 left-7 top-7' },
  l: { disc: 'size-16', text: 'avatar-l', dot: 'size-4 left-12 top-12' },
} as const;

export type AvatarProps = {
  name: string;
  color: AvatarColor;
  size?: keyof typeof sizes;
  /** A green dot: the player is here right now. */
  online?: boolean;
  /** Overlaps the previous avatar in a row (avatar stacks). */
  overlap?: boolean;
};

export function Avatar({ name, color, size = 's', online = false, overlap = false }: AvatarProps) {
  const dims = sizes[size];
  return (
    <View
      accessible
      accessibilityLabel={name}
      className={cn(
        'relative items-center justify-center rounded-pill',
        dims.disc,
        discs[color],
        overlap && '-ml-2',
      )}
    >
      <Text variant={dims.text} tone="inverse" accessible={false}>
        {name.trim().charAt(0)}
      </Text>
      {online ? (
        <View
          className={cn(
            'absolute rounded-pill border-2 border-bg-canvas bg-like-default',
            dims.dot,
          )}
        />
      ) : null}
    </View>
  );
}
