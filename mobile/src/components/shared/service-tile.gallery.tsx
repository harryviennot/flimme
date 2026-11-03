import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { ServiceTile } from './service-tile';

function Demo() {
  const [mine, setMine] = useState(['Netflix', 'Prime', 'Canal+']);
  const toggle = (name: string) =>
    setMine((m) => (m.includes(name) ? m.filter((x) => x !== name) : [...m, name]));
  return (
    <View className="gap-2">
      {[
        ['Netflix', 'Prime', 'Canal+'],
        ['Disney+', 'Max', 'Apple TV+'],
      ].map((row) => (
        <View key={row[0]} className="flex-row gap-2">
          {row.map((name) => (
            <ServiceTile
              key={name}
              name={name}
              selected={mine.includes(name)}
              onPress={() => toggle(name)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Service tile',
  tier: 'shared',
  description: 'Streaming services a player has, or can tap to add.',
  render: () => <Demo />,
};
