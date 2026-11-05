import { Stack } from 'expo-router';

import { tokens } from '@/theme/generated/tokens';

// My films: the grid, and the film sheet over it (film-sheet.md). The sheet covers the tab bar.
export default function MyFilmsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color['bg-canvas'] },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[title]"
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [1],
        }}
      />
    </Stack>
  );
}
