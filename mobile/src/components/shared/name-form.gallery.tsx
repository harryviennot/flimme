import { useState } from 'react';
import { View } from 'react-native';

import type { AvatarColor } from '../ui/avatar';
import type { GalleryEntry } from '../gallery';
import { NameForm } from './name-form';

function Demo() {
  const [name, setName] = useState('Léa');
  const [color, setColor] = useState<AvatarColor>('violet');
  return (
    <View className="gap-8">
      <NameForm name={name} color={color} onChangeName={setName} onChangeColor={setColor} />
      <NameForm
        name="Grosmot"
        color="red"
        error="That name isn't allowed. Pick another one."
        onChangeName={() => undefined}
        onChangeColor={() => undefined}
      />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'NameForm',
  tier: 'shared',
  description:
    'The color row and the name field, controlled. Type to see the initials follow; the second one shows an error.',
  render: () => <Demo />,
};
