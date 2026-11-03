import '@/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateGate } from '@/components/screens/update/update-gate';
import { ToastHost } from '@/components/ui/toast';
import '@/features/settings';
import { startSession } from '@/features/session';
import { watchDeviceLanguage } from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { initSentry, reportError, wrapRoot } from '@/lib/sentry';
import { tokens } from '@/theme/generated/tokens';

export { ErrorScreen as ErrorBoundary } from '@/components/shared/error-screen';

initSentry();

function RootLayout() {
  // Fonts are embedded at build time (the expo-font plugin): the first frame has them, so the
  // splash needs no hold.
  useEffect(() => {
    // Not awaited: the `/` route (M4.6) waits for the answer. A real error reaches Sentry;
    // the splash then shows its own error state.
    startSession().catch(reportError);
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
