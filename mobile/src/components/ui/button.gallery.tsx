import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Button, type ButtonVariant } from './button';

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'marquee'];

export const gallery: GalleryEntry = {
  name: 'Button',
  tier: 'ui',
  description: 'Arcade buttons with a hard lip. Press one: it drops onto the lip and pops back.',
  render: () => (
    <View className="gap-4">
      {variants.map((variant) => (
        <View key={variant} className="gap-2">
          <Button label="Host a movie night" variant={variant} icon="plus" />
          <View className="flex-row gap-2">
            <Button label="Share link" variant={variant} size="s" />
            <Button label="Disabled" variant={variant} size="s" disabled />
          </View>
        </View>
      ))}
      <Button label="Loading" loading />
    </View>
  ),
};
