import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { SearchField } from './search-field';

function Demo() {
  const [text, setText] = useState('');
  return (
    <View className="gap-4">
      <SearchField
        accessibilityLabel="Search for a name"
        placeholder="An actor, a director…"
        value={text}
        onChangeText={setText}
      />
      <SearchField accessibilityLabel="Search for a name" value="penelope" busy />
      <SearchField
        accessibilityLabel="Search for a name"
        value="Pénélope Cruz and a name long enough to scroll sideways in the field"
        onChangeText={() => undefined}
      />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Search field',
  tier: 'ui',
  description:
    'A one-line search box on the input surface. Tap it to see the focus glow; the clear button shows with text; busy swaps the icon for a spinner. Turn the text size up to check it keeps its height.',
  render: () => <Demo />,
};
