import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { TopBar } from '@/components/ui/top-bar';
import { useSettingsStore } from '@/features/settings';

// Development builds only. M3.15 grows this into the dev menu.
export default function DevScreen() {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen header={<TopBar title="Dev" onBack={() => router.back()} />}>
      <View className="gap-4 px-5" testID="dev-settings">
        <View className="flex-row items-center justify-between">
          <Text variant="body-m">Haptics</Text>
          <Toggle
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            accessibilityLabel="Haptics"
          />
        </View>
        <View className="flex-row items-center justify-between">
          <Text variant="body-m">Sound</Text>
          <Toggle value={soundEnabled} onValueChange={setSoundEnabled} accessibilityLabel="Sound" />
        </View>
      </View>
    </Screen>
  );
}
