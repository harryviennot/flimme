import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { TopBar } from './top-bar';

export const gallery: GalleryEntry = {
  name: 'Top bar',
  tier: 'ui',
  description: 'Screen header. Back on the left, one action on the right, centred title.',
  render: () => (
    <View className="-mx-5 gap-2">
      <TopBar
        title="Room setup"
        onBack={() => undefined}
        action={{ icon: 'sliders', accessibilityLabel: 'Filters', onPress: () => undefined }}
      />
      <TopBar title="Lobby" onBack={() => undefined} />
      <TopBar title="Settings" />
    </View>
  ),
};
