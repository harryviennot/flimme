import { Redirect, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { galleryEntries } from '@/components/gallery-registry';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';

// Every ui/ and shared/ component in every state, with the Figma's fictional posters.
// Development builds only. A Maestro flow screenshots it for the designer.
export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <View className="flex-1 bg-bg-canvas" style={{ paddingTop: insets.top }}>
      <TopBar title="Gallery" onBack={() => router.back()} />
      <ScrollView contentContainerClassName="gap-10 px-5 pb-20" testID="gallery">
        {galleryEntries.map((entry) => (
          <View key={entry.name} className="gap-3" testID={`gallery-${entry.name}`}>
            <View className="gap-1 border-b border-border-subtle pb-2">
              <View className="flex-row items-center gap-2">
                <Text variant="display-s">{entry.name}</Text>
                <Tag label={entry.tier} tone={entry.tier === 'ui' ? 'accent' : 'marquee'} />
              </View>
              <Text variant="body-s" tone="secondary">
                {entry.description}
              </Text>
            </View>
            {entry.render()}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
