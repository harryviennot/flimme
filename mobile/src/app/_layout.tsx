import '@/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateGate } from '@/components/screens/update/update-gate';
import { ToastHost } from '@/components/ui/toast';
import { registerDevMenu } from '@/features/dev/dev-menu';
import { watchNetwork } from '@/features/network';
import { useDeviceProfileSync } from '@/features/profile';
import '@/features/settings';
import { startSession, useSession } from '@/features/session';
import { watchDeviceLanguage } from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { initSentry, wrapRoot } from '@/lib/sentry';
import { tokens } from '@/theme/generated/tokens';

export { ErrorScreen as ErrorBoundary } from '@/components/shared/error-screen';

initSentry();

// A link opens the join sheet on a cold start with `/` underneath: it redirects to Home or
// Welcome once the sheet closes, so closing always lands somewhere sensible (join-sheet.md).
export const unstable_settings = { anchor: 'index' };

// Inside the QueryClientProvider: saves the device's language and country, once per launch.
function DeviceProfileSync() {
  const session = useSession();
  useDeviceProfileSync(session?.status === 'ok');
  return null;
}

function RootLayout() {
  // Fonts are embedded at build time (the expo-font plugin): the first frame has them, so the
  // splash needs no hold.
  useEffect(() => {
    // Not awaited: the `/` route waits for the answer. A real error is reported by
    // startSession itself; the splash then shows its error state.
    startSession().catch(() => {});
  }, []);

  useEffect(() => {
    const subscription = watchNetwork();
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void registerDevMenu(() => router.push('/dev'));
  }, []);

  useEffect(() => {
    const subscription = watchDeviceLanguage();
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.color['bg-canvas'] }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <DeviceProfileSync />
          <UpdateGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tokens.color['bg-canvas'] },
              }}
            >
              <Stack.Screen
                name="join/[code]"
                options={{
                  presentation: 'formSheet',
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.7, 1],
                }}
              />
            </Stack>
            <ToastHost />
          </UpdateGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
