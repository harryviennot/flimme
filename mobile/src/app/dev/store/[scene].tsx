import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { isStoreScene, storeLanguage } from '@/features/dev/store-fixtures';
import i18n from '@/i18n';

/**
 * One store screenshot scene on fixture data (docs/store/screenshots.md), development builds
 * only: `flimme-dev://dev/store/swipe?lang=fr`. In any other build the route sends you home, and
 * the scene code is behind `__DEV__`, so a release bundle drops it.
 */
export default function DevStoreScene() {
  const { scene, lang } = useLocalSearchParams<{ scene: string; lang?: string }>();
  const language = storeLanguage(lang);
  const [ready, setReady] = useState(i18n.language === language);

  useEffect(() => {
    if (!__DEV__) return;
    void i18n.changeLanguage(language).then(() => setReady(true));
  }, [language]);

  if (!__DEV__ || !isStoreScene(scene)) return <Redirect href="/" />;
  if (!ready) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StoreSceneView } = require('@/components/screens/dev-store/store-scene');
  return <StoreSceneView scene={scene} language={language} />;
}
