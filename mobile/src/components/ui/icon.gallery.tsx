import { View } from 'react-native';

import { icons, type IconName } from '@/theme/generated/icons';

import type { GalleryEntry } from '../gallery';
import { Icon } from './icon';
import { Text } from './text';

export const gallery: GalleryEntry = {
  name: 'Icon',
  tier: 'ui',
  description: 'The 38 icons from the Figma, 24 points, 2-point stroke, recoloured with a token.',
  render: () => (
    <View className="flex-row flex-wrap gap-4">
      {(Object.keys(icons) as IconName[]).map((name) => (
        <View key={name} className="w-16 items-center gap-1">
          <Icon name={name} />
          <Text variant="body-s" tone="muted" numberOfLines={1}>
            {name}
          </Text>
        </View>
      ))}
    </View>
  ),
};
