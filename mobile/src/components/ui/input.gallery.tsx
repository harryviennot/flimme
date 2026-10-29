import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Input } from './input';

function Demo() {
  const [name, setName] = useState('Harry');
  return (
    <View className="gap-4">
      <Input
        label="Your name"
        value={name}
        onChangeText={setName}
        helper="This is how friends see you in the room."
      />
      <Input label="Your name" value="Harry" error="That name is taken in this room." />
      <Input label="Your name" placeholder="Harry" helper="Up to 24 characters." />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Input',
  tier: 'ui',
  description: 'Labelled text field with helper text. Tap one to see the focus glow.',
  render: () => <Demo />,
};
