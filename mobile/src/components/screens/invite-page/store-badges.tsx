import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { type Store, storeLinks, storeOrder } from '@/features/invite/invite';

export type StoreBadgesProps = {
  /** Empty until the app exists in the App Store (roadmap M10.1): then nothing shows. */
  appStoreId: string;
  userAgent: string;
};

// Placeholder drawing: the official App Store and Google Play artwork, in each brand's wording,
// replaces these two with the store ids (roadmap M10.1 and M16.4).
const wording = { appStore: 'App Store', googlePlay: 'Google Play' } as const;

/** The two store badges, the device's own store first. Nothing before the store ids exist. */
export function StoreBadges({ appStoreId, userAgent }: StoreBadgesProps) {
  const { t } = useTranslation('web');
  const links = storeLinks(appStoreId);
  if (!links) return null;
  return (
    <View className="flex-row flex-wrap justify-center gap-3">
      {storeOrder(userAgent).map((store: Store) => (
        <Pressable
          key={store}
          accessibilityRole="link"
          accessibilityLabel={t(`badges.${store}`)}
          haptic={false}
          onPress={() => void Linking.openURL(links[store])}
          className="h-11 items-center justify-center rounded-md border border-border-default bg-bg-sunken px-5"
        >
          <Text variant="label-button-s">{wording[store]}</Text>
        </Pressable>
      ))}
    </View>
  );
}
