import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Skeleton } from './skeleton';

export const gallery: GalleryEntry = {
  name: 'Skeleton',
  tier: 'ui',
  description: 'A pulsing placeholder while content loads.',
  render: () => (
    <View className="flex-row gap-3">
      <Skeleton className="h-27 w-18 rounded-sm" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-32" />
      </View>
    </View>
  ),
};
