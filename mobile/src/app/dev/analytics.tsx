import { getLocales } from 'expo-localization';
import { Redirect, router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { useAnalyticsLog } from '@/features/analytics';
import { useMyProfile } from '@/features/profile';
import { analytics } from '@/lib/analytics';

// Development builds only: what analytics would send, in memory (a development build has no key,
// so nothing leaves the phone). Shows the mode now running, every event, every call to the
// client (identify, reset, optOut) and every event dropped, with why.
export default function DevAnalyticsScreen() {
  const { entries, mode } = useAnalyticsLog();
  const country = useMyProfile().data?.country ?? 'none';
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen padded={false} header={<TopBar title="Analytics log" onBack={() => router.back()} />}>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10" testID="dev-analytics">
        <Text variant="body-m" tone="secondary" testID="dev-analytics-mode">
          {`Mode: ${mode}`}
        </Text>
        <Text variant="body-s" tone="muted" testID="dev-analytics-region">
          {`Device region: ${getLocales()[0]?.regionCode ?? 'none'}, profile country: ${country}`}
        </Text>
        <ListRow label="Clear the log" icon="refresh" onPress={() => analytics.clearLog()} />
        {entries.length === 0 ? (
          <Text variant="body-s" tone="muted">
            Nothing yet.
          </Text>
        ) : null}
        <View className="gap-2">
          {[...entries].reverse().map((entry) => (
            <Text
              key={entry.id}
              variant="mono-data"
              tone={entry.kind === 'dropped' ? 'nope' : entry.kind === 'call' ? 'muted' : 'primary'}
              testID={`dev-analytics-${entry.kind}`}
            >
              {[
                entry.kind.toUpperCase(),
                entry.mode,
                entry.name,
                entry.props ? JSON.stringify(entry.props) : '',
                entry.reason ?? '',
              ]
                .filter(Boolean)
                .join(' ')}
            </Text>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
