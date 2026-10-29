import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { MarqueeBulbs } from './marquee-bulbs';

export const gallery: GalleryEntry = {
  name: 'Marquee bulbs',
  tier: 'ui',
  description: 'The chasing lights: headers, the match, the winner.',
  render: () => (
    <View className="gap-4">
      <MarqueeBulbs />
      <MarqueeBulbs chasing />
    </View>
  ),
};
