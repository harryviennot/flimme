import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { SwipeScreen } from '@/components/screens/swipe/swipe-screen';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useMySeat, useRoom } from '@/features/room';

/** The swipe screen (docs/design/screens/swipe.md), shown while the room is `swiping`. */
export default function RoomSwipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMySeat(id);
  const room = useRoom(id).data;
  // The layout only shows this screen to a seated player; the seat is read by then.
  if (!id || !me) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Skeleton className="h-96 w-full rounded-xl" />
        </View>
      </Screen>
    );
  }
  return <SwipeScreen roomId={id} seat={me} hideSeen={room?.seen_rule === 'hide_seen'} />;
}
