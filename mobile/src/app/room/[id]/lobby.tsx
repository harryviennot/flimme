import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RoomBanner } from '@/components/screens/room/room-banner';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';

const TASK = 'M4.11';
const TITLE = 'Lobby';

// A placeholder until M4.11 builds the lobby. It already shows the connection banner under its
// top bar, the way every room screen will.
export default function RoomLobbyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  return (
    <Screen
      header={
        <View>
          <TopBar />
          <RoomBanner roomId={id} />
        </View>
      }
    >
      <View className="flex-1 justify-center gap-3">
        <Text variant="mono-eyebrow" tone="marquee">
          {TASK}
        </Text>
        <Text variant="display-m">{TITLE}</Text>
        <Text tone="secondary">{t('placeholder.body', { task: TASK })}</Text>
      </View>
    </Screen>
  );
}
