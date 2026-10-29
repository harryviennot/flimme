import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { SwipeAction, type SwipeActionKind } from './swipe-action';

const kinds: SwipeActionKind[] = ['undo', 'nope', 'super', 'like', 'seen'];

export const gallery: GalleryEntry = {
  name: 'Swipe action',
  tier: 'shared',
  description:
    'The swipe screen controls. Press to sink onto the lip; lit while a card is dragged toward it.',
  render: () => (
    <View className="gap-6">
      <View className="flex-row items-end justify-between">
        {kinds.map((kind) => (
          <SwipeAction key={kind} kind={kind} left={2} />
        ))}
      </View>
      <View className="flex-row items-end justify-between">
        {kinds.map((kind) => (
          <SwipeAction key={kind} kind={kind} left={1} lit />
        ))}
      </View>
    </View>
  ),
};
