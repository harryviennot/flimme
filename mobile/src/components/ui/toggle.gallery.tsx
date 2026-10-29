import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Toggle } from './toggle';

function Demo() {
  const [on, setOn] = useState(true);
  return (
    <View className="flex-row gap-4">
      <Toggle value={on} onValueChange={setOn} accessibilityLabel="Hide films anyone has seen" />
      <Toggle value={!on} onValueChange={(v) => setOn(!v)} accessibilityLabel="Opposite" />
      <Toggle
        value={false}
        onValueChange={() => undefined}
        accessibilityLabel="Disabled"
        disabled
      />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Toggle',
  tier: 'ui',
  description: 'On/off switch.',
  render: () => <Demo />,
};
