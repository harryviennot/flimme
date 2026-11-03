import '@/global.css';

import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { InvitePage } from '@/components/screens/invite-page/invite-page';
import { useCurrentLink } from '@/components/screens/invite-page/use-current-link';
import { isInvitePath } from '@/features/invite/invite';
import '@/i18n';
import { tokens } from '@/theme/generated/tokens';
import { webFonts } from '@/theme/web-fonts';

/**
 * The web root layout: the export only serves the invite page (app-structure.md). It starts no
 * session, update gate, Sentry or network watcher, so a visitor never creates a guest account.
 * `/join/<code>` shows the route; every other path, the root included, shows the broken link.
 */
export default function WebRootLayout() {
  const { t, i18n } = useTranslation('web');
  const pathname = usePathname();
  const link = useCurrentLink();
  const [fontsLoaded, fontError] = useFonts(webFonts);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = t('invite.metaTitle');
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', t('invite.metaDescription'));
  }, [i18n.language, t]);

  // Until the fonts are in, the page shows the bare canvas (no flash of a fallback font). A font
  // that fails to load shows the page in the fallback rather than nothing.
  const ready = fontsLoaded || fontError !== null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.color['bg-canvas'] }}>
      <StatusBar style="light" />
      {!ready ? null : isInvitePath(pathname) ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tokens.color['bg-canvas'] },
          }}
        />
      ) : (
        <InvitePage link={link} />
      )}
    </GestureHandlerRootView>
  );
}
