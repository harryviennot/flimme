import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Tag, type TagTone } from './tag';

const tones: TagTone[] = ['neutral', 'accent', 'like', 'nope', 'marquee', 'wildcard'];

export const gallery: GalleryEntry = {
  name: 'Tag',
  tier: 'ui',
  description: 'Small uppercase label with an optional icon. Wildcard marks exploration cards.',
  render: () => (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {tones.map((tone) => (
          <Tag key={tone} label={tone} tone={tone} />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Tag label="Because you all liked Neon Harbor" tone="accent" icon="zap" />
        <Tag label="Netflix" />
        <Tag label="1st choice" tone="accent" />
        <Tag label="Vetoed" tone="nope" icon="ban" />
      </View>
    </View>
  ),
};
