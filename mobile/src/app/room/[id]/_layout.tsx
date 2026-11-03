import { router, Stack, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { ErrorScreen } from '@/components/shared/error-screen';
import {
  isAllowed,
  isSheet,
  mySeatOf,
  roomScreenFor,
  useHeartbeat,
  useKeptRoom,
  useRefreshOnForeground,
  useRoom,
  useRoomSeats,
} from '@/features/room';
import { useOnline } from '@/features/network';
import { tokens } from '@/theme/generated/tokens';

// Every room screen sits under this layout. It reads the room and the phone's seat, shows the
// screen the room's state calls for (the phone never moves on by itself), keeps the seat present
// while the app is open and remembers the room on the phone. M4.21 adds the Realtime topics.
export default function RoomLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const segments = useSegments() as string[];
  const current = segments[2];
  const online = useOnline();
  const room = useRoom(id);
  const seats = useRoomSeats(id);
  const { keep, forget } = useKeptRoom();

  const settled = !room.isFetching && !seats.isFetching;
  const mine = mySeatOf(seats.data);
  // Only a fresh answer counts: a cached one may be from before the player (re)joined.
  const notSeated =
    online &&
    settled &&
    room.isSuccess &&
    (room.data === null || (seats.isSuccess && mine === null));
  const state = notSeated ? undefined : room.data?.state;
  const code = room.data?.code;

  useHeartbeat(id, room.data !== null);
  useRefreshOnForeground(id);

  useEffect(() => {
    if (!id) return;
    if (notSeated) {
      forget(id);
      router.replace('/home');
      return;
    }
    if (!state || !code || !mine) return;
    if (state === 'done' || state === 'abandoned') forget(id);
    else keep({ id, code });
  }, [id, notSeated, state, code, mine, keep, forget]);

  useEffect(() => {
    if (!id || !state || !current || isAllowed(state, current)) return;
    // A sheet goes first, so the state's screen replaces the room screen under it.
    if (isSheet(current)) router.dismiss();
    router.replace(`/room/${id}/${roomScreenFor(state)}`);
  }, [id, state, current]);

  if (online && (room.isError || seats.isError) && !room.data) {
    return (
      <ErrorScreen
        error={(room.error ?? seats.error) as Error}
        retry={async () => {
          await Promise.all([room.refetch(), seats.refetch()]);
        }}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Once swiping starts, leaving is an explicit "Leave room", never a back swipe.
        gestureEnabled: false,
        contentStyle: { backgroundColor: tokens.color['bg-canvas'] },
      }}
    >
      <Stack.Screen
        name="invite"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.8],
        }}
      />
      <Stack.Screen
        name="services"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.8],
        }}
      />
      <Stack.Screen
        name="recap"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.9],
        }}
      />
    </Stack>
  );
}
