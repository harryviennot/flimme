import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { SegmentedControl } from './segmented-control';

function Demo({ keys, labels }: { keys: string[]; labels: string[] }) {
  const [selected, setSelected] = useState(keys[0] ?? '');
  return (
    <SegmentedControl
      segments={keys.map((key, i) => ({ key, label: labels[i] ?? key }))}
      selected={selected}
      onSelect={setSelected}
    />
  );
}

export const gallery: GalleryEntry = {
  name: 'SegmentedControl',
  tier: 'ui',
  description:
    'Two or three segments in one track, one selected on a sliding thumb. Swaps between lists (My films: Liked and Seen); chips filter one list.',
  render: () => (
    <View className="gap-4">
      <Demo keys={['liked', 'seen']} labels={['Liked', 'Seen']} />
      <SegmentedControl
        segments={[
          { key: 'liked', label: 'Liked' },
          { key: 'seen', label: 'Seen' },
        ]}
        selected="seen"
        onSelect={() => undefined}
      />
      <Demo keys={['a', 'b', 'c']} labels={['All', 'With friends', 'Solo']} />
    </View>
  ),
};
