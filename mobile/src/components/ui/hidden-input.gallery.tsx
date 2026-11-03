import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { HiddenInput } from './hidden-input';
import { Text } from './text';

function Demo() {
  const [value, setValue] = useState('');
  return (
    <View className="relative h-12 justify-center rounded-md bg-bg-sunken px-4">
      <Text variant="mono-code">{value || 'Type here'}</Text>
      <HiddenInput
        value={value}
        onChangeText={setValue}
        accessibilityLabel="Demo field"
        maxLength={6}
        keyboardType="number-pad"
      />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Hidden input',
  tier: 'ui',
  description:
    'An invisible input over what the screen draws (here a line of text); it owns the value.',
  render: () => <Demo />,
};
