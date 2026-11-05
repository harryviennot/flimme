import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TabBar, type TabBarItem } from '@/components/ui/tab-bar';
import { tokens } from '@/theme/generated/tokens';

// The home tabs (tab-bar.md): Play and My films. Rooms, host, join and Settings are stacks over
// this group in the root layout, so the bar never shows in them. Switching is instant.
export default function TabsLayout() {
  const { t } = useTranslation();
  const items: Record<string, Omit<TabBarItem, 'key'>> = {
    play: { label: t('tabs.play'), icon: 'play' },
    'my-films': { label: t('tabs.myFilms'), icon: 'film' },
  };
  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: { backgroundColor: tokens.color['bg-canvas'] },
      }}
      tabBar={({ state, navigateToTab }) => (
        <TabBar
          items={state.routes.flatMap((route) => {
            const item = items[route.name];
            return item ? [{ key: route.name, ...item }] : [];
          })}
          selected={state.routes[state.index]?.name ?? 'play'}
          onSelect={(key) => navigateToTab(state.routes.find((r) => r.name === key)?.key ?? key)}
        />
      )}
    >
      <Tabs.Screen name="play" />
      <Tabs.Screen name="my-films" />
    </Tabs>
  );
}
