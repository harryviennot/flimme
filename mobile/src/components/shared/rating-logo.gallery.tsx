import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { RatingLogo } from './rating-logo';

export const gallery: GalleryEntry = {
  name: 'Rating logos',
  tier: 'shared',
  description: 'TMDB and Letterboxd are the only ratings the app shows.',
  render: () => (
    <View className="flex-row items-center gap-5">
      <RatingLogo source="tmdb" />
      <RatingLogo source="letterboxd" />
    </View>
  ),
};
