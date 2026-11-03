import * as Sentry from '@sentry/react-native';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { variant } from '@/lib/variant';

// Proves that a crash reaches Sentry with readable frames and no user (roadmap M3.9). Development
// and preview builds only: a production build redirects away. Both buttons are meant to crash.
export default function CrashScreen() {
  if (!__DEV__ && variant() !== 'preview') return <Redirect href="/" />;

  return (
    <Screen header={<TopBar title="Test crash" onBack={() => router.back()} />}>
      <View className="flex-1 justify-center gap-4">
        <Text tone="secondary">
          Each button crashes the app on purpose. Reopen it, then look for the event in the Sentry
          project flimme-app. It should show readable frames, and no user and no IP address.
        </Text>
        <Button
          label="JavaScript crash"
          variant="danger"
          onPress={() => {
            throw new Error('Test crash from /dev/crash (JavaScript)');
          }}
        />
        <Button label="Native crash" variant="danger" onPress={() => Sentry.nativeCrash()} />
      </View>
    </Screen>
  );
}
