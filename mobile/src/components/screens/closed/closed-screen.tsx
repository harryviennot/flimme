import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { RoomTicket } from '@/components/shared/room-ticket';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { releaseRoomGuards, useExitRoomToHome, useRoom } from '@/features/room';
import { layout } from '@/theme/motion';

/** Whether the closing time is a real date: a null or unreadable `ended_at` leaves the detail empty. */
function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The room closed (`abandoned`): say kindly that the night is over and send the player Home
 * (closed.md). It makes no call and names no reason: none of the three is anyone's fault.
 */
export function ClosedScreen({ roomId }: { roomId: string }) {
  const { t, i18n } = useTranslation('ending');
  const room = useRoom(roomId).data;
  const exitToHome = useExitRoomToHome();

  const created = parse(room?.created_at);
  const ended = parse(room?.ended_at);
  const leftDetail = created
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(created)
    : '';
  const rightDetail = ended
    ? t('closed.closedAt', {
        time: new Intl.DateTimeFormat(i18n.language, {
          hour: 'numeric',
          minute: '2-digit',
        }).format(ended),
      })
    : '';

  return (
    <Screen
      scroll
      footer={
        <Button
          label={t('closed.home')}
          accessibilityLabel={t('a11y.home')}
          variant="primary"
          size="l"
          block
          onPress={() => {
            releaseRoomGuards();
            exitToHome();
          }}
        />
      }
    >
      <Animated.View entering={layout.fadeIn} className="flex-1 justify-center gap-6 py-6">
        {room ? (
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <RoomTicket
              code={room.code}
              leftDetail={leftDetail}
              rightDetail={rightDetail}
              stamp={t('closed.stamp')}
            />
          </View>
        ) : null}
        <View className="gap-3">
          <Text variant="display-l" align="center" accessibilityRole="header">
            {t('closed.title')}
          </Text>
          <Text variant="body-m" tone="secondary" align="center">
            {t('closed.body')}
          </Text>
        </View>
      </Animated.View>
    </Screen>
  );
}
