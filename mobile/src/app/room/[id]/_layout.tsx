import { Stack } from 'expo-router';

import { tokens } from '@/theme/generated/tokens';

// Every room screen sits under this layout. Roadmap M4.10 adds what it's for: it
// subscribes to the room's Realtime topics, keeps the room fresh, sends the heartbeat,
// and shows the screen for the room's state (the phone never moves on by itself).
export default function RoomLayout() {
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
