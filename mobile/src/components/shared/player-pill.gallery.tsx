import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { PlayerPill } from './player-pill';

export const gallery: GalleryEntry = {
  name: 'Player pill',
  tier: 'shared',
  description: 'In-game presence: who is swiping and how many cards they have seen.',
  render: () => (
    <View className="flex-row flex-wrap gap-2">
      <PlayerPill name="Harry" color="blue" count={14} online />
      <PlayerPill name="Sam" color="green" count={12} online />
      <PlayerPill name="Jo" color="violet" count={9} />
    </View>
  ),
};
