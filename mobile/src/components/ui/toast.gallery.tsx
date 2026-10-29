import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { Button } from './button';
import { showToast, Toast } from './toast';

export const gallery: GalleryEntry = {
  name: 'Toast',
  tier: 'ui',
  description: 'Live room events, the near miss, connection warnings.',
  render: () => (
    <View className="gap-3">
      <Toast
        tone="info"
        title="Sam joined the room"
        message="Everyone is in. The host can start."
      />
      <Toast tone="like" title="2 of 3 liked this" message="One more yes and it's a match." />
      <Toast tone="warn" title="Reconnecting..." message="Your swipes are saved and will sync." />
      <Button
        label="Show a toast"
        variant="secondary"
        size="s"
        onPress={() =>
          showToast({
            tone: 'like',
            title: '2 of 3 liked this',
            message: "One more yes and it's a match.",
          })
        }
      />
    </View>
  ),
};
