import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { IconButton } from './icon-button';

export const gallery: GalleryEntry = {
  name: 'Icon button',
  tier: 'ui',
  description: 'Round icon-only button: back, settings, share. 40 points.',
  render: () => (
    <View className="flex-row gap-3">
      <IconButton icon="chevron-left" accessibilityLabel="Back" />
      <IconButton icon="settings" accessibilityLabel="Settings" />
      <IconButton icon="share" accessibilityLabel="Share" />
      <IconButton icon="chevron-left" accessibilityLabel="Back" variant="plain" />
      <IconButton icon="sliders" accessibilityLabel="Filters" disabled />
    </View>
  ),
};
