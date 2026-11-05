import { View } from 'react-native';

import type { GalleryEntry } from '../gallery';
import { LinkText } from './link-text';
import { Text } from './text';

export const gallery: GalleryEntry = {
  name: 'LinkText',
  tier: 'ui',
  description:
    'A text link, underlined in the accent color. A real anchor in a browser (the web pages), Linking elsewhere.',
  render: () => (
    <View className="gap-3">
      <LinkText href="https://flimme.com/en/privacy">Privacy policy</LinkText>
      <LinkText href="mailto:support@flimme.com" variant="body-s">
        support@flimme.com
      </LinkText>
      <Text variant="body-m" tone="secondary">
        Inside a sentence, read the <LinkText href="https://flimme.com/en/terms">terms</LinkText>{' '}
        first.
      </Text>
    </View>
  ),
};
