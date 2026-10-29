import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Text, type TextVariant } from './text';

const variants: TextVariant[] = [
  'display-xl',
  'display-l',
  'display-m',
  'display-s',
  'title-l',
  'title-m',
  'body-l',
  'body-m',
  'body-m-strong',
  'body-s',
  'mono-data',
  'mono-eyebrow',
  'mono-code',
  'label-button-l',
  'label-button-s',
];

export const gallery: GalleryEntry = {
  name: 'Text',
  tier: 'ui',
  description: 'The 15 type styles. The only component that sets type.',
  render: () => (
    <View className="gap-3">
      {variants.map((variant) => (
        <View key={variant} className="gap-0.5">
          <Text variant="mono-eyebrow" tone="muted">
            {variant}
          </Text>
          <Text variant={variant}>{"Tonight's pick"}</Text>
        </View>
      ))}
      <View className="flex-row flex-wrap gap-3">
        <Text tone="secondary">secondary</Text>
        <Text tone="muted">muted</Text>
        <Text tone="accent">accent</Text>
        <Text tone="marquee">marquee</Text>
        <Text tone="like">like</Text>
        <Text tone="nope">nope</Text>
        <Text tone="neon">neon</Text>
        <Text tone="disabled">disabled</Text>
      </View>
    </View>
  ),
};
