import '@/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateGate } from '@/components/screens/update/update-gate';
import { ToastHost } from '@/components/ui/toast';
import { registerDevMenu } from '@/features/dev/dev-menu';
import '@/features/settings';
import { startSession } from '@/features/session';
import { watchDeviceLanguage } from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { initSentry, reportError, wrapRoot } from '@/lib/sentry';
import { fonts } from '@/theme/fonts';
import { tokens } from '@/theme/generated/tokens';

export { ErrorScreen as ErrorBoundary } from '@/components/shared/error-screen';

initSentry();
void SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fonts);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    // Not awaited: the `/` route (M4.6) waits for the answer. A real error reaches Sentry;
    // the splash then shows its own error state.
    startSession().catch(reportError);
  }, []);

  useEffect(() => {
    void registerDevMenu(() => router.push('/dev'));
  }, []);

  useEffect(() => {
    const subscription = watchDeviceLanguage();
    return () => subscription.remove();
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.color['bg-canvas'] }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <UpdateGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tokens.color['bg-canvas'] },
              }}
            />
            <ToastHost />
          </UpdateGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
