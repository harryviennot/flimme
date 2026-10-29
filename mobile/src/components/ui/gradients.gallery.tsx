import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { GradientFill, Spotlight } from './gradients';
import { Text } from './text';

export const gallery: GalleryEntry = {
  name: 'Gradients',
  tier: 'ui',
  description: 'Spotlights behind hero content, the card scrim and the marquee sunset.',
  render: () => (
    <View className="gap-3">
      <View className="flex-row gap-3">
        {(['accent', 'like', 'marquee'] as const).map((tone) => (
          <View key={tone} className="h-28 flex-1 overflow-hidden rounded-md bg-bg-canvas">
            <Spotlight tone={tone} />
          </View>
        ))}
      </View>
      <View className="h-28 justify-end overflow-hidden rounded-md bg-neon-default p-3">
        <GradientFill gradient="card-scrim" />
        <Text variant="title-l">Card scrim</Text>
      </View>
      <View className="h-3 overflow-hidden rounded-pill">
        <GradientFill gradient="marquee-sunset" />
      </View>
    </View>
  ),
};
