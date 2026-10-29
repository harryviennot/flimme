import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { PinBox } from './pin-box';

export const gallery: GalleryEntry = {
  name: 'PIN box',
  tier: 'ui',
  description: 'One digit of a room code: empty, active, filled.',
  render: () => (
    <View className="flex-row gap-2">
      <PinBox digit="4" />
      <PinBox digit="8" />
      <PinBox digit="2" />
      <PinBox active />
      <PinBox />
      <PinBox />
    </View>
  ),
};
