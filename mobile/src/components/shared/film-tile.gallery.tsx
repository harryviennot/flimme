import { View } from 'react-native';

import { fixturePosters, type GalleryEntry } from '../gallery';
import { FilmTile } from './film-tile';

const W = 109;

export const gallery: GalleryEntry = {
  name: 'FilmTile',
  tier: 'shared',
  description:
    "A film's poster as a tile, with a placeholder when there is none and at most one badge: Picked, or the super like star.",
  render: () => (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <FilmTile
          width={W}
          title="Last Reel at the Roxy"
          year={2021}
          poster={fixturePosters.lastReel}
          accessibilityLabel="Last Reel at the Roxy, 2021"
        />
        <FilmTile
          width={W}
          title="The Extraordinarily Long Title of a Film Nobody Could Remember"
          year={1987}
          poster={null}
          accessibilityLabel="Long title, 1987"
        />
        <FilmTile
          width={W}
          title="Neon Harbor"
          year={2019}
          poster={fixturePosters.neonHarbor}
          badge={{ kind: 'picked', label: 'Picked' }}
          accessibilityLabel="Neon Harbor, 2019, picked"
        />
      </View>
      <View className="flex-row gap-2">
        <FilmTile
          width={W}
          title="The Paper Comet"
          year={2023}
          poster={fixturePosters.paperComet}
          badge={{ kind: 'super' }}
          accessibilityLabel="The Paper Comet, 2023, super liked"
        />
        <FilmTile
          width={W}
          title="Disabled"
          year={null}
          poster={fixturePosters.quietOrchard}
          disabled
          accessibilityLabel="Disabled"
        />
      </View>
    </View>
  ),
};
