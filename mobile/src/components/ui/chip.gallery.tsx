import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Chip } from './chip';

function Demo() {
  const [picked, setPicked] = useState(['Cozy']);
  const toggle = (label: string) =>
    setPicked((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  return (
    <View className="flex-row flex-wrap gap-2">
      {['Cozy', 'Laugh', 'Mind-bending', 'Scary', 'Feel-good', 'Background noise'].map((label) => (
        <Chip
          key={label}
          label={label}
          selected={picked.includes(label)}
          onPress={() => toggle(label)}
        />
      ))}
      <Chip label="Disabled" disabled />
    </View>
  );
}

function RadioDemo() {
  const [picked, setPicked] = useState('Any length');
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Time budget"
      className="flex-row flex-wrap gap-2"
    >
      {['Any length', 'Under 1 h 45', 'Under 2 h'].map((label) => (
        <Chip
          key={label}
          role="radio"
          label={label}
          selected={picked === label}
          onPress={() => setPicked(label)}
        />
      ))}
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Chip',
  tier: 'ui',
  description:
    'Selectable filter chip. Checkboxes combine (moods); radios, in a radiogroup View, pick one (time budget, age cap).',
  render: () => (
    <View className="gap-4">
      <Demo />
      <RadioDemo />
    </View>
  ),
};
