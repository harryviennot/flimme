import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
// Gesture Handler's ScrollView: a plain one paints nothing inside a formSheet (see the film sheet).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

import { SeatRow } from '@/components/shared/seat-row';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { toAvatarColor } from '@/features/profile';
import { useMySeat, useRoomPresence, useRoomSeats } from '@/features/room';
import { filmsShown, pillsFor } from '@/features/swipe/pills';

// The players sheet (swipe.md#the-players-sheet): who is in the game, how far each is, who is
// done and who is away. A tap on a row but your own opens the seat sheet in its place (Report
// for everyone, Remove for the host). The game keeps running under it. Never anyone's answers.
export function PlayersSheet({ roomId }: { roomId: string }) {
  const { t } = useTranslation('swipe');
  const { t: tc } = useTranslation('common');
  const seats = useRoomSeats(roomId).data;
  const me = useMySeat(roomId);
  const { online, away, progress } = useRoomPresence(roomId);

  // This phone's own numbers come from its seat's presence, which it sends on every answer.
  const mine = me ? progress.get(me.member_id) : undefined;
  const pills = pillsFor({
    seats,
    online,
    away,
    progress,
    myId: me?.member_id,
    myCount: mine?.swipe_count ?? me?.swipe_count ?? 0,
    myDone: mine?.done ?? false,
  });

  return (
    <GestureHandlerRootView>
      <ScrollView className="bg-bg-canvas" contentContainerClassName="gap-3 p-5">
        <View className="flex-row items-center justify-between">
          <Text variant="display-s" accessibilityRole="header">
            {t('players.title')}
          </Text>
          <IconButton
            icon="x"
            variant="plain"
            accessibilityLabel={tc('actions.close')}
            onPress={() => router.back()}
          />
        </View>
        <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
          {pills.map((pill, index) => (
            <SeatRow
              key={pill.memberId}
              name={pill.name}
              color={toAvatarColor(pill.avatarKey)}
              detail={t('players.films', { count: filmsShown(pill) })}
              isHost={pill.isHost}
              isMe={pill.isMe}
              present={pill.online}
              away={pill.away}
              done={pill.done}
              last={index === pills.length - 1}
              onPress={
                pill.isMe
                  ? undefined
                  : () => router.replace(`/room/${roomId}/seat/${pill.memberId}`)
              }
            />
          ))}
        </View>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
