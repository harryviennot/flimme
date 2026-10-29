import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Avatar, AVATAR_COLORS } from './avatar';

export const gallery: GalleryEntry = {
  name: 'Avatar',
  tier: 'ui',
  description:
    'Player avatar. 10 colors for up to 10 players, assigned in join order, never repeated in a room.',
  render: () => (
    <View className="gap-3">
      {(['s', 'm', 'l'] as const).map((size) => (
        <View key={size} className="flex-row flex-wrap gap-2">
          {AVATAR_COLORS.map((color, i) => (
            <Avatar
              key={color}
              name={'HSJAMOLPKT'[i] ?? 'H'}
              color={color}
              size={size}
              online={i % 3 === 0}
            />
          ))}
        </View>
      ))}
      <View className="flex-row">
        <Avatar name="Harry" color="blue" />
        <Avatar name="Sam" color="green" overlap />
        <Avatar name="Jo" color="violet" overlap />
      </View>
    </View>
  ),
};
