import { View } from 'react-native';

import { fixturePosters, type GalleryEntry } from '../gallery';
import { PosterThumb } from './poster';

export const gallery: GalleryEntry = {
  name: 'Poster thumb',
  tier: 'shared',
  description:
    'Small poster for lists, the Final Cut and the profile. The fictional posters are for mockups only.',
  render: () => (
    <View className="flex-row flex-wrap gap-2">
      {Object.values(fixturePosters).map((source, i) => (
        <PosterThumb key={i} source={source} />
      ))}
      <PosterThumb source={fixturePosters.neonHarbor} size="s" />
    </View>
  ),
};
