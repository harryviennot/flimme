import type { GalleryEntry } from '../gallery';
import { EmptyState } from './empty-state';

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
