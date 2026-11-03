import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { PinBox } from './pin-box';

export const gallery: GalleryEntry = {
  name: 'PIN box',
  tier: 'ui',
  description: 'One digit of a room code: empty, active, filled, error.',
  render: () => (
    <View className="gap-4">
      <View className="flex-row gap-2">
        <PinBox digit="4" />
        <PinBox digit="8" />
        <PinBox digit="2" />
        <PinBox active />
        <PinBox />
        <PinBox />
      </View>
      <View className="flex-row gap-2">
        <PinBox digit="4" error />
        <PinBox digit="8" error />
        <PinBox digit="2" error />
        <PinBox digit="9" error />
        <PinBox digit="1" error />
        <PinBox digit="3" error />
      </View>
    </View>
  ),
};
