import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { EmptyState } from './empty-state';
import { Tag } from './tag';

export const gallery: GalleryEntry = {
  name: 'Empty state',
  tier: 'ui',
  description: 'Nothing to show, or something failed: one icon, a title, one action.',
  render: () => (
    <>
      <EmptyState
        icon="film"
        title="Nothing left"
        body="12 films fit tonight's filters. Loosen one to see more."
        action={{ label: 'Change filters', onPress: () => undefined }}
      />
      <EmptyState icon="popcorn" title="That's all your cards" body="Hang tight.">
        <View className="flex-row flex-wrap justify-center gap-1.5">
          <Tag label="Netflix" icon="tv" />
          <Tag label="Under 1 h 45" icon="clock" />
        </View>
      </EmptyState>
      <EmptyState
        icon="alert"
        title="The projector jammed"
        body="Something went wrong."
        action={{ label: 'Try again', onPress: () => undefined }}
        error
      />
    </>
  ),
};
