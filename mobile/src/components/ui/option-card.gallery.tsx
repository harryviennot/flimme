import { useState } from 'react';
import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { OptionCard } from './option-card';

function Demo() {
  const [mode, setMode] = useState('quick');
  return (
    <View className="gap-3">
      <OptionCard
        icon="zap"
        title="Quick Match"
        description="Ends at the first film everyone likes."
        selected={mode === 'quick'}
        onPress={() => setMode('quick')}
      />
      <OptionCard
        icon="ticket"
        title="Final Cut"
        description="Swipe for a while, then vote on the top 3."
        selected={mode === 'final'}
        onPress={() => setMode('final')}
      />
      <OptionCard
        icon="heart"
        title="Date Night"
        description="Two players, only films neither of you has seen."
        selected={mode === 'date'}
        onPress={() => setMode('date')}
      />
    </View>
  );
}

export const gallery: GalleryEntry = {
  name: 'Option card',
  tier: 'ui',
  description: 'Radio-style card for one choice.',
  render: () => <Demo />,
};
