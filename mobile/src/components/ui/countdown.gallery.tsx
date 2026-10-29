import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Button } from './button';
import { Countdown } from './countdown';

function Demo() {
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 45_000).toISOString());
  const [urgent] = useState(() => new Date(Date.now() + 8_000).toISOString());
  return (
    <View className="flex-row items-center gap-3">
      <Countdown deadline={deadline} />
      <Countdown deadline={urgent} tick={false} />
      <Button
        label="Restart"
        variant="ghost"
        size="s"
        onPress={() => setDeadline(new Date(Date.now() + 45_000).toISOString())}
      />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Countdown',
  tier: 'ui',
  description: "The Final Cut's timer, red for the last 10 seconds, ticking for the last 5.",
  render: () => <Demo />,
};
