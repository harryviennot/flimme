import { Redirect, router } from 'expo-router';
import { DevSettings, ScrollView, View } from 'react-native';

import { ListRow } from '@/components/ui/list-row';
import { OptionCard } from '@/components/ui/option-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Toggle } from '@/components/ui/toggle';
import { TopBar } from '@/components/ui/top-bar';
import { useDevStore } from '@/features/dev';
import { switchBackend } from '@/features/dev/switch-backend';
import { useHintsStore } from '@/features/swipe/hints';
import { useSettingsStore } from '@/features/settings';
import { getConfig, getStagingStatus } from '@/lib/config';

// Development builds only. Later tasks add their entries here (reset the hints and the
// onboarding, clear the vote queue, show the room's state) when the things exist.
// Open it from the Expo dev menu ("Flimme dev menu") or with `flimme-dev:///dev` (three slashes).
export default function DevScreen() {
  const backend = useDevStore((s) => s.backend);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);

  if (!__DEV__) return <Redirect href="/" />;

  const staging = getStagingStatus();
  const running = new URL(getConfig().supabaseUrl).host;
  const choose = (next: 'local' | 'staging') =>
    switchBackend(next, {
      status: staging,
      store: useDevStore,
      reload: () => DevSettings.reload(),
    });

  return (
    <Screen padded={false} header={<TopBar title="Dev" onBack={() => router.back()} />}>
      <ScrollView contentContainerClassName="gap-8 px-5 pb-10" testID="dev-menu">
        <View className="gap-3" testID="dev-backend">
          <Text variant="mono-eyebrow" tone="muted">
            BACKEND
          </Text>
          <Text variant="body-s" tone="secondary">
            {`Running on ${running}. Switching reloads the app; each backend keeps its own session.`}
          </Text>
          <OptionCard
            title="Local"
            description="The Supabase stack on this Mac"
            icon="tv"
            selected={backend === 'local'}
            onPress={() => choose('local')}
          />
          <View className={staging.available ? undefined : 'opacity-disabled'}>
            <OptionCard
              title="Staging"
              description={staging.available ? 'The staging Supabase project' : staging.reason}
              icon="globe"
              selected={backend === 'staging' && staging.available}
              onPress={staging.available ? () => choose('staging') : undefined}
            />
          </View>
        </View>

        <View className="gap-1">
          <Text variant="mono-eyebrow" tone="muted">
            FEEL
          </Text>
          <ListRow
            label="Haptics"
            trailing={
              <Toggle
                value={hapticsEnabled}
                onValueChange={setHapticsEnabled}
                accessibilityLabel="Haptics"
              />
            }
          />
          <ListRow
            label="Sound"
            trailing={
              <Toggle
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                accessibilityLabel="Sound"
              />
            }
          />
        </View>

        <View className="gap-1">
          <Text variant="mono-eyebrow" tone="muted">
            TOOLS
          </Text>
          <ListRow
            label="Open the gallery"
            icon="film"
            onPress={() => router.push('/dev/gallery')}
          />
          <ListRow
            label="Reset the first-game hints"
            icon="refresh"
            onPress={() => useHintsStore.getState().reset()}
          />
          <ListRow label="Test a crash" icon="alert" onPress={() => router.push('/dev/crash')} />
          <ListRow
            label="Play the match overlay"
            icon="star"
            onPress={() => router.push('/dev/match')}
          />
          <ListRow
            label="Play the Final Cut"
            icon="ticket"
            onPress={() => router.push('/dev/final-cut')}
          />
          <ListRow
            label="Realtime spike"
            icon="zap"
            onPress={() => router.push('/dev/realtime-spike')}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
