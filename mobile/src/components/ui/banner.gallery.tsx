import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Banner } from './banner';

export const gallery: GalleryEntry = {
  name: 'Banner',
  tier: 'ui',
  description: 'A strip over a room screen while the connection is off.',
  render: () => (
    <View className="-mx-5 gap-2">
      <Banner message="Reconnecting..." />
      <Banner message="Offline: 6 swipes waiting" />
      <Banner tone="info" message="Jo is still joining" />
    </View>
  ),
};
