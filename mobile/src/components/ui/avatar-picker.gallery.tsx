import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import type { AvatarColor } from './avatar';
import { AvatarPicker } from './avatar-picker';

const COLORS = ['blue', 'green', 'gold', 'red', 'violet', 'teal'] as const;

function Demo() {
  const [value, setValue] = useState<AvatarColor | null>('gold');
  return (
    <View className="gap-6">
      <AvatarPicker colors={COLORS} value={null} onChange={() => undefined} initial="H" />
      <AvatarPicker colors={COLORS} value={value} onChange={setValue} initial="H" />
      <AvatarPicker colors={COLORS} value="teal" onChange={() => undefined} initial="" />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'AvatarPicker',
  tier: 'ui',
  description:
    'Six color swatches showing the typed initial. None selected, one selected (tap to change), and an empty initial.',
  render: () => <Demo />,
};
