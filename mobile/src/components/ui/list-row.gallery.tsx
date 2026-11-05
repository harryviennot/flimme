import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { ListRow } from './list-row';
import { Toggle } from './toggle';

function Demo() {
  const [on, setOn] = useState(true);
  return (
    <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
      <ListRow icon="globe" label="Language" value="English" onPress={() => undefined} />
      <ListRow
        icon="shield"
        label="Analytics"
        trailing={<Toggle value={on} onValueChange={setOn} accessibilityLabel="Analytics" />}
      />
      <ListRow
        icon="eye"
        label="A label long enough to wrap onto a second line at the largest text size"
        trailing={<Toggle value={on} onValueChange={setOn} accessibilityLabel="Long" />}
      />
      <ListRow icon="upload" label="Loading" loading onPress={() => undefined} />
      <ListRow icon="mail" label="Disabled" disabled onPress={() => undefined} />
      <ListRow icon="trash" label="Delete my data" tone="danger" onPress={() => undefined} />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'List row',
  tier: 'ui',
  description:
    'Settings and profile rows, grouped on a surface: value, toggle, loading, disabled and the danger tone.',
  render: () => <Demo />,
};
