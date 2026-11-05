import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { WhereToWatch } from './where-to-watch';

export const gallery: GalleryEntry = {
  name: 'WhereToWatch',
  tier: 'shared',
  description:
    "The services that have a film, the JustWatch credit and TMDB's watch page. Takes the line for when none has it.",
  render: () => (
    <View className="gap-6">
      <WhereToWatch
        services={[
          { id: 1, name: 'Netflix' },
          { id: 2, name: 'Canal+' },
        ]}
        watchLink="https://example.com"
        servicesLabel="Netflix and Canal+"
        notListed="None of your services has it any more."
      />
      <WhereToWatch
        services={[]}
        watchLink={null}
        servicesLabel=""
        notListed="None of your services has it any more."
      />
    </View>
  ),
};
