import { View } from 'react-native';

import { fixturePosters, type GalleryEntry } from '../gallery';
import { ResultRow } from './result-row';

export const gallery: GalleryEntry = {
  name: 'Result row',
  tier: 'shared',
  description: 'Runners-up after a match, ranked by group score.',
  render: () => (
    <View className="gap-3">
      <ResultRow
        rank="02"
        title="The Paper Comet"
        meta="2023 · 1 h 38 · Animation"
        poster={fixturePosters.paperComet}
        likedBy={[
          { name: 'Harry', color: 'blue' },
          { name: 'Sam', color: 'green' },
        ]}
        likes="2 of 3 liked"
      />
      <ResultRow
        rank="03"
        title="Southbound Summer"
        meta="2022 · 1 h 47 · Comedy"
        poster={fixturePosters.southboundSummer}
        likes="2 of 3 liked"
      />
    </View>
  ),
};
